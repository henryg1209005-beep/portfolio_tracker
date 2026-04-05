import os
import sys
import json
import queue
import threading
import re
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

import numpy as np
import pandas as pd
import yfinance as yf
import anthropic
import pydantic
from fastapi import APIRouter, HTTPException, Header
from fastapi.responses import StreamingResponse

from api import db
from .market import _refresh_data, _safe_float
from .profile import _load_profile
from data.fetcher import (
    fetch_historical_data, fetch_gbpusd_history, fetch_benchmark_data,
    fetch_risk_free_rate, resolve_ticker,
)
from metrics.calculator import (
    _portfolio_returns, sharpe_ratio, volatility, max_drawdown,
    value_at_risk, cornish_fisher_var, TRADING_DAYS,
)

router = APIRouter(prefix="/ai", tags=["ai"])

PROJECT_ROOT = Path(__file__).parent.parent.parent

SYSTEM_PROMPT = """You are a calm, sharp, senior portfolio analyst — the kind found at a private wealth firm. You write with clarity and intelligence. Your role is to inform and illuminate, not to prescribe. You never give direct instructions.

Core rules:
- Never say "stop", "you must", "you should", "do this". Always use "it may be worth considering", "one observation is", "you might reflect on".
- Every technical term must be followed immediately by a plain-English translation in the same sentence. Example: "Jensen's Alpha of +10.50% — meaning the portfolio has outperformed what would typically be expected given its level of risk."
- Always explain WHY a metric matters to the investor's real experience, not just what it is.
- The portfolio scores are PRE-COMPUTED by the system. Copy them exactly as given in the data — do not recalculate or modify them.
- Be specific and grounded in the exact numbers provided.

Mandatory accuracy rules — no exceptions:
- HORIZON TAGS: Every metric you reference must include its horizon tag exactly as labelled in the data (e.g., "Trailing 252d", "Since Inception", "Benchmark Overlap"). Never omit the horizon.
- SHARPE/SORTINO ARE DIMENSIONLESS: Never use "%" or "per unit of volatility" language for Sharpe or Sortino. They are plain ratios. Correct: "Sharpe ratio of 1.08". Incorrect: "1.08% per unit of volatility".
- SCORE CONSISTENCY: Score narrative must match the score value. If Profile Alignment is 8/10 or 9/10, the narrative must reflect strong alignment. If it is 2/10 or 3/10, the narrative must reflect poor alignment. A high score with a negative narrative, or a low score with a positive narrative, is a factual error.
- NO SELF-COMPUTED DELTAS: Never compute your own percentage changes or deltas. Use only the pre-computed deltas explicitly provided in the data. If a delta is not provided, describe direction only (e.g., "improved" or "declined") without a number.
- ALPHA FRAMING: Never use language like "exceptional stock-picking" or "demonstrates skill". Alpha is conditional and noisy. Use: "this may suggest outperformance relative to expected return for this risk level" or "one possible interpretation is...".
- FACT vs INFERENCE: Prefix observed data points with "Data shows:" and interpretations with "This may suggest:" or "One possible reading is:".
- ETF SECTOR DATA: Sector classification for ETFs comes from yfinance top-level metadata — ETF holdings are NOT decomposed into underlying constituents. Any sector inference involving ETFs must be labelled explicitly as "(estimated — ETF look-through not computed)".

Produce the report in this exact structure:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TL;DR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Exactly three bullet points. One short, punchy sentence each. No jargon. No numbers. Make it immediately useful to someone who reads nothing else.
• [Overall portfolio health — one sentence]
• [The single most notable risk right now — one sentence]
• [One thing worth reflecting on — one sentence]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PORTFOLIO SCORE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Copy the pre-computed scores exactly from the data. Five dimensions: Concentration Efficiency (/30), Risk-Adjusted Return (/25), Drawdown Control (/20), Diversification (/15), Profile Alignment (/10). Add one line of plain-English explanation for each.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. PORTFOLIO SNAPSHOT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total value, cost basis, unrealised P&L. Top 3 holdings by weight with a one-line comment on each. Asset mix.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2. SHARPE RATIO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
State the value, then immediately explain it in plain terms.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3. RISK METRICS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Volatility, Max Drawdown, VaR 95% (both historical and Cornish-Fisher), Sortino Ratio, Beta — each with plain-English translation. If rolling trends are provided, comment on whether risk is rising, stable, or falling.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4. PERFORMANCE vs BENCHMARK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Actual return vs CAPM expected. Jensen's Alpha in plain terms.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
5. SECTOR & CORRELATION ANALYSIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Use the sector data and correlation matrix provided. Flag any sector over-concentration, highly correlated pairs (>0.8), and geographic/currency risk.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
6. OBSERVATIONS WORTH CONSIDERING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3-4 numbered observations. Each: data point → why it matters → what it could imply.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
7. OVERALL ASSESSMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Two paragraphs. Honest assessment of construction strengths and areas worth attention.

Rules: Exact numbers only. No disclaimers. Calm, intelligent tone. Target ~1000 words."""


