import sys
import time
import threading
import httpx
from pathlib import Path
from collections import defaultdict
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from fastapi import APIRouter, HTTPException
import numpy as np
import pandas as pd

from typing import Annotated
from fastapi import Header
from api.routes.cache import (get_cached_refresh, set_cached_refresh,
                              get_cached_performance, set_cached_performance,
                              get_cached_correlation, set_cached_correlation,
                              get_cached_suggestions, set_cached_suggestions,
                              get_cached_rolling, set_cached_rolling,
                              invalidate_refresh_only)

# ── Simple token-bucket rate limiter for market endpoints ─────────────────────
# Max 20 requests per token per minute across all market endpoints

_rate_lock = threading.Lock()
_rate_buckets: dict = defaultdict(lambda: {"count": 0, "window_start": 0.0})
_RATE_LIMIT = 20
_RATE_WINDOW = 60  # seconds


def _check_rate_limit(token: str):
    now = time.time()
    with _rate_lock:
        bucket = _rate_buckets[token]
        if now - bucket["window_start"] > _RATE_WINDOW:
            bucket["count"] = 0
            bucket["window_start"] = now
        bucket["count"] += 1
        if bucket["count"] > _RATE_LIMIT:
            raise HTTPException(
                status_code=429,
                detail="Too many requests. Please wait a moment before refreshing again."
            )

from data.fetcher import (
    fetch_current_prices,
    fetch_historical_data,
    fetch_gbpusd_history,
    fetch_benchmark_data,
    fetch_gbp_usd_rate,
    fetch_gbp_eur_rate,
    fetch_risk_free_rate,
)
from metrics.calculator import calculate_all_metrics
from .portfolio import _load, _compute_stats

router = APIRouter(prefix="/market", tags=["market"])



def _safe_float(v):
    """Convert numpy/pandas floats to plain Python floats; None stays None."""
    if v is None:
        return None
    try:
        f = float(v)
        return None if (f != f) else f   # NaN → None
    except Exception:
        return None


_PERIOD_MAP = {"1M": "1mo", "3M": "3mo", "6M": "6mo", "1Y": "1y", "5Y": "5y"}


def _avg_cost_gbp(holding: dict, gbpusd: float, gbpeur: float) -> float:
    """
    Compute the weighted average cost per share in GBP, correctly converting
    USD and EUR transaction prices using live FX rates.

    _compute_stats() stores avg_cost in whatever currency the user entered —
    this function normalises everything to GBP so cost_basis and P&L are accurate.
    """
    transactions = holding.get("transactions", [])
    buys = [t for t in transactions if t.get("type") == "buy"]
    total_bought = sum(t["shares"] for t in buys)
    if total_bought == 0:
        return 0.0

    def to_gbp(price: float, currency: str) -> float:
        if currency == "USD":
            return price / gbpusd
        if currency == "EUR":
            return price / gbpeur
        return price  # already GBP

    total_gbp_cost = sum(
        t["shares"] * to_gbp(t["price"], t.get("price_currency", "GBP"))
        for t in buys
    )
    return total_gbp_cost / total_bought

