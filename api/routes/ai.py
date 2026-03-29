import os
import sys
import json
import queue
import threading
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

import anthropic
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from .market import _refresh_data
from .profile import _load_profile

router = APIRouter(prefix="/ai", tags=["ai"])

PROJECT_ROOT = Path(__file__).parent.parent.parent

SYSTEM_PROMPT = """You are a calm, sharp, senior portfolio analyst — the kind found at a private wealth firm. You write with clarity and intelligence. Your role is to inform and illuminate, not to prescribe. You never give direct instructions.

Core rules:
- Never say "stop", "you must", "you should", "do this". Always use "it may be worth considering", "one observation is", "you might reflect on".
- Every technical term must be followed immediately by a plain-English translation in the same sentence. Example: "Jensen's Alpha of +10.50% — meaning the portfolio has outperformed what would typically be expected given its level of risk."
- Always explain WHY a metric matters to the investor's real experience, not just what it is.
- The portfolio scores are PRE-COMPUTED by the system. Copy them exactly as given in the data — do not recalculate or modify them.
- Be specific and grounded in the exact numbers provided.

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
Volatility, Max Drawdown, VaR 95%, Beta — each with plain-English translation.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4. PERFORMANCE vs BENCHMARK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Actual return vs CAPM expected. Jensen's Alpha in plain terms.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
5. HIDDEN EXPOSURES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ETF overlap, geographic/sector concentration, currency risk.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
6. DIVIDEND INCOME
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total received. If none, note the growth-only nature.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
7. OBSERVATIONS WORTH CONSIDERING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3-4 numbered observations. Each: data point → why it matters → what it could imply.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
8. OVERALL ASSESSMENT
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

# Balanced profile thresholds (mirrors THRESHOLDS.balanced in fixMyPortfolio.ts)
_US_MAX      = 0.70
_CRYPTO_MAX  = 0.08
_VOL_HIGH    = 0.28
_MAX_HHI     = 0.28


def _compute_scores(holdings: list, metrics: dict | None) -> dict:
    """
    5-factor portfolio score (0–100).
    Methodology mirrors fixMyPortfolio.ts so both features show the same number.
    Profile assumed: balanced.
    """
    if not holdings:
        return {"concentration": 0, "risk_adjusted": 0, "drawdown": 0,
                "diversification": 0, "alignment": 0, "overall": 0}

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

    # ── Factor 1: Concentration efficiency (0–30) ────────────────────────────
    concentration = (
        30 if efficiency_ratio >= 0.80 else
        24 if efficiency_ratio >= 0.65 else
        17 if efficiency_ratio >= 0.50 else
        10 if efficiency_ratio >= 0.35 else
        4  if efficiency_ratio >= 0.20 else 0
    )
    if hhi > _MAX_HHI * 1.5:
        concentration = max(0, concentration - 12)
    elif hhi > _MAX_HHI:
        concentration = max(0, concentration - 6)

    # ── Factor 2: Risk-adjusted return (0–25) ────────────────────────────────
    sharpe = metrics.get("sharpe_ratio") or 0
    risk_adjusted = (
        25 if sharpe >= 1.5 else
        20 if sharpe >= 1.0 else
        14 if sharpe >= 0.6 else
        8  if sharpe >= 0.3 else
        3  if sharpe >= 0.0 else 0
    )

    # ── Factor 3: Drawdown control (0–20) ────────────────────────────────────
    mdd = abs(metrics.get("max_drawdown") or 0)
    drawdown = (
        20 if mdd <= 0.10 else
        15 if mdd <= 0.20 else
        9  if mdd <= 0.30 else
        4  if mdd <= 0.40 else 0
    )

    # ── Factor 4: Diversification (0–15) ─────────────────────────────────────
    div = 0
    if has_intl and has_em: div += 8
    elif has_intl:          div += 4
    if us_exposure <= _US_MAX:
        div += round((1 - us_exposure / (_US_MAX + 0.001)) * 3)
    if has_bonds:           div += 4
    if len(asset_types) >= 3: div += 3
    elif len(asset_types) == 2: div += 1
    diversification = min(15, div)

    # ── Factor 5: Profile alignment (0–10) ───────────────────────────────────
    vol = metrics.get("volatility") or 0
    alignment = 10
    if   vol > _VOL_HIGH * 1.5:      alignment -= 10
    elif vol > _VOL_HIGH * 1.2:      alignment -= 7
    elif vol > _VOL_HIGH:            alignment -= 4
    if   us_exposure > _US_MAX + 0.10: alignment -= 3
    elif us_exposure > _US_MAX:        alignment -= 1
    if   crypto_exp > _CRYPTO_MAX * 1.5: alignment -= 3
    elif crypto_exp > _CRYPTO_MAX:       alignment -= 1
    alignment = max(0, alignment)

    overall = concentration + risk_adjusted + drawdown + diversification + alignment

    return {
        "concentration":  concentration,
        "risk_adjusted":  risk_adjusted,
        "drawdown":       drawdown,
        "diversification": diversification,
        "alignment":      alignment,
        "overall":        min(100, max(0, overall)),
    }


_RISK_LABELS = {"conservative": "Conservative", "balanced": "Balanced", "growth": "Growth"}
_GOAL_LABELS  = {"long_term_growth": "Long-term capital growth", "income": "Income generation", "preservation": "Capital preservation"}
_HORIZON_LABELS = {"<2": "Less than 2 years", "2-5": "2–5 years", "5-10": "5–10 years", "10+": "10+ years"}


def _build_context(market_data: dict, profile: dict | None = None) -> str:
    holdings = market_data.get("holdings", [])
    summary = market_data.get("summary", {})
    metrics = market_data.get("metrics") or {}
    scores = _compute_scores(holdings, metrics)

    lines = ["=== PORTFOLIO DATA FOR ANALYSIS ===\n"]

    if profile:
        lines.append("--- INVESTOR PROFILE ---")
        lines.append(f"Risk Appetite:  {_RISK_LABELS.get(profile.get('risk_appetite',''), profile.get('risk_appetite','Unknown'))}")
        lines.append(f"Investment Goal: {_GOAL_LABELS.get(profile.get('goal',''), profile.get('goal','Unknown'))}")
        lines.append(f"Time Horizon:   {_HORIZON_LABELS.get(profile.get('time_horizon',''), profile.get('time_horizon','Unknown'))}")
        lines.append("(Tailor every observation to this investor's stated profile — flag misalignments explicitly)\n")

    lines.append(f"Total Value: £{summary.get('total_value', 0):,.2f}")
    lines.append(f"Total Cost:  £{summary.get('total_cost', 0):,.2f}")
    lines.append(f"Unrealised P&L: £{summary.get('total_pnl', 0):,.2f} ({summary.get('total_pnl_pct', 0):.1f}%)")
    lines.append(f"Total Dividends: £{summary.get('total_dividends', 0):,.2f}")
    lines.append(f"Holdings: {summary.get('holding_count', 0)}")
    lines.append(f"GBP/USD: {summary.get('gbpusd', 1.34):.4f}\n")

    lines.append("--- HOLDINGS ---")
    for h in sorted(holdings, key=lambda x: -(x.get("weight") or 0)):
        lines.append(
            f"{h['ticker']} ({h['type']}) | "
            f"{h['net_shares']:.4f} shares | "
            f"Avg cost: £{h['avg_cost']:.2f} | "
            f"Price: £{h['current_price']:.2f} | "
            f"Value: £{h['market_value']:.2f} | "
            f"P&L: £{h['pnl']:.2f} ({h['pnl_pct']:.1f}%) | "
            f"Weight: {(h['weight'] or 0)*100:.1f}% | "
            f"Dividends: £{h['total_dividends']:.2f}"
        )

    if metrics and "error" not in metrics:
        lines.append("\n--- RISK METRICS ---")
        def fmt(v, pct=False):
            if v is None: return "N/A"
            return f"{v*100:.2f}%" if pct else f"{v:.4f}"

        lines.append(f"Sharpe Ratio:          {fmt(metrics.get('sharpe_ratio'))}")
        lines.append(f"Annualised Return:     {fmt(metrics.get('actual_return'), pct=True)}")
        lines.append(f"Volatility:            {fmt(metrics.get('volatility'), pct=True)}")
        lines.append(f"Beta:                  {fmt(metrics.get('beta'))}")
        lines.append(f"CAPM Expected Return:  {fmt(metrics.get('capm_expected_return'), pct=True)}")
        lines.append(f"Jensen's Alpha:        {fmt(metrics.get('alpha'), pct=True)}")
        lines.append(f"VaR 95% (daily):       {fmt(metrics.get('var_95'), pct=True)}")
        lines.append(f"Max Drawdown:          {fmt(metrics.get('max_drawdown'), pct=True)}")
        lines.append(f"VaR in £:              £{abs((metrics.get('var_95') or 0) * (summary.get('total_value') or 0)):,.2f}")
        lines.append(f"Max Drawdown in £:     £{abs((metrics.get('max_drawdown') or 0) * (summary.get('total_value') or 0)):,.2f}")

    overall = scores["overall"]
    score_label = (
        "Strong"         if overall >= 75 else
        "Moderate"       if overall >= 55 else
        "Needs Attention" if overall >= 35 else
        "At Risk"
    )
    lines.append("\n--- PRE-COMPUTED PORTFOLIO SCORES (copy exactly, assumed balanced profile) ---")
    lines.append(f"Overall Score:              {overall} / 100  ({score_label})")
    lines.append(f"Concentration Efficiency:   {scores['concentration']} / 30")
    lines.append(f"Risk-Adjusted Return:       {scores['risk_adjusted']} / 25")
    lines.append(f"Drawdown Control:           {scores['drawdown']} / 20")
    lines.append(f"Diversification:            {scores['diversification']} / 15")
    lines.append(f"Profile Alignment:          {scores['alignment']} / 10")

    return "\n".join(lines)


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


@router.get("/analysis")
def analysis(token: str):
    """
    Stream AI portfolio analysis as Server-Sent Events.
    Each event: data: {"text": "..."}\n\n
    Final event: data: {"done": true}\n\n
    token: portfolio token passed as query param (EventSource doesn't support headers)
    """
    market_data = _refresh_data(token)
    profile = _load_profile(token)
    context = _build_context(market_data, profile)
    api_key = _get_api_key()

    def generate():
        q: queue.Queue = queue.Queue()

        def run():
            try:
                client = anthropic.Anthropic(api_key=api_key) if api_key else anthropic.Anthropic()
                with client.messages.stream(
                    model="claude-haiku-4-5",
                    max_tokens=2500,
                    system=[{
                        "type": "text",
                        "text": SYSTEM_PROMPT,
                        "cache_control": {"type": "ephemeral"},
                    }],
                    messages=[{"role": "user", "content": context}],
                ) as stream:
                    for chunk in stream.text_stream:
                        q.put(("text", chunk))
                q.put(("done", None))
            except Exception as exc:
                q.put(("error", str(exc)))

        t = threading.Thread(target=run, daemon=True)
        t.start()

        while True:
            kind, value = q.get()
            if kind == "text":
                yield f"data: {json.dumps({'text': value})}\n\n"
            elif kind == "done":
                yield f"data: {json.dumps({'done': True})}\n\n"
                break
            elif kind == "error":
                yield f"data: {json.dumps({'error': value})}\n\n"
                break

        t.join()

    return StreamingResponse(generate(), media_type="text/event-stream")