# ── Ticker classification sets (mirrors fixMyPortfolio.ts) ───────────────────
_US_STOCKS = {
    "NVDA","MSFT","AAPL","GOOGL","GOOG","META","AMZN","TSLA","PLTR","AMD",
    "INTC","CRM","NFLX","UBER","PYPL","JPM","BAC","WFC","GS","V","MA",
    "JNJ","PFE","UNH","ABBV","XOM","CVX","DIS","BABA","COIN","HOOD",
    "SNOW","SHOP","SQ","ROKU","ZM","RIVN","LCID","SOFI",
}
_US_ETFS    = {"VUSA","VOO","SPY","QQQ","IVV","VTI","SCHB","VUG","VTV","CSPX","VUAG"}
_GLOBAL_ETFS = {"VWRL","SWLD","HMWO","VEVE","IWRD","ACWI","VT","VHVG"}
_EM_ETFS    = {"VFEM","EEM","VWO","EIMI"}
_UK_STOCKS  = {"SHEL","BP","HSBA","GSK","AZN","LLOY","BARC","RIO","ULVR","DGE","REL","NG"}
_UK_ETFS    = {"HUKX","ISF"}
_BOND_ETFS  = {"IGLT","VGOV","IGLS","SLXX","CORP","AGG","BND","TLT","IEF","LQD","VGSH"}
_CRYPTO     = {"BTC-USD","ETH-USD","BNB-USD","SOL-USD","ADA-USD","XRP-USD","DOGE-USD"}

# Profile-aware thresholds for scoring
_PROFILE_THRESHOLDS = {
    "conservative": {
        "us_max": 0.55, "crypto_max": 0.03, "vol_high": 0.15, "max_hhi": 0.22,
        "sharpe_tiers":   [1.2, 0.8, 0.5, 0.2],   # thresholds for 25/20/14/8/3
        "drawdown_tiers": [0.07, 0.12, 0.18, 0.25],  # thresholds for 20/15/9/4
    },
    "balanced": {
        "us_max": 0.70, "crypto_max": 0.08, "vol_high": 0.28, "max_hhi": 0.28,
        "sharpe_tiers":   [1.5, 1.0, 0.6, 0.3],
        "drawdown_tiers": [0.10, 0.20, 0.30, 0.40],
    },
    "growth": {
        "us_max": 0.85, "crypto_max": 0.15, "vol_high": 0.40, "max_hhi": 0.35,
        "sharpe_tiers":   [1.8, 1.2, 0.7, 0.3],
        "drawdown_tiers": [0.15, 0.30, 0.40, 0.50],
    },
}


