import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from fastapi import APIRouter
import numpy as np
import pandas as pd

from typing import Annotated
from fastapi import Header
from api.routes.cache import (get_cached_refresh, set_cached_refresh,
                              get_cached_performance, set_cached_performance)

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
def correlation(x_portfolio_token: Annotated[str, Header()], period: str = "1Y"):
    """
    Return a pairwise correlation matrix for all active holdings.
    period: 1M | 3M | 6M | 1Y | 5Y  (default 1Y)
    """
    token = x_portfolio_token
    yf_period = _PERIOD_MAP.get(period.upper(), "1y")

    data = _load(token)
    holdings_raw = data.get("holdings", [])
    stats_map = {h["ticker"]: _compute_stats(h) for h in holdings_raw}
    tickers = [h["ticker"] for h in holdings_raw if stats_map[h["ticker"]]["net_shares"] > 0]

    if len(tickers) < 2:
        return {"tickers": tickers, "matrix": []}

    gbpusd_hist = fetch_gbpusd_history(period=yf_period)
    hist = fetch_historical_data(tickers, period=yf_period, gbpusd_series=gbpusd_hist)
    if hist.empty or hist.shape[1] < 2:
        return {"tickers": tickers, "matrix": []}

    corr = hist.pct_change().dropna().corr()
    valid = [t for t in tickers if t in corr.columns]
    matrix = []
    for row_t in valid:
        for col_t in valid:
            val = corr.loc[row_t, col_t]
            matrix.append({
                "row": row_t,
                "col": col_t,
                "value": _safe_float(val),
            })

    return {"tickers": valid, "matrix": matrix}


def _refresh_data(token: str) -> dict:
    """Core refresh logic, callable by other routes (e.g. AI analysis)."""
    cached = get_cached_refresh(token)
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
        bench = fetch_benchmark_data(start=earliest_date)

        if not hist.empty and not bench.empty and cost_weights:
            raw = calculate_all_metrics(hist, cost_weights, bench, rf,
                                        first_buy_dates=first_buy_dates)
            if raw:
                # Serialise: drop Series objects, keep scalars
                metrics = {
                    k: _safe_float(v)
                    for k, v in raw.items()
                    if not isinstance(v, (pd.Series, pd.DataFrame))
                }
    except Exception as exc:
        metrics = {"error": str(exc)}

    result = {
        "holdings": enriched,
        "summary": summary,
        "metrics": metrics,
    }
    set_cached_refresh(token, result)
    return result


@router.get("/refresh")
def refresh(x_portfolio_token: Annotated[str, Header()]):
    return _refresh_data(x_portfolio_token)


@router.get("/performance")
def performance(x_portfolio_token: Annotated[str, Header()], period: str = "1Y"):
    """
    Return portfolio vs S&P 500 cumulative performance (indexed to 100).
    period: 1M | 3M | 6M | 1Y | 5Y  (default 1Y)
    """
    token = x_portfolio_token
    cached = get_cached_performance(token, period)
    if cached is not None:
        return cached

    yf_period = _PERIOD_MAP.get(period.upper(), "1y")

    data = _load(token)
    holdings_raw = data.get("holdings", [])
    stats_map = {h["ticker"]: _compute_stats(h) for h in holdings_raw}
    tickers = [h["ticker"] for h in holdings_raw if stats_map[h["ticker"]]["net_shares"] > 0]

    if not tickers:
        return {"dates": [], "portfolio": [], "benchmark": []}

    gbpusd_hist = fetch_gbpusd_history(period=yf_period)
    hist  = fetch_historical_data(tickers, period=yf_period, gbpusd_series=gbpusd_hist)
    bench = fetch_benchmark_data(period=yf_period)

    if hist.empty or bench.empty:
        return {"dates": [], "portfolio": [], "benchmark": []}

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
        return {"dates": [], "portfolio": [], "benchmark": []}

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
        return {"dates": [], "portfolio": [], "benchmark": []}

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
    }
    set_cached_performance(token, period, result)
    return result