@router.get("/correlation")
def correlation(
    x_portfolio_token: Annotated[str, Header()],
    period: str = "1Y",
    method: str = "pearson",
):
    """
    Return a pairwise correlation matrix for all active holdings.
    period: 1M | 3M | 6M | 1Y | 5Y  (default 1Y)
    method: pearson | spearman  (default pearson)

    Response includes portfolio weights and per-pair overlap days for
    weight-adjusted diversification and statistical-confidence scoring.
    """
    _check_rate_limit(x_portfolio_token)
    token = x_portfolio_token
    corr_method = method.lower() if method.lower() in ("pearson", "spearman") else "pearson"
    yf_period = _PERIOD_MAP.get(period.upper(), "1y")

    # ── Cache check ──────────────────────────────────────────────────────────
    cached = get_cached_correlation(token, period.upper(), corr_method)
    if cached is not None:
        return cached

    data = _load(token)
    holdings_raw = data.get("holdings", [])
    stats_map = {h["ticker"]: _compute_stats(h) for h in holdings_raw}
    tickers = [h["ticker"] for h in holdings_raw if stats_map[h["ticker"]]["net_shares"] > 0]

    if len(tickers) < 2:
        return {"tickers": tickers, "matrix": [], "weights": {}, "method": corr_method}

    gbpusd_hist = fetch_gbpusd_history(period=yf_period)
    hist = fetch_historical_data(tickers, period=yf_period, gbpusd_series=gbpusd_hist)
    if hist.empty or hist.shape[1] < 2:
        return {"tickers": tickers, "matrix": [], "weights": {}, "method": corr_method}

    # ── Pairwise correlation with min_periods (no global dropna) ─────────────
    returns = hist.pct_change()
    min_obs = max(30, int(returns.shape[0] * 0.15))  # at least 30 or 15% of period
    corr = returns.corr(method=corr_method, min_periods=min_obs)

    valid = [t for t in tickers if t in corr.columns]
    matrix = []
    for row_t in valid:
        for col_t in valid:
            val = corr.loc[row_t, col_t]
            # Compute pairwise overlap: count of non-NaN rows for both columns
            if row_t == col_t:
                overlap = int(returns[row_t].dropna().shape[0])
            else:
                pair = returns[[row_t, col_t]].dropna()
                overlap = int(pair.shape[0])
            matrix.append({
                "row": row_t,
                "col": col_t,
                "value": _safe_float(val),
                "overlap": overlap,
            })

    # ── Portfolio weights (from current market values) ───────────────────────
    gbpusd = fetch_gbp_usd_rate()
    gbpeur = fetch_gbp_eur_rate()
    prices = fetch_current_prices(valid, gbpusd=gbpusd)
    holding_by_ticker = {h["ticker"]: h for h in holdings_raw}

    mkt_values = {}
    for t in valid:
        s = stats_map[t]
        p = prices.get(t)
        if p and s["net_shares"] > 0:
            mkt_values[t] = p * s["net_shares"]
    total_val = sum(mkt_values.values()) or 1.0
    weights = {t: round(mkt_values.get(t, 0) / total_val, 6) for t in valid}

    result = {
        "tickers": valid,
        "matrix": matrix,
        "weights": weights,
        "method": corr_method,
    }
    set_cached_correlation(token, period.upper(), result, corr_method)
    return result


# ── Diversification candidates ("What should I add?") ───────────────────────

# Common diversifying assets across major asset classes
_DIVERSIFIER_CANDIDATES = {
    "VWRL.L":  {"name": "FTSE All-World (Vanguard)",  "class": "Global Equity"},
    "CSPX.L":  {"name": "S&P 500 (iShares £)",        "class": "US Equity"},
    "IEMA.L":  {"name": "EM Equity (iShares)",        "class": "Emerging Markets"},
    "SGLN.L":  {"name": "Physical Gold (iShares)",    "class": "Commodities"},
    "IGLT.L":  {"name": "UK Gilts (iShares)",         "class": "Bonds"},
    "REIT.L":  {"name": "Global Property (iShares)", "class": "Real Estate"},
    "INRG.L":  {"name": "Clean Energy (iShares)",    "class": "Thematic"},
    "ISAC.L":  {"name": "MSCI ACWI (iShares)",       "class": "Global Equity"},
}