def _compute_scores(holdings: list, metrics: dict | None, profile: dict | None = None) -> dict:
    """
    5-factor portfolio score (0–100).
    Thresholds adapt to the user's risk profile (conservative/balanced/growth).
    """
    if not holdings:
        return {"concentration": 0, "risk_adjusted": 0, "drawdown": 0,
                "diversification": 0, "alignment": 0, "overall": 0,
                "profile_used": "balanced"}

    risk_appetite = (profile or {}).get("risk_appetite", "balanced")
    thresholds = _PROFILE_THRESHOLDS.get(risk_appetite, _PROFILE_THRESHOLDS["balanced"])

    metrics = metrics or {}
    weights = [h.get("weight") or 0 for h in holdings]
    n = len(weights)

    # HHI and Effective-N
    hhi = sum(w ** 2 for w in weights) or 1.0
    eff_n = 1 / hhi if hhi > 0 else 0
    efficiency_ratio = eff_n / n if n > 1 else 0

    # Classify holdings
    us_exposure   = 0.0
    crypto_exp    = 0.0
    has_intl      = False
    has_em        = False
    has_bonds     = False
    asset_types   = set()

    for h in holdings:
        ticker = h.get("ticker", "")
        t      = ticker.replace(".L", "").upper()
        atype  = h.get("type", "stock")
        w      = h.get("weight") or 0
        asset_types.add(atype)

        if ticker in _CRYPTO or atype == "crypto":
            crypto_exp += w
        elif t in _US_STOCKS or t in _US_ETFS:
            us_exposure += w
        elif t in _GLOBAL_ETFS:
            us_exposure += w * 0.65   # ~65% US in global ETFs
            has_intl = True
        elif t in _EM_ETFS:
            has_em   = True
            has_intl = True
        elif t in _BOND_ETFS:
            has_bonds = True
        # UK stocks / ETFs: not US, not intl for our purposes

    max_hhi = thresholds["max_hhi"]

    # ── Factor 1: Concentration efficiency (0–30) ────────────────────────────
    concentration = (
        30 if efficiency_ratio >= 0.80 else
        24 if efficiency_ratio >= 0.65 else
        17 if efficiency_ratio >= 0.50 else
        10 if efficiency_ratio >= 0.35 else
        4  if efficiency_ratio >= 0.20 else 0
    )
    if hhi > max_hhi * 1.5:
        concentration = max(0, concentration - 12)
    elif hhi > max_hhi:
        concentration = max(0, concentration - 6)

    # ── Factor 2: Risk-adjusted return (0–25) ────────────────────────────────
    sharpe = metrics.get("sharpe_ratio") or 0
    st = thresholds["sharpe_tiers"]
    risk_adjusted = (
        25 if sharpe >= st[0] else
        20 if sharpe >= st[1] else
        14 if sharpe >= st[2] else
        8  if sharpe >= st[3] else
        3  if sharpe >= 0.0 else 0
    )

    # ── Factor 3: Drawdown control (0–20) ────────────────────────────────────
    mdd = abs(metrics.get("max_drawdown") or 0)
    dt = thresholds["drawdown_tiers"]
    drawdown = (
        20 if mdd <= dt[0] else
        15 if mdd <= dt[1] else
        9  if mdd <= dt[2] else
        4  if mdd <= dt[3] else 0
    )

    # ── Factor 4: Diversification (0–15) ─────────────────────────────────────
    us_max = thresholds["us_max"]
    div = 0
    if has_intl and has_em: div += 8
    elif has_intl:          div += 4
    if us_exposure <= us_max:
        div += round((1 - us_exposure / (us_max + 0.001)) * 3)
    if has_bonds:           div += 4
    if len(asset_types) >= 3: div += 3
    elif len(asset_types) == 2: div += 1
    diversification = min(15, div)

    # ── Factor 5: Profile alignment (0–10) ───────────────────────────────────
    vol_high = thresholds["vol_high"]
    crypto_max = thresholds["crypto_max"]
    vol = metrics.get("volatility") or 0
    alignment = 10
    if   vol > vol_high * 1.5:      alignment -= 10
    elif vol > vol_high * 1.2:      alignment -= 7
    elif vol > vol_high:            alignment -= 4
    if   us_exposure > us_max + 0.10: alignment -= 3
    elif us_exposure > us_max:        alignment -= 1
    if   crypto_exp > crypto_max * 1.5: alignment -= 3
    elif crypto_exp > crypto_max:       alignment -= 1
    alignment = max(0, alignment)

    overall = concentration + risk_adjusted + drawdown + diversification + alignment

    return {
        "concentration":  concentration,
        "risk_adjusted":  risk_adjusted,
        "drawdown":       drawdown,
        "diversification": diversification,
        "alignment":      alignment,
        "overall":        min(100, max(0, overall)),
        "profile_used":   risk_appetite,
    }


_RISK_LABELS = {"conservative": "Conservative", "balanced": "Balanced", "growth": "Growth"}
_GOAL_LABELS  = {"long_term_growth": "Long-term capital growth", "income": "Income generation", "preservation": "Capital preservation"}
_HORIZON_LABELS = {"<2": "Less than 2 years", "2-5": "2–5 years", "5-10": "5–10 years", "10+": "10+ years"}


def _fetch_sector_data(tickers: list[str]) -> dict[str, dict]:
    """Fetch sector and industry for each ticker via yfinance. Returns {ticker: {sector, industry}}."""
    result = {}
    for ticker in tickers:
        sym = resolve_ticker(ticker)
        try:
            info = yf.Ticker(sym).info
            sector = info.get("sector", "Unknown")
            industry = info.get("industry", "Unknown")
            result[ticker] = {"sector": sector, "industry": industry}
        except Exception:
            result[ticker] = {"sector": "Unknown", "industry": "Unknown"}
    return result


def _compute_correlation(tickers: list[str]) -> tuple[list[str], dict]:
    """Compute pairwise correlation for tickers. Returns (valid_tickers, {(t1,t2): corr_value})."""
    if len(tickers) < 2:
        return tickers, {}
    try:
        gbpusd_hist = fetch_gbpusd_history(period="1y")
        hist = fetch_historical_data(tickers, period="1y", gbpusd_series=gbpusd_hist)
        if hist.empty or hist.shape[1] < 2:
            return tickers, {}
        corr = hist.pct_change().dropna().corr()
        valid = [t for t in tickers if t in corr.columns]
        pairs = {}
        for i, t1 in enumerate(valid):
            for t2 in valid[i+1:]:
                val = _safe_float(corr.loc[t1, t2])
                if val is not None:
                    pairs[(t1, t2)] = val
        return valid, pairs
    except Exception:
        return tickers, {}


