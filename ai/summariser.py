"""
AI portfolio summarisation using Claude Haiku 4.5.
- Prompt caching: system prompt is cached on Anthropic's side (~10% cost on repeat calls)
- Output caching: last result stored locally; re-used if portfolio hasn't changed
Streams analysis back via a callback so the UI can update incrementally.
"""
import hashlib
import json
import os
import anthropic

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
Copy the pre-computed scores exactly from the data. Then add one line of plain-English explanation for each dimension. Format:

  Overall Score:  [score] / 100

  Diversification:        [score] / 25  [emoji]  [one sentence: why this score]
  Risk-Adjusted Return:   [score] / 25  [emoji]  [one sentence: what's driving this]
  Concentration Risk:     [score] / 25  [emoji]  [one sentence: what the biggest weight means]
  Performance vs Market:  [score] / 25  [emoji]  [one sentence: alpha in plain terms]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. PORTFOLIO SNAPSHOT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total value, cost basis, unrealised P&L. Top 3 holdings by weight with a one-line comment on each. Asset mix.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2. SHARPE RATIO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
State the value, then immediately explain it: "A Sharpe of X means that for every unit of risk taken, the portfolio is generating X units of return — [good/below average/etc.] compared to a typical equity portfolio of 0.5–0.8." Then explain what a low or high Sharpe actually feels like for the investor day-to-day.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3. RISK METRICS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
For each: [metric value + plain translation] → [Why this matters in one sentence connecting to real experience]
- Volatility vs S&P 500 (~15–18% typical)
- Max Drawdown translated to £ terms
- VaR 95% as a £ figure ("on a poor day, 5% chance of losing more than £X")
- Beta classified as defensive / market-tracking / aggressive

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4. PERFORMANCE vs BENCHMARK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Actual return vs CAPM expected return. Jensen's Alpha with plain translation. State clearly whether this is meaningful outperformance or likely within normal variance.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
5. HIDDEN EXPOSURES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The most valuable section. Identify:
- ETF overlap: which individual stocks are likely also held inside broad ETFs (e.g. VUSA tracks S&P 500 — any US large-cap stocks held directly are effectively double-counted). Name specific tickers.
- Geographic and sector concentration
- Currency exposure beyond GBP
Frame as: "One thing worth being aware of is…"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
6. DIVIDEND INCOME
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total received, yield on cost if dividends present. If none, note the growth-only nature and what that means for cash flow.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
7. OBSERVATIONS WORTH CONSIDERING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3–4 numbered points. Each: specific data point → why it matters → what it could imply. Framed as observations, never instructions.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
8. OVERALL ASSESSMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Two paragraphs. First: honest, measured assessment of portfolio construction — strengths and areas worth attention. Second: the single most interesting insight from this analysis, framed as something worth reflecting on.

Rules:
- Exact numbers only. No rounding.
- No disclaimers or boilerplate.
- Calm, intelligent tone throughout.
- Target ~1000 words."""

_CACHE_FILE = os.path.join(os.path.dirname(__file__), "analysis_cache.json")


def _context_hash(context: str) -> str:
    return hashlib.sha256(context.encode()).hexdigest()


def load_cached(context: str) -> str | None:
    """Return the cached analysis if the context hasn't changed, else None."""
    if not os.path.exists(_CACHE_FILE):
        return None
    try:
        with open(_CACHE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        if data.get("hash") == _context_hash(context):
            return data.get("result")
    except Exception:
        pass
    return None


def save_cache(context: str, result: str):
    """Persist the analysis result alongside the context hash."""
    try:
        with open(_CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump({"hash": _context_hash(context), "result": result}, f)
    except Exception:
        pass


def stream_analysis(context: str, on_token, on_done, on_error, api_key: str = None):
    """
    Run AI analysis in a background thread.

    Args:
        context:   Portfolio data as a formatted string.
        on_token:  Callable(str) — called for each streamed text chunk.
        on_done:   Callable(from_cache: bool) — called on completion.
        on_error:  Callable(str) — called with an error message on failure.
        api_key:   Anthropic API key (overrides ANTHROPIC_API_KEY env var).
    """
    # ── Output cache check ────────────────────────────────────────────────────
    cached = load_cached(context)
    if cached:
        on_token(cached)
        on_done(from_cache=True)
        return

    # ── Live API call with prompt caching ─────────────────────────────────────
    try:
        client = anthropic.Anthropic(api_key=api_key) if api_key else anthropic.Anthropic()
        collected = []
        with client.messages.stream(
            model="claude-haiku-4-5",
            max_tokens=2500,
            system=[{
                "type": "text",
                "text": SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},  # prompt caching
            }],
            messages=[{"role": "user", "content": context}],
        ) as stream:
            for text in stream.text_stream:
                collected.append(text)
                on_token(text)

        save_cache(context, "".join(collected))
        on_done(from_cache=False)

    except anthropic.AuthenticationError:
        on_error("API key not found or invalid.\n\nGet a key at: console.anthropic.com")
    except anthropic.APIConnectionError:
        on_error("Network error — check your internet connection.")
    except Exception as exc:
        on_error(f"Analysis failed: {exc}")