@router.get("/correlation/suggestions")
def correlation_suggestions(
    x_portfolio_token: Annotated[str, Header()],
    period: str = "1Y",
):
    """
    Suggest diversifying assets the user doesn't hold, ranked by how much
    they'd reduce portfolio average correlation.
    """
    _check_rate_limit(x_portfolio_token)
    token = x_portfolio_token
    yf_period = _PERIOD_MAP.get(period.upper(), "1y")

    cached = get_cached_suggestions(token, period.upper())
    if cached is not None:
        return cached

    data = _load(token)
    holdings_raw = data.get("holdings", [])
    stats_map = {h["ticker"]: _compute_stats(h) for h in holdings_raw}
    tickers = [h["ticker"] for h in holdings_raw if stats_map[h["ticker"]]["net_shares"] > 0]

    if len(tickers) < 2:
        return {"suggestions": []}

    # Filter candidates to those not already held
    held_set = set(tickers)
    candidates = {k: v for k, v in _DIVERSIFIER_CANDIDATES.items()
                  if k not in held_set and k.replace(".L", "") not in held_set}
    if not candidates:
        return {"suggestions": []}

    # Fetch all data in one batch: user holdings + candidates
    all_tickers = tickers + list(candidates.keys())
    gbpusd_hist = fetch_gbpusd_history(period=yf_period)
    hist = fetch_historical_data(all_tickers, period=yf_period, gbpusd_series=gbpusd_hist)
    if hist.empty:
        return {"suggestions": []}

    returns = hist.pct_change()

    # Current portfolio avg correlation (among held assets only)
    held_in_hist = [t for t in tickers if t in returns.columns]
    if len(held_in_hist) < 2:
        return {"suggestions": []}
    curr_corr = returns[held_in_hist].corr(min_periods=30)
    n = len(held_in_hist)
    curr_avg = curr_corr.values[np.triu_indices(n, k=1)].mean() if n >= 2 else 0

    suggestions = []
    for cand_ticker, info in candidates.items():
        if cand_ticker not in returns.columns:
            continue

        # Compute avg correlation of candidate vs all held assets
        avg_vs_held = 0.0
        valid_pairs = 0
        for t in held_in_hist:
            pair = returns[[t, cand_ticker]].dropna()
            if len(pair) < 30:
                continue
            r = pair.corr().iloc[0, 1]
            if r == r:  # not NaN
                avg_vs_held += r
                valid_pairs += 1

        if valid_pairs == 0:
            continue
        avg_vs_held /= valid_pairs

        # Estimate new portfolio avg correlation if this asset were added
        # (n existing pairs stay the same, add n new pairs with avg_vs_held)
        existing_pairs = n * (n - 1) / 2
        new_pairs = existing_pairs + n
        new_avg = (curr_avg * existing_pairs + avg_vs_held * n) / new_pairs if new_pairs > 0 else curr_avg
        reduction = curr_avg - new_avg

        suggestions.append({
            "ticker": cand_ticker,
            "name": info["name"],
            "asset_class": info["class"],
            "avg_corr_vs_portfolio": _safe_float(round(avg_vs_held, 4)),
            "estimated_new_avg": _safe_float(round(new_avg, 4)),
            "correlation_reduction": _safe_float(round(reduction, 4)),
        })

    # Sort by largest reduction (most diversifying first)
    suggestions.sort(key=lambda s: s["correlation_reduction"] or 0, reverse=True)

    result = {
        "current_avg_correlation": _safe_float(round(curr_avg, 4)),
        "suggestions": suggestions[:6],
    }
    set_cached_suggestions(token, period.upper(), result)
    return result


@router.get("/correlation/rolling")
def correlation_rolling(
    x_portfolio_token: Annotated[str, Header()],
    period: str = "1Y",
    window: int = 60,
):
    """
    Return rolling correlation time series for the top 3 most-correlated pairs.
    window: rolling window in trading days (default 60)
    """
    _check_rate_limit(x_portfolio_token)
    token = x_portfolio_token
    yf_period = _PERIOD_MAP.get(period.upper(), "1y")
    window = max(20, min(window, 120))

    cached = get_cached_rolling(token, period.upper(), window)
    if cached is not None:
        return cached

    data = _load(token)
    holdings_raw = data.get("holdings", [])
    stats_map = {h["ticker"]: _compute_stats(h) for h in holdings_raw}
    tickers = [h["ticker"] for h in holdings_raw if stats_map[h["ticker"]]["net_shares"] > 0]

    if len(tickers) < 2:
        return {"pairs": [], "dates": []}

    gbpusd_hist = fetch_gbpusd_history(period=yf_period)
    hist = fetch_historical_data(tickers, period=yf_period, gbpusd_series=gbpusd_hist)
    if hist.empty or hist.shape[1] < 2:
        return {"pairs": [], "dates": []}

    returns = hist.pct_change()
    valid = [t for t in tickers if t in returns.columns]
    if len(valid) < 2:
        return {"pairs": [], "dates": []}

    # Identify top 3 most-correlated pairs from static correlation
    static_corr = returns[valid].corr(min_periods=30)

    pairs_ranked = []
    for i in range(len(valid)):
        for j in range(i + 1, len(valid)):
            val = static_corr.iloc[i, j]
            if val == val:  # not NaN
                pairs_ranked.append((valid[i], valid[j], float(val)))
    pairs_ranked.sort(key=lambda x: abs(x[2]), reverse=True)
    top_pairs = pairs_ranked[:3]

    if not top_pairs:
        return {"pairs": [], "dates": []}

    result_pairs = []
    all_dates = None

    for t1, t2, static_val in top_pairs:
        pair_returns = returns[[t1, t2]].dropna()
        if len(pair_returns) < window:
            continue
        rolling = pair_returns[t1].rolling(window).corr(pair_returns[t2]).dropna()
        if rolling.empty:
            continue

        dates = []
        for d in rolling.index:
            try:
                dates.append(str(d.date()))
            except AttributeError:
                dates.append(str(d))

        if all_dates is None:
            all_dates = dates

        result_pairs.append({
            "pair": f"{t1} / {t2}",
            "ticker_a": t1,
            "ticker_b": t2,
            "static_correlation": _safe_float(round(static_val, 4)),
            "values": [_safe_float(round(v, 4)) for v in rolling.values],
            "dates": dates,
        })

    result = {"pairs": result_pairs, "window": window}
    set_cached_rolling(token, period.upper(), window, result)
    return result