def _compute_rolling_trends(tickers: list[str], weights: dict, first_buy_dates: dict) -> dict | None:
    """
    Compute key metrics at two windows (full 1Y and trailing 3M) to show trends.
    Returns {"now": {...}, "3m_ago": {...}} or None on failure.
    """
    try:
        rf = fetch_risk_free_rate()
        gbpusd_hist = fetch_gbpusd_history(period="1y")

        # Full 1Y window (current metrics)
        hist_1y = fetch_historical_data(tickers, period="1y", gbpusd_series=gbpusd_hist)
        if hist_1y.empty or len(hist_1y) < 60:
            return None

        port_ret_1y = _portfolio_returns(hist_1y, weights, first_buy_dates)
        if port_ret_1y.empty or len(port_ret_1y) < 60:
            return None

        # Trailing 3M window — last ~63 trading days of the 1Y series
        port_ret_3m = port_ret_1y.iloc[-63:]

        # Also compute metrics for the FIRST half (3M ending ~63 days ago) for comparison
        if len(port_ret_1y) >= 126:
            port_ret_old = port_ret_1y.iloc[-126:-63]
        else:
            return None

        def _metrics_for(ret):
            return {
                "sharpe": _safe_float(sharpe_ratio(ret, rf)),
                "volatility": _safe_float(volatility(ret)),
                "var_95": _safe_float(value_at_risk(ret)),
                "var_95_cf": _safe_float(cornish_fisher_var(ret)),
                "max_drawdown": _safe_float(max_drawdown(ret)),
            }

        return {
            "recent_3m": _metrics_for(port_ret_3m),
            "prior_3m": _metrics_for(port_ret_old),
        }
    except Exception:
        return None


def _build_context(market_data: dict, profile: dict | None = None) -> str:
    holdings = market_data.get("holdings", [])
    summary = market_data.get("summary", {})
    metrics = market_data.get("metrics") or {}
    scores = _compute_scores(holdings, metrics, profile)

    lines = ["=== PORTFOLIO DATA FOR ANALYSIS ===\n"]

    def _fmt_money(v, decimals=2):
        if v is None:
            return "N/A"
        return f"£{v:,.{decimals}f}"

    def _fmt_pct(v, decimals=1):
        if v is None:
            return "N/A"
        return f"{v:.{decimals}f}%"

    if profile:
        lines.append("--- INVESTOR PROFILE ---")
        lines.append(f"Risk Appetite:  {_RISK_LABELS.get(profile.get('risk_appetite',''), profile.get('risk_appetite','Unknown'))}")
        lines.append(f"Investment Goal: {_GOAL_LABELS.get(profile.get('goal',''), profile.get('goal','Unknown'))}")
        lines.append(f"Time Horizon:   {_HORIZON_LABELS.get(profile.get('time_horizon',''), profile.get('time_horizon','Unknown'))}")
        lines.append("(Tailor every observation to this investor's stated profile — flag misalignments explicitly)\n")

    lines.append(f"Total Value: {_fmt_money(summary.get('total_value', 0))}")
    lines.append(f"Total Cost:  {_fmt_money(summary.get('total_cost', 0))}")
    lines.append(
        f"Unrealised P&L: {_fmt_money(summary.get('total_pnl', 0))} "
        f"({_fmt_pct(summary.get('total_pnl_pct', 0), 1)})"
    )
    lines.append(f"Holdings: {summary.get('holding_count', 0)}")
    lines.append(f"GBP/USD: {summary.get('gbpusd', 1.34):.4f}\n")

    lines.append("--- HOLDINGS ---")
    tickers = []
    for h in sorted(holdings, key=lambda x: -(x.get("weight") or 0)):
        tickers.append(h["ticker"])
        lines.append(
            f"{h['ticker']} ({h['type']}) | "
            f"{h['net_shares']:.4f} shares | "
            f"Avg cost: {_fmt_money(h.get('avg_cost'))} | "
            f"Price: {_fmt_money(h.get('current_price'))} | "
            f"Value: {_fmt_money(h.get('market_value'))} | "
            f"P&L: {_fmt_money(h.get('pnl'))} ({_fmt_pct(h.get('pnl_pct'), 1)}) | "
            f"Weight: {(h['weight'] or 0)*100:.1f}%"
        )

    # ── Sector data ──────────────────────────────────────────────────────────
    if tickers:
        sector_data = _fetch_sector_data(tickers)
        lines.append("\n--- SECTOR & INDUSTRY ---")
        sector_weights: dict[str, float] = {}
        for h in holdings:
            t = h["ticker"]
            sec = sector_data.get(t, {}).get("sector", "Unknown")
            ind = sector_data.get(t, {}).get("industry", "Unknown")
            w = (h.get("weight") or 0)
            lines.append(f"{t}: {sec} / {ind}")
            sector_weights[sec] = sector_weights.get(sec, 0) + w
        lines.append("\nSector weights (NOTE: ETF holdings are NOT decomposed into underlying constituents — weights for ETFs reflect yfinance top-level classification only; label any ETF-based sector inference as estimated):")
        for sec, sw in sorted(sector_weights.items(), key=lambda x: -x[1]):
            lines.append(f"  {sec}: {sw*100:.1f}%")

    # ── Correlation matrix ───────────────────────────────────────────────────
    if len(tickers) >= 2:
        valid_corr, pairs = _compute_correlation(tickers)
        if pairs:
            lines.append("\n--- CORRELATION MATRIX (1Y, notable pairs) ---")
            # Show all pairs, highlight high correlations
            for (t1, t2), val in sorted(pairs.items(), key=lambda x: -abs(x[1])):
                flag = " *** HIGH" if abs(val) > 0.8 else ""
                lines.append(f"  {t1} / {t2}: {val:.3f}{flag}")

    # ── Risk metrics ─────────────────────────────────────────────────────────
    if metrics and "error" not in metrics:
        lines.append("\n--- RISK METRICS ---")
        def fmt(v, pct=False):
            if v is None: return "N/A"
            return f"{v*100:.2f}%" if pct else f"{v:.4f}"

        lines.append(f"Sharpe Ratio [Trailing 252d]:              {fmt(metrics.get('sharpe_ratio'))}")
        lines.append(f"Sortino Ratio [Trailing 252d]:             {fmt(metrics.get('sortino_ratio'))}")
        lines.append(f"Annualised Return [Since Inception]:       {fmt(metrics.get('actual_return'), pct=True)}")
        lines.append(f"Volatility [Trailing 252d]:                {fmt(metrics.get('volatility'), pct=True)}")
        lines.append(f"Beta [Benchmark Overlap Window]:           {fmt(metrics.get('beta'))}")
        lines.append(f"CAPM Expected Return [Benchmark Overlap]:  {fmt(metrics.get('capm_expected_return'), pct=True)}")
        lines.append(f"Jensen's Alpha [Trailing 252d]:            {fmt(metrics.get('alpha'), pct=True)}")
        lines.append(f"VaR 95% Historical [Trailing 252d]:        {fmt(metrics.get('var_95'), pct=True)}")
        lines.append(f"VaR 95% Cornish-Fisher [Trailing 252d]:   {fmt(metrics.get('var_95_cf'), pct=True)}")
        lines.append(f"Max Drawdown [Trailing 252d]:              {fmt(metrics.get('max_drawdown'), pct=True)}")
        lines.append(f"Risk-Free Rate [Current]:                  {fmt(metrics.get('rf_annual'), pct=True)}")
        lines.append(f"Benchmark:                                 {metrics.get('benchmark_used', 'sp500')}")

        dd_recovery = metrics.get("drawdown_recovery_days")
        if dd_recovery is not None:
            if dd_recovery >= 0:
                lines.append(f"Drawdown Recovery:     {dd_recovery} trading days")
            else:
                lines.append(f"Drawdown Recovery:     Still in drawdown ({abs(dd_recovery)} days since trough)")

        total_val = summary.get("total_value") or 0
        lines.append(f"VaR in £ (historical): £{abs((metrics.get('var_95') or 0) * total_val):,.2f}")
        lines.append(f"VaR in £ (CF):         £{abs((metrics.get('var_95_cf') or 0) * total_val):,.2f}")
        lines.append(f"Max Drawdown in £:     £{abs((metrics.get('max_drawdown') or 0) * total_val):,.2f}")

    # ── Rolling trends ───────────────────────────────────────────────────────
    if tickers and metrics and "error" not in metrics:
        # Build cost weights for rolling calc
        cost_weights = {
            h["ticker"]: (h.get("cost_basis") or 0)
            for h in holdings if (h.get("cost_basis") or 0) > 0
        }
        first_buy_dates = {}
        # We don't have raw transaction data here, so use empty dict (trends still work)
        trends = _compute_rolling_trends(tickers, cost_weights, first_buy_dates)
        if trends:
            lines.append("\n--- ROLLING METRIC TRENDS (recent 3M vs prior 3M) ---")
            recent = trends["recent_3m"]
            prior = trends["prior_3m"]
            for key, label in [("sharpe", "Sharpe"), ("volatility", "Volatility"),
                               ("var_95", "VaR 95%"), ("max_drawdown", "Max Drawdown")]:
                r = recent.get(key)
                p = prior.get(key)
                if r is not None and p is not None:
                    if key == "volatility":
                        # Higher volatility = worse
                        trend_note = "worsening" if r > p else "improving" if r < p else "stable"
                    elif key in ("var_95", "max_drawdown"):
                        # These are negative; more negative = worse
                        trend_note = "worsening" if r < p else "improving" if r > p else "stable"
                    else:
                        trend_note = "improving" if r > p else "declining" if r < p else "stable"
                    delta_pct = ((r - p) / abs(p) * 100) if p != 0 else 0.0
                    if key in ("volatility", "var_95", "max_drawdown"):
                        lines.append(f"  {label} [Recent 3M vs Prior 3M]: {r*100:.2f}% → {p*100:.2f}% (pre-computed delta: {delta_pct:+.1f}%) — {trend_note}")
                    else:
                        lines.append(f"  {label} [Recent 3M vs Prior 3M]: {r:.4f} → {p:.4f} (pre-computed delta: {delta_pct:+.1f}%) — {trend_note}")

    # ── Portfolio scores ─────────────────────────────────────────────────────
    overall = scores["overall"]
    profile_used = scores.get("profile_used", "balanced")
    score_label = (
        "Strong"         if overall >= 75 else
        "Moderate"       if overall >= 55 else
        "Needs Attention" if overall >= 35 else
        "At Risk"
    )
    lines.append(f"\n--- PRE-COMPUTED PORTFOLIO SCORES (copy exactly, {profile_used} profile thresholds) ---")
    lines.append(f"Overall Score:              {overall} / 100  ({score_label})")
    lines.append(f"Concentration Efficiency:   {scores['concentration']} / 30")
    lines.append(f"Risk-Adjusted Return:       {scores['risk_adjusted']} / 25")
    lines.append(f"Drawdown Control:           {scores['drawdown']} / 20")
    lines.append(f"Diversification:            {scores['diversification']} / 15")
    lines.append(f"Profile Alignment:          {scores['alignment']} / 10")

    return "\n".join(lines)