def _refresh_data(token: str, benchmark: str = "sp500") -> dict:
    """Core refresh logic, callable by other routes (e.g. AI analysis)."""
    cached = get_cached_refresh(token, benchmark)
    if cached is not None:
        return cached

    data = _load(token)
    holdings_raw = data.get("holdings", [])

    if not holdings_raw:
        return {"holdings": [], "summary": {}, "metrics": None}

    # ── Compute holding stats ─────────────────────────────────────────────────
    stats_map = {h["ticker"]: _compute_stats(h) for h in holdings_raw}
    tickers = [h["ticker"] for h in holdings_raw if stats_map[h["ticker"]]["net_shares"] > 0]

    if not tickers:
        return {"holdings": [], "summary": {}, "metrics": None}

    # ── Fetch market data ─────────────────────────────────────────────────────
    gbpusd = fetch_gbp_usd_rate()
    gbpeur = fetch_gbp_eur_rate()
    prices = fetch_current_prices(tickers, gbpusd=gbpusd)

    # Build a lookup so we can pass the raw holding to _avg_cost_gbp
    holding_by_ticker = {h["ticker"]: h for h in holdings_raw}

    # ── Build enriched holdings ───────────────────────────────────────────────
    total_value = 0.0
    total_cost = 0.0
    total_dividends = 0.0
    enriched = []

    for h in holdings_raw:
        ticker = h["ticker"]
        s = stats_map[ticker]
        if s["net_shares"] <= 0:
            continue

        price = prices.get(ticker)
        market_value = _safe_float(price * s["net_shares"]) if price else None

        # Use FX-normalised cost basis so USD/EUR transaction prices are correct
        avg_cost_gbp = _avg_cost_gbp(holding_by_ticker[ticker], gbpusd, gbpeur)
        cost_basis = s["net_shares"] * avg_cost_gbp

        pnl = _safe_float(market_value - cost_basis) if market_value is not None else None
        pnl_pct = _safe_float(pnl / cost_basis * 100) if (pnl is not None and cost_basis > 0) else None

        if market_value:
            total_value += market_value
        total_cost += cost_basis
        total_dividends += s["total_dividends"]

        enriched.append({
            "ticker": ticker,
            "type": h.get("type", "stock"),
            "net_shares": _safe_float(s["net_shares"]),
            "avg_cost": _safe_float(avg_cost_gbp),
            "current_price": _safe_float(price),
            "market_value": market_value,
            "cost_basis": _safe_float(cost_basis),
            "pnl": pnl,
            "pnl_pct": pnl_pct,
            "total_dividends": _safe_float(s["total_dividends"]),
            "transaction_count": s["transaction_count"],
            "weight": None,  # filled in below
        })

    # ── Weights ───────────────────────────────────────────────────────────────
    for row in enriched:
        if total_value > 0 and row["market_value"] is not None:
            row["weight"] = _safe_float(row["market_value"] / total_value)

    summary = {
        "total_value": _safe_float(total_value),
        "total_cost": _safe_float(total_cost),
        "total_pnl": _safe_float(total_value - total_cost),
        "total_pnl_pct": _safe_float((total_value - total_cost) / total_cost * 100) if total_cost > 0 else None,
        "total_dividends": _safe_float(total_dividends),
        "holding_count": len(enriched),
        "gbpusd": _safe_float(gbpusd),
        "gbpeur": _safe_float(gbpeur),
    }

    # ── Risk metrics ──────────────────────────────────────────────────────────
    # Per-ticker first buy dates — used to mask phantom history (fix 3).
    # Earliest across all tickers determines how far back we fetch data.
    first_buy_dates = {}
    for h in holdings_raw:
        buys = [t["date"][:10] for t in h.get("transactions", []) if t.get("type") == "buy"]
        if buys:
            first_buy_dates[h["ticker"]] = min(buys)
    earliest_date = min(first_buy_dates.values()) if first_buy_dates else None

    # Cost-basis weights: fixed at purchase price, no look-ahead bias (fix 1).
    cost_weights = {
        r["ticker"]: r["cost_basis"]
        for r in enriched
        if r["cost_basis"] and r["cost_basis"] > 0
    }

    metrics = None
    try:
        rf = fetch_risk_free_rate()
        gbpusd_hist = fetch_gbpusd_history(period="1y")
        hist = fetch_historical_data(tickers, start=earliest_date, gbpusd_series=gbpusd_hist)
        bench = fetch_benchmark_data(start=earliest_date, benchmark=benchmark)

        if not hist.empty and not bench.empty and cost_weights:
            raw = calculate_all_metrics(
                hist, cost_weights, bench, rf, first_buy_dates=first_buy_dates
            )
            used_provisional = False

            # New profiles often have very recent buy dates, which can leave too
            # little overlap for stable metrics. Fall back to trailing 1Y on the
            # current holdings composition so users still get directional signals.
            if raw is None:
                hist_fallback = fetch_historical_data(
                    tickers, period="1y", gbpusd_series=gbpusd_hist
                )
                bench_fallback = fetch_benchmark_data(period="1y", benchmark=benchmark)
                if not hist_fallback.empty and not bench_fallback.empty:
                    raw = calculate_all_metrics(
                        hist_fallback, cost_weights, bench_fallback, rf, first_buy_dates=None
                    )
                    used_provisional = raw is not None

            if raw:
                # Serialise: drop Series objects, keep scalars
                metrics = {
                    k: _safe_float(v)
                    for k, v in raw.items()
                    if not isinstance(v, (pd.Series, pd.DataFrame))
                }
                metrics["rf_annual"] = _safe_float(rf)
                metrics["benchmark_used"] = benchmark
                metrics["risk_model"] = (
                    "current_holdings_cost_weighted_provisional"
                    if used_provisional
                    else "current_holdings_cost_weighted"
                )
    except Exception as exc:
        metrics = {"error": str(exc)}

    result = {
        "holdings": enriched,
        "summary": summary,
        "metrics": metrics,
        "refreshed_at": int(time.time()),
    }
    set_cached_refresh(token, result, benchmark)
    return result