DAILY_LIMIT = 3  # analyses per user per day


def _check_and_increment(token: str) -> tuple[bool, int]:
    return db.check_and_increment_usage(token, DAILY_LIMIT)


_TOKEN_RE = re.compile(r"^[A-Za-z0-9:_\-]{8,128}$")


def _validate_token(token: str):
    t = (token or "").strip()
    if not _TOKEN_RE.match(t):
        raise HTTPException(status_code=400, detail="Invalid portfolio token")


def _validate_analysis_output(text: str) -> list[str]:
    """
    Hard quality gate for AI analyst output.
    Returns a list of failed rule IDs. Empty list means pass.
    """
    failed: list[str] = []
    t = text or ""
    tl = t.lower()

    # 1) Mandatory structural sections (allow small title variation on section 4/5)
    required_any = [
        ("TL;DR", ("tl;dr",)),
        ("PORTFOLIO SCORE", ("portfolio score",)),
        ("1. PORTFOLIO SNAPSHOT", ("1. portfolio snapshot",)),
        ("2. SHARPE RATIO", ("2. sharpe ratio",)),
        ("3. RISK METRICS", ("3. risk metrics",)),
        ("4. PERFORMANCE vs BENCHMARK", ("4. performance vs benchmark", "4. performance v benchmark")),
        (
            "5. SECTOR & CORRELATION ANALYSIS",
            (
                "5. sector & correlation analysis",
                "5. sector and correlation analysis",
                "5. hidden exposures",
            ),
        ),
        ("6. OBSERVATIONS WORTH CONSIDERING", ("6. observations worth considering",)),
        ("7. OVERALL ASSESSMENT", ("7. overall assessment",)),
    ]
    for canonical, variants in required_any:
        if not any(v in tl for v in variants):
            failed.append(f"missing_section:{canonical}")

    # 2) Sharpe/Sortino misuse checks (unitless ratios, no % immediately attached to the ratio value)
    if re.search(r"sharpe[^\n]{0,20}\b\d+(?:\.\d+)?\s*%", tl):
        failed.append("sharpe_percent_misuse")
    if re.search(r"sortino[^\n]{0,20}\b\d+(?:\.\d+)?\s*%", tl):
        failed.append("sortino_percent_misuse")

    # 3) Horizon tagging (require at least two tags; avoids brittle hard-fail on one omitted label)
    horizon_tags = ("trailing 252d", "since inception", "benchmark overlap")
    horizon_hits = sum(1 for tag in horizon_tags if tag in tl)
    if horizon_hits < 2:
        failed.append("missing_horizon_tags_minimum")

    # 4) Profile alignment score narrative consistency (coarse guardrail)
    m = re.search(r"profile alignment:\s*(\d+)\s*/\s*10", tl)
    if m:
        score = int(m.group(1))
        neg_words = ("weak alignment", "poor alignment", "misalignment", "not aligned")
        pos_words = ("strong alignment", "well aligned", "good alignment")
        if score >= 8 and any(w in tl for w in neg_words):
            failed.append("profile_alignment_contradiction_high_score_negative_text")
        if score <= 3 and any(w in tl for w in pos_words):
            failed.append("profile_alignment_contradiction_low_score_positive_text")

    # 5) Avoid "skill" overclaim around alpha
    overclaim_patterns = (
        "exceptional stock-picking",
        "demonstrates skill",
        "proves skill",
    )
    if any(p in tl for p in overclaim_patterns):
        failed.append("alpha_overclaim")

    # 6) Fact vs inference labels
    # Do not hard-fail on phrasing style; prompt guidance handles this.

    # 7) ETF look-through caveat if discussing estimated/unknown sector exposure for ETFs
    mentions_etf = (" etf" in tl) or ("etfs" in tl)
    has_sector_estimate = ("estimated" in tl and "sector" in tl)
    has_sector_unknown = bool(re.search(r"unknown.{0,40}sector|sector.{0,40}unknown", tl))
    if mentions_etf and (has_sector_estimate or has_sector_unknown) and ("etf look-through not computed" not in tl):
        failed.append("missing_etf_estimation_caveat")

    # De-duplicate
    return sorted(set(failed))