@router.get("/refresh")
def refresh(x_portfolio_token: Annotated[str, Header()], benchmark: str = "sp500", force: bool = False):
    _check_rate_limit(x_portfolio_token)
    if force:
        invalidate_refresh_only(x_portfolio_token, benchmark)
    return _refresh_data(x_portfolio_token, benchmark=benchmark)


@router.get("/performance")
def performance(
    x_portfolio_token: Annotated[str, Header()],
    period: str = "1Y",
    benchmark: str = "sp500",
):
    _check_rate_limit(x_portfolio_token)
    """
    Return portfolio vs benchmark cumulative performance (indexed to 100).
    period: 1M | 3M | 6M | 1Y | 5Y  (default 1Y)
    """
    token = x_portfolio_token
    benchmark = benchmark.lower()
    if benchmark not in ("sp500", "ftse100", "msci_world"):
        benchmark = "sp500"

    benchmark_name = {
        "sp500": "S&P 500",
        "ftse100": "FTSE 100",
        "msci_world": "MSCI World",
    }[benchmark]

    cached = get_cached_performance(token, period, benchmark)
    if cached is not None:
        return cached

    yf_period = _PERIOD_MAP.get(period.upper(), "1y")

    data = _load(token)
    holdings_raw = data.get("holdings", [])
    stats_map = {h["ticker"]: _compute_stats(h) for h in holdings_raw}
    tickers = [h["ticker"] for h in holdings_raw if stats_map[h["ticker"]]["net_shares"] > 0]

    if not tickers:
        return {
            "dates": [],
            "portfolio": [],
            "benchmark": [],
            "benchmark_used": benchmark,
            "benchmark_name": benchmark_name,
        }

    gbpusd_hist = fetch_gbpusd_history(period=yf_period)
    hist  = fetch_historical_data(tickers, period=yf_period, gbpusd_series=gbpusd_hist)
    bench = fetch_benchmark_data(period=yf_period, benchmark=benchmark)

    if hist.empty or bench.empty:
        return {
            "dates": [],
            "portfolio": [],
            "benchmark": [],
            "benchmark_used": benchmark,
            "benchmark_name": benchmark_name,
        }

    # GBP-normalised cost-basis weights
    gbpusd = fetch_gbp_usd_rate()
    gbpeur = fetch_gbp_eur_rate()
    holding_by_ticker = {h["ticker"]: h for h in holdings_raw}
    cost_map = {
        t: stats_map[t]["net_shares"] * _avg_cost_gbp(holding_by_ticker[t], gbpusd, gbpeur)
        for t in tickers
    }
    total_cost = sum(cost_map.values()) or 1.0
    weights = {t: cost_map[t] / total_cost for t in tickers}

    valid_tickers = [t for t in tickers if t in hist.columns]
    if not valid_tickers:
        return {
            "dates": [],
            "portfolio": [],
            "benchmark": [],
            "benchmark_used": benchmark,
            "benchmark_name": benchmark_name,
        }

    # Normalise weights so they sum to 1 for the valid subset
    w = np.array([weights.get(t, 0.0) for t in valid_tickers], dtype=float)
    w /= w.sum()

    daily = hist[valid_tickers].pct_change().dropna()
    port_returns = pd.Series(daily.values @ w, index=daily.index)

    bench_returns = bench.pct_change().dropna()

    # Strip timezone from both indices before alignment.
    # yfinance can return UTC-aware or timezone-naive DatetimeIndex depending
    # on ticker type and library version. Mismatched tz causes reindex to
    # silently produce all-NaN, which dropna() then wipes entirely.
    def _strip_tz(s):
        if getattr(s.index, "tz", None) is not None:
            s = s.copy()
            s.index = s.index.tz_localize(None)
        return s

    port_returns  = _strip_tz(port_returns)
    bench_returns = _strip_tz(bench_returns)

    bench_returns = bench_returns.reindex(port_returns.index).dropna()
    port_returns  = port_returns.reindex(bench_returns.index).dropna()

    if len(port_returns) < 2:
        return {
            "dates": [],
            "portfolio": [],
            "benchmark": [],
            "benchmark_used": benchmark,
            "benchmark_name": benchmark_name,
        }

    port_cum  = (1 + port_returns).cumprod() * 100
    bench_cum = (1 + bench_returns).cumprod() * 100

    def to_date(idx):
        try:
            return str(idx.date())
        except AttributeError:
            return str(idx)

    dates = [to_date(d) for d in port_cum.index]

    result = {
        "dates":     dates,
        "portfolio": [_safe_float(v) for v in port_cum.values],
        "benchmark": [_safe_float(v) for v in bench_cum.values],
        "benchmark_used": benchmark,
        "benchmark_name": benchmark_name,
    }
    set_cached_performance(token, period, result, benchmark)
    return result


@router.get("/search")
def search_tickers(q: str, x_portfolio_token: Annotated[str, Header()]):
    """Search for tickers via Yahoo Finance. Returns [{ticker, name, exchange}]."""
    q = q.strip()
    if not q or len(q) > 20:
        return {"results": []}
    try:
        url = "https://query1.finance.yahoo.com/v1/finance/search"
        params = {"q": q, "quotesCount": 8, "newsCount": 0, "listsCount": 0}
        headers = {"User-Agent": "Mozilla/5.0"}
        with httpx.Client(timeout=5) as client:
            resp = client.get(url, params=params, headers=headers)
        data = resp.json()
        results = []
        for item in data.get("quotes", []):
            symbol = item.get("symbol", "")
            name   = item.get("shortname") or item.get("longname") or ""
            exch   = item.get("exchDisp") or item.get("exchange") or ""
            if symbol:
                results.append({"ticker": symbol, "name": name, "exchange": exch})
        return {"results": results}
    except Exception:
        return {"results": []}