def _is_hard_quality_failure(failed_rules: list[str]) -> bool:
    """
    Treat quality checks as hard-fail only when structure is clearly broken.
    Minor phrasing/format misses should not block delivery.
    """
    missing_sections = [r for r in failed_rules if r.startswith("missing_section:")]
    if len(missing_sections) >= 3:
        return True
    if "missing_section:TL;DR" in missing_sections and len(missing_sections) >= 2:
        return True
    return False


def _sanitize_report_text(text: str) -> str:
    """
    Remove noisy standalone divider lines (---, ****, long bar separators)
    that degrade frontend readability.
    """
    cleaned: list[str] = []
    for line in (text or "").splitlines():
        t = line.strip()
        if re.fullmatch(r"[-*_]{3,}", t):
            continue
        if re.fullmatch(r"[━─—–=\-]{6,}", t):
            continue
        cleaned.append(line.rstrip())
    return "\n".join(cleaned).strip()


def _get_api_key() -> str | None:
    env_key = os.environ.get("ANTHROPIC_API_KEY")
    if env_key:
        return env_key
    config_path = PROJECT_ROOT / "config.json"
    if config_path.exists():
        try:
            with open(config_path, "r") as f:
                return json.load(f).get("anthropic_api_key")
        except Exception:
            pass
    return None


@router.get("/usage")
def usage(x_portfolio_token: str = Header(default="")):
    """Return today's analysis usage for the token."""
    _validate_token(x_portfolio_token)
    return db.get_usage(x_portfolio_token, DAILY_LIMIT)


@router.post("/analysis")
def analysis(x_portfolio_token: str = Header(default="")):
    """
    Stream AI portfolio analysis as Server-Sent Events.
    Each event: data: {"text": "..."}\n\n
    Final event: data: {"done": true}\n\n
    """
    token = x_portfolio_token
    _validate_token(token)
    allowed, remaining = _check_and_increment(token)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Daily analysis limit reached ({DAILY_LIMIT}/day). Resets at midnight."
        )

    api_key = _get_api_key()

    def generate():
        q: queue.Queue = queue.Queue()

        def run():
            refunded = False
            try:
                market_data = _refresh_data(token)
                profile = _load_profile(token)
                context = _build_context(market_data, profile)
                client = anthropic.Anthropic(api_key=api_key) if api_key else anthropic.Anthropic()
                full_text: list[str] = []
                with client.messages.stream(
                    model="claude-haiku-4-5-20251001",
                    max_tokens=3500,
                    system=[{
                        "type": "text",
                        "text": SYSTEM_PROMPT,
                        "cache_control": {"type": "ephemeral"},
                    }],
                    messages=[{"role": "user", "content": context}],
                ) as stream:
                    for chunk in stream.text_stream:
                        full_text.append(chunk)

                report = _sanitize_report_text("".join(full_text))
                failed_rules = _validate_analysis_output(report)
                if failed_rules and _is_hard_quality_failure(failed_rules):
                    try:
                        db.refund_usage_increment(token)
                    except Exception:
                        pass
                    refunded = True
                    q.put(("error", {
                        "error": "Analysis quality check failed. Please retry.",
                        "code": "analysis_quality_failed",
                        "failed_rules": failed_rules,
                    }))
                    return

                # Emit validated report in chunks to preserve client streaming UX.
                CHUNK = 220
                for i in range(0, len(report), CHUNK):
                    q.put(("text", report[i:i + CHUNK]))
                q.put(("done", None))
            except anthropic.AuthenticationError:
                try:
                    db.refund_usage_increment(token)
                except Exception:
                    pass
                refunded = True
                q.put(("error", {"error": "AI provider authentication failed", "code": "auth"}))
            except anthropic.APIConnectionError:
                try:
                    db.refund_usage_increment(token)
                except Exception:
                    pass
                refunded = True
                q.put(("error", {"error": "AI provider connection failed", "code": "network"}))
            except HTTPException as exc:
                if not refunded:
                    try:
                        db.refund_usage_increment(token)
                    except Exception:
                        pass
                q.put(("error", {"error": str(exc.detail), "code": f"http_{exc.status_code}"}))
            except Exception:
                if not refunded:
                    try:
                        db.refund_usage_increment(token)
                    except Exception:
                        pass
                q.put(("error", {"error": "Analysis failed. Please retry.", "code": "runtime"}))

        t = threading.Thread(target=run, daemon=True)
        t.start()
        # Force headers/body flush quickly so upstream proxies don't time out before first token.
        yield f"data: {json.dumps({'status': 'started'})}\n\n"

        while True:
            try:
                kind, value = q.get(timeout=15)
            except queue.Empty:
                if t.is_alive():
                    # Keepalive heartbeat to prevent idle disconnects while model is running.
                    yield f"data: {json.dumps({'status': 'working'})}\n\n"
                    continue
                yield f"data: {json.dumps({'error': 'Analysis timed out', 'code': 'timeout'})}\n\n"
                break
            if kind == "text":
                yield f"data: {json.dumps({'text': value})}\n\n"
            elif kind == "done":
                yield f"data: {json.dumps({'done': True})}\n\n"
                break
            elif kind == "error":
                yield f"data: {json.dumps(value)}\n\n"
                break

        t.join()

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.post("/analysis_once")
def analysis_once(x_portfolio_token: str = Header(default="")):
    """
    Non-streaming fallback for environments where SSE/proxy streaming is unreliable.
    Returns the full validated report as JSON.
    """
    token = x_portfolio_token
    _validate_token(token)
    allowed, _remaining = _check_and_increment(token)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Daily analysis limit reached ({DAILY_LIMIT}/day). Resets at midnight."
        )

    refunded = False
    try:
        market_data = _refresh_data(token)
        profile = _load_profile(token)
        context = _build_context(market_data, profile)
        api_key = _get_api_key()
        client = anthropic.Anthropic(api_key=api_key) if api_key else anthropic.Anthropic()

        full_text: list[str] = []
        with client.messages.stream(
            model="claude-haiku-4-5-20251001",
            max_tokens=3500,
            system=[{
                "type": "text",
                "text": SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }],
            messages=[{"role": "user", "content": context}],
        ) as stream:
            for chunk in stream.text_stream:
                full_text.append(chunk)

        report = _sanitize_report_text("".join(full_text))
        failed_rules = _validate_analysis_output(report)
        if failed_rules and _is_hard_quality_failure(failed_rules):
            db.refund_usage_increment(token)
            refunded = True
            raise HTTPException(
                status_code=422,
                detail="Analysis quality check failed. Please retry."
            )
        return {"text": report}
    except anthropic.AuthenticationError:
        if not refunded:
            db.refund_usage_increment(token)
        raise HTTPException(status_code=502, detail="AI provider authentication failed")
    except anthropic.APIConnectionError:
        if not refunded:
            db.refund_usage_increment(token)
        raise HTTPException(status_code=502, detail="AI provider connection failed")
    except HTTPException:
        raise
    except Exception:
        if not refunded:
            db.refund_usage_increment(token)
        raise HTTPException(status_code=500, detail="Analysis failed. Please retry.")


# ── Saved Reports ─────────────────────────────────────────────────────────────

class _SaveReportBody(pydantic.BaseModel):
    text: str


@router.get("/reports")
def get_reports(x_portfolio_token: str = Header(default="")):
    """List saved AI reports for the token, newest first."""
    _validate_token(x_portfolio_token)
    return {"reports": db.list_ai_reports(x_portfolio_token)}


@router.post("/reports")
def save_report(body: _SaveReportBody, x_portfolio_token: str = Header(default="")):
    """Save an AI report. Enforces a max of 10 per token."""
    _validate_token(x_portfolio_token)
    if not body.text or not body.text.strip():
        raise HTTPException(status_code=400, detail="Report text is empty")
    report_id = db.save_ai_report(x_portfolio_token, body.text.strip())
    return {"id": report_id, "status": "saved"}


@router.delete("/reports/{report_id}")
def delete_report(report_id: int, x_portfolio_token: str = Header(default="")):
    """Delete a saved report by id, scoped to the token."""
    _validate_token(x_portfolio_token)
    if not db.delete_ai_report(x_portfolio_token, report_id):
        raise HTTPException(status_code=404, detail="Report not found")
    return {"status": "deleted"}
