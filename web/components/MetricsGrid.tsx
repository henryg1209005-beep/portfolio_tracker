"use client";
import type { Metrics, Summary, PerformanceData } from "@/lib/api";
type RiskProfile = "conservative" | "balanced" | "growth";

// ── Helpers ───────────────────────────────────────────────────────────────────

function gbp(n: number) {
  return `£${n.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
function pct(v: number) {
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
}

// ── Rolling series from performance data ──────────────────────────────────────

function dailyReturns(series: number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < series.length; i++) {
    r.push((series[i] - series[i - 1]) / (series[i - 1] || 1));
  }
  return r;
}

function rollingVol(returns: number[], w = 21): number[] {
  const out: number[] = [];
  for (let i = w; i <= returns.length; i++) {
    const sl = returns.slice(i - w, i);
    const mu = sl.reduce((s, r) => s + r, 0) / w;
    const v  = sl.reduce((s, r) => s + (r - mu) ** 2, 0) / (w - 1);
    out.push(Math.sqrt(v * 252));
  }
  return out;
}

function rollingSharpe(returns: number[], w = 21, rfDaily = 0): number[] {
  const out: number[] = [];
  for (let i = w; i <= returns.length; i++) {
    const sl  = returns.slice(i - w, i);
    const ex  = sl.map(r => r - rfDaily);
    const mu  = ex.reduce((s, r) => s + r, 0) / w;
    const std = Math.sqrt(ex.reduce((s, r) => s + (r - mu) ** 2, 0) / (w - 1));
    out.push(std > 0 ? (mu / std) * Math.sqrt(252) : 0);
  }
  return out;
}

function rollingBeta(portR: number[], benchR: number[], w = 21): number[] {
  const out: number[] = [];
  const n = Math.min(portR.length, benchR.length);
  for (let i = w; i <= n; i++) {
    const p  = portR.slice(i - w, i);
    const b  = benchR.slice(i - w, i);
    const pm = p.reduce((s, r) => s + r, 0) / w;
    const bm = b.reduce((s, r) => s + r, 0) / w;
    const cov    = p.reduce((s, r, j) => s + (r - pm) * (b[j] - bm), 0) / (w - 1);
    const benchV = b.reduce((s, r) => s + (r - bm) ** 2, 0) / (w - 1);
    out.push(benchV > 0 ? cov / benchV : 1);
  }
  return out;
}

function drawdownSeries(port: number[]): number[] {
  let peak = port[0] ?? 100;
  return port.map(v => {
    if (v > peak) peak = v;
    return peak > 0 ? ((v - peak) / peak) * 100 : 0;
  });
}

// ── Trend arrow ───────────────────────────────────────────────────────────────

type TrendInfo = { arrow: string; color: string; label: string };

function trendArrow(data: number[], higherIsBetter: boolean): TrendInfo {
  if (data.length < 10) return { arrow: "→", color: "#6b5e7e", label: "stable" };
  const tail   = data.slice(-5);
  const head   = data.slice(-Math.min(data.length, 20), -5);
  if (head.length < 3) return { arrow: "→", color: "#6b5e7e", label: "stable" };
  const tMean  = tail.reduce((s, v) => s + v, 0) / tail.length;
  const hMean  = head.reduce((s, v) => s + v, 0) / head.length;
  const delta  = tMean - hMean;
  const thresh = Math.abs(hMean) * 0.04 || 0.002;
  if (Math.abs(delta) < thresh) return { arrow: "→", color: "#6b5e7e", label: "stable" };
  const up = delta > 0;
  const improving = higherIsBetter ? up : !up;
  return improving
    ? { arrow: "↑", color: "#00f5d4", label: higherIsBetter ? "improving" : "easing" }
    : { arrow: "↓", color: "#ff2d78", label: higherIsBetter ? "declining" : "rising" };
}

// ── Sparkline ─────────────────────────────────────────────────────────────────

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const N = 50;
  const pts = data.length > N ? data.slice(-N) : data;
  if (pts.length < 3) return null;

  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const range = max - min || 1;
  const W = 80; const H = 24;

  const points = pts.map((v, i) => {
    const x = (i / (pts.length - 1)) * W;
    const y = H - ((v - min) / range) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return (
    <svg width={W} height={H} style={{ overflow: "visible", opacity: 0.8 }}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Status types ──────────────────────────────────────────────────────────────

type Status = "good" | "ok" | "bad" | "neutral";

const STATUS_COLORS: Record<Status, string> = {
  good:    "#4dd2ff",
  ok:      "#7ca8ff",
  bad:     "#ff6b8a",
  neutral: "#7f93ad",
};

const STATUS_LABELS: Record<string, Record<Status, string>> = {
  sharpe:  { good: "Efficient",       ok: "Moderate",     bad: "Inefficient",   neutral: "No data" },
  sortino: { good: "Efficient",       ok: "Moderate",     bad: "Inefficient",   neutral: "No data" },
  alpha:   { good: "Outperforming",   ok: "Tracking",     bad: "Lagging",       neutral: "No data" },
  vol:     { good: "Low volatility",  ok: "Moderate",     bad: "High vol",      neutral: "No data" },
  var:     { good: "Within bounds",   ok: "Slightly high",bad: "At risk",       neutral: "No data" },
  mdd:     { good: "Contained",       ok: "Moderate",     bad: "Deep drawdown", neutral: "No data" },
  beta:    { good: "Defensive",       ok: "Market-paced", bad: "Amplified",     neutral: "No data" },
};

// ── MetricCard ────────────────────────────────────────────────────────────────

function MetricCard({
  metricKey, name, period, question, value, status, explain, detail, tip, sparkData, trend, statusContext,
}: {
  metricKey: string;
  name: string;
  period?: string;
  question: string;
  value: string;
  status: Status;
  explain: string;
  detail: string;
  tip?: string;
  sparkData?: number[];
  trend?: TrendInfo;
  statusContext?: string;
}) {
  const color      = STATUS_COLORS[status];
  const statusText = STATUS_LABELS[metricKey]?.[status] ?? (status === "neutral" ? "No data" : status);

  const tipBg: Record<Status, string> = {
    good:    "rgba(77,210,255,0.06)",
    ok:      "rgba(124,168,255,0.06)",
    bad:     "rgba(255,107,138,0.08)",
    neutral: "transparent",
  };
  const tipBorder: Record<Status, string> = {
    good:    "#4dd2ff44",
    ok:      "#7ca8ff44",
    bad:     "#ff6b8a44",
    neutral: "transparent",
  };

  return (
    <div
      className="synth-card rounded-xl p-5 flex flex-col gap-3"
      style={{ borderColor: `${color}33` }}
    >
      {/* Name + period */}
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-mono uppercase tracking-widest" style={{ color }}>{name}</span>
          {period && (
            <span className="text-xs font-mono text-muted/60">{period}</span>
          )}
        </div>
        <div className="text-xs font-medium text-text/70 mt-0.5">{question}</div>
      </div>

      {/* Value row */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 sm:gap-3">
          <div className="flex items-baseline gap-2">
          <span className="text-2xl sm:text-3xl font-bold font-mono break-words leading-tight" style={{ color }}>{value}</span>
          {trend && trend.arrow !== "→" && (
            <div className="flex flex-col pb-0.5">
              <span className="text-sm font-bold leading-none" style={{ color: trend.color }}>{trend.arrow}</span>
              <span className="text-xs font-mono leading-none mt-0.5" style={{ color: trend.color + "99" }}>{trend.label}</span>
            </div>
          )}
          {trend && trend.arrow === "→" && (
            <span className="text-xs font-mono pb-1" style={{ color: "#6b5e7e" }}>→ stable</span>
          )}
        </div>
        <div
          className="flex items-center gap-1.5 text-[11px] sm:text-xs font-mono px-2 py-0.5 rounded-full shrink-0 sm:mb-1 self-start sm:self-auto"
          style={{ background: `${color}15`, color, border: `1px solid ${color}33` }}
        >
          <span className="w-1.5 h-1.5 rounded-full inline-block shrink-0" style={{ background: color }} />
          {statusText}
        </div>
      </div>

      {/* Sparkline */}
      {sparkData && sparkData.length >= 3 && (
        <div className="flex items-center gap-2 -mt-1">
          <Sparkline data={sparkData} color={color} />
          <span className="text-xs text-muted/50 font-mono">90d trend</span>
        </div>
      )}

      {/* Explanation */}
      <div style={{ borderTop: "1px solid #2a0050" }} className="pt-3 flex flex-col gap-1.5">
        <p className="text-xs text-text leading-relaxed">{explain}</p>
        {statusContext && (
          <p className="text-[10px] leading-relaxed" style={{ color: "#9b8ab0" }}>{statusContext}</p>
        )}
        <p className="text-xs leading-relaxed" style={{ color: "#6b5e7e" }}>{detail}</p>
      </div>

      {/* Actionable tip */}
      {tip && status !== "neutral" && (
        <div
          className="rounded-lg px-3 py-2.5 flex gap-2 items-start"
          style={{ background: tipBg[status], borderLeft: `2px solid ${tipBorder[status]}` }}
        >
          <span className="text-xs font-bold shrink-0 mt-px" style={{ color }}>→</span>
          <p className="text-xs leading-relaxed" style={{ color: `${color}cc` }}>{tip}</p>
        </div>
      )}
    </div>
  );
}

// ── Status functions ──────────────────────────────────────────────────────────

const PROFILE_BANDS = {
  conservative: { sharpeGood: 1.2, sharpeOk: 0.6, sortinoGood: 1.8, sortinoOk: 0.8, volGood: 0.12, volOk: 0.20, betaGood: 0.7, betaOk: 1.0, varGoodPct: 0.02, varOkPct: 0.04, mddGoodAbs: 0.10, mddOkAbs: 0.20 },
  balanced:     { sharpeGood: 1.0, sharpeOk: 0.5, sortinoGood: 1.5, sortinoOk: 0.7, volGood: 0.15, volOk: 0.30, betaGood: 0.8, betaOk: 1.3, varGoodPct: 0.03, varOkPct: 0.06, mddGoodAbs: 0.15, mddOkAbs: 0.30 },
  growth:       { sharpeGood: 0.8, sharpeOk: 0.4, sortinoGood: 1.2, sortinoOk: 0.6, volGood: 0.20, volOk: 0.40, betaGood: 1.0, betaOk: 1.6, varGoodPct: 0.04, varOkPct: 0.08, mddGoodAbs: 0.20, mddOkAbs: 0.40 },
} as const;

function sharpeStatus(s: number | null, profile: RiskProfile): Status {
  if (s == null) return "neutral";
  const b = PROFILE_BANDS[profile];
  if (s >= b.sharpeGood) return "good";
  if (s >= b.sharpeOk)   return "ok";
  return "bad";
}
function sortinoStatus(s: number | null, profile: RiskProfile): Status {
  if (s == null) return "neutral";
  const b = PROFILE_BANDS[profile];
  if (s >= b.sortinoGood) return "good";
  if (s >= b.sortinoOk)   return "ok";
  return "bad";
}
function alphaStatus(a: number | null): Status {
  if (a == null) return "neutral";
  if (a > 0.03)  return "good";
  if (a > -0.02) return "ok";
  return "bad";
}
function volStatus(v: number | null, profile: RiskProfile): Status {
  if (v == null) return "neutral";
  const b = PROFILE_BANDS[profile];
  if (v < b.volGood) return "good";
  if (v < b.volOk)   return "ok";
  return "bad";
}
function betaStatus(betaValue: number | null, profile: RiskProfile): Status {
  if (betaValue == null) return "neutral";
  const b = PROFILE_BANDS[profile];
  if (betaValue < b.betaGood) return "good";
  if (betaValue < b.betaOk)   return "ok";
  return "bad";
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MetricsGrid({
  metrics,
  summary,
  perfData,
  benchmarkLabel = "S&P 500",
  riskProfile = "balanced",
}: {
  metrics: Metrics;
  summary: Summary;
  perfData?: PerformanceData | null;
  benchmarkLabel?: string;
  riskProfile?: RiskProfile;
}) {
  if (metrics.error) {
    return (
      <div className="synth-card rounded-xl p-6 text-sm" style={{ color: "#ff2d78", borderColor: "#ff2d7833" }}>
        {metrics.error}
      </div>
    );
  }

  const totalValue = summary.total_value ?? 0;
  const varGbp     = metrics.var_95       != null ? Math.abs(metrics.var_95)       * totalValue : null;
  const cfVarGbp   = metrics.var_95_cf    != null ? Math.abs(metrics.var_95_cf)    * totalValue : null;
  const mddGbp     = metrics.max_drawdown != null ? Math.abs(metrics.max_drawdown) * totalValue : null;
  const sharpe     = metrics.sharpe_ratio;
  const sortino    = metrics.sortino_ratio;
  const alpha      = metrics.alpha;
  const vol        = metrics.volatility;
  const beta       = metrics.beta;
  const expRet     = metrics.capm_expected_return;
  const volPct     = vol != null ? `${(vol * 100).toFixed(1)}%` : "—";
  const ddRecovery = metrics.drawdown_recovery_days;
  const rfDaily    = (metrics.rf_annual ?? 0.0425) / 252;

  // ── Rolling series from performance data ──────────────────────────────────
  let sharpeSpark: number[] | undefined;
  let volSpark:    number[] | undefined;
  let betaSpark:   number[] | undefined;
  let ddSpark:     number[] | undefined;
  let sharpeTrend: TrendInfo | undefined;
  let volTrend:    TrendInfo | undefined;
  let betaTrend:   TrendInfo | undefined;
  let ddTrend:     TrendInfo | undefined;

  if (perfData && perfData.portfolio.length > 30) {
    const portR  = dailyReturns(perfData.portfolio);
    const benchR = dailyReturns(perfData.benchmark);
    const rs     = rollingSharpe(portR, 21, rfDaily);
    const rv     = rollingVol(portR);
    const rb     = rollingBeta(portR, benchR);
    const dd     = drawdownSeries(perfData.portfolio);

    sharpeSpark = rs.slice(-90);
    volSpark    = rv.slice(-90);
    betaSpark   = rb.slice(-90);
    ddSpark     = dd.slice(-90);

    sharpeTrend = trendArrow(rs, true);
    volTrend    = trendArrow(rv, false);
    betaTrend   = trendArrow(rb, false);
    ddTrend     = trendArrow(dd, true);
  }

  // ── Explanations ─────────────────────────────────────────────────────────

  const sharpeExplain = sharpe == null
    ? "Not enough data yet."
    : sharpe >= 1
    ? `Generating ${sharpe.toFixed(2)} units of return per unit of risk — above the 1.0 threshold considered strong. You're being compensated well for volatility.`
    : sharpe >= 0.3
    ? `Earning ${sharpe.toFixed(2)} units of return per unit of risk. Decent, but below the 1.0 target. Reducing concentration may push this higher.`
    : `Only ${sharpe.toFixed(2)} units of return per unit of risk. The portfolio is taking on more risk than its returns justify.`;

  const sortinoExplain = sortino == null
    ? "Not enough data yet."
    : sortino >= 1.5
    ? `Sortino of ${sortino.toFixed(2)} — strong downside-adjusted return. The portfolio's bad days are small relative to its average gains.`
    : sortino >= 0.5
    ? `Sortino of ${sortino.toFixed(2)} — moderate downside-adjusted return. Some improvement possible by reducing the largest loss contributors.`
    : `Sortino of ${sortino.toFixed(2)} — the portfolio's downside moves are large relative to average returns. Concentrated losers are the likely drag.`;

  const alphaExplain = alpha == null
    ? "Not enough data to compare against the market."
    : alpha > 0
    ? `Alpha of ${pct(alpha)} means returns exceeded CAPM expectation (${pct(expRet ?? 0)}) on the benchmark-overlap window. You're generating excess return above market compensation.`
    : `Alpha of ${pct(alpha)} means returns were below CAPM expectation (${pct(expRet ?? 0)}) on the benchmark-overlap window. ${benchmarkLabel} exposure alone would have implied a stronger outcome.`;

  const riskExplain = vol == null
    ? "Not enough data to measure volatility."
    : vol < 0.15
    ? `Annualised volatility of ${volPct} — lower than the typical equity portfolio. Capital is moving calmly relative to the market.`
    : vol < 0.30
    ? `Annualised volatility of ${volPct} — in line with a typical equity investor. Meaningful swings but within normal range.`
    : `Annualised volatility of ${volPct} — significantly above average. At this level, a 1σ annual move represents ~£${Math.round(totalValue * (vol)).toLocaleString("en-GB")}.`;

  const betaExplain = beta == null
    ? "Not enough market data to compute beta."
    : beta < 0.8
    ? `Beta of ${beta.toFixed(2)} — portfolio moves less sharply than ${benchmarkLabel}. When ${benchmarkLabel} falls 10%, this portfolio is statistically expected to fall ~${(beta * 10).toFixed(0)}%.`
    : beta < 1.3
    ? `Beta of ${beta.toFixed(2)} — tracks ${benchmarkLabel} closely. When ${benchmarkLabel} moves 10%, this portfolio is expected to move ~${(beta * 10).toFixed(0)}%.`
    : `Beta of ${beta.toFixed(2)} — portfolio amplifies market moves. When ${benchmarkLabel} falls 10%, this portfolio is statistically expected to fall ~${(beta * 10).toFixed(0)}%.`;

  // VaR explanation — show both historical and parametric
  const varExplain = varGbp == null
    ? "Not enough data to estimate worst-case scenarios."
    : cfVarGbp != null
    ? `Historical VaR: ${gbp(varGbp)} — the 5th percentile of observed daily losses. Cornish-Fisher VaR: ${gbp(cfVarGbp)} — adjusted for skew and fat tails in your return distribution.${cfVarGbp > varGbp * 1.1 ? " The parametric estimate is higher, suggesting tail risk beyond what recent history shows." : ""}`
    : `On the worst 1-in-20 trading days (95% VaR), this portfolio has historically lost more than ${gbp(varGbp)}.`;

  // Drawdown explanation — include recovery time
  const ddRecoveryText = ddRecovery == null ? ""
    : ddRecovery < 0 ? ` Currently in drawdown — ${Math.abs(ddRecovery)} trading days since the trough with no full recovery yet.`
    : ddRecovery === 0 ? " The trough was a single-day event with immediate recovery."
    : ` Recovery took ${ddRecovery} trading days from trough back to the previous peak.`;

  const mddExplain = mddGbp == null
    ? "Not enough data to calculate the maximum drawdown."
    : `The largest peak-to-trough decline over the measurement period was ${gbp(mddGbp)}.${ddRecoveryText}`;

  const bands = PROFILE_BANDS[riskProfile];
  const profileLabel =
    riskProfile === "conservative" ? "Conservative" :
    riskProfile === "growth" ? "Growth" : "Balanced";
  const mddAbs = Math.abs(metrics.max_drawdown ?? 0);
  const mddStatus: Status =
    metrics.max_drawdown == null ? "neutral" : mddAbs <= bands.mddGoodAbs ? "good" : mddAbs <= bands.mddOkAbs ? "ok" : "bad";
  const varStatus: Status =
    varGbp == null ? "neutral" : varGbp < totalValue * bands.varGoodPct ? "good" : varGbp < totalValue * bands.varOkPct ? "ok" : "bad";

  // ── Actionable tips ────────────────────────────────────────────────────────

  const sharpeTip = sharpe == null ? undefined
    : sharpe >= 1
    ? "Strong risk-adjusted return. Protect this by keeping position weights balanced — a single concentrated winner that reverses can erode Sharpe quickly."
    : sharpe >= 0.3
    ? `Sharpe of ${sharpe.toFixed(2)} is below the 1.0 institutional target. Volatility is likely the drag. Trimming the highest-vol position is the most direct lever without cutting expected returns.`
    : `Only ${sharpe.toFixed(2)} units of return per unit of risk taken. The portfolio is over-exposed relative to its rewards. Reducing single-stock concentration would have the largest impact here.`;

  const sortinoTip = sortino == null ? undefined
    : sortino >= 1.5
    ? "Strong downside-adjusted return. The distinction between Sortino and Sharpe tells you how symmetric your risk is — if Sortino is much higher than Sharpe, most of your volatility is upside, which is desirable."
    : sortino >= 0.5
    ? `Compare with Sharpe (${sharpe?.toFixed(2) ?? "—"}). If Sortino is notably higher, your volatility is skewed to the upside — that's good. If similar, downside and upside volatility are roughly equal.`
    : "Low Sortino means downside moves are frequent and large relative to returns. Look at your biggest single-day losses — the top 2–3 positions by weight are usually the source.";

  const alphaTip = alpha == null ? undefined
    : alpha > 0.03
    ? `Positive alpha against ${benchmarkLabel} is rare — protect it by avoiding pure index overlap. If multiple holdings track the same index, genuine excess return gets diluted.`
    : alpha > -0.02
    ? `Alpha near zero means returns are roughly what ${benchmarkLabel} exposure predicts. To generate genuine excess return, differentiated holdings away from index overlap are key.`
    : `Negative alpha suggests ${benchmarkLabel} has outperformed on a risk-adjusted basis. High overlap between ETFs (e.g. multiple S&P 500 trackers) is a common cause — check for redundant holdings.`;

  const volTip = vol == null ? undefined
    : vol < 0.15
    ? "Low volatility supports smoother compounding. Maintaining this requires keeping individual high-vol stocks small — even a single 20%+ allocation in a volatile name raises portfolio vol significantly."
    : vol < 0.30
    ? `Volatility of ${volPct} is in normal equity range. Adding one uncorrelated asset (e.g. bonds, gold) typically reduces portfolio vol by 2–4pp without proportionally reducing expected return.`
    : `Volatility above 30% is high. At ${volPct}, a one-standard-deviation down year would reduce the portfolio by ~£${Math.round(totalValue * (vol ?? 0)).toLocaleString("en-GB")}. Position sizing in the top 1–2 holdings is the primary lever.`;

  const betaTip = beta == null ? undefined
    : beta < 0.8
    ? `Defensive beta provides downside cushion in corrections. If this is intentional, it's working as designed. If not, check whether low-beta ETFs are suppressing growth exposure unintentionally.`
    : beta < 1.3
    ? `Beta of ${beta.toFixed(2)} tracks ${benchmarkLabel} closely — typical for a diversified equity portfolio. Acceptable unless you want explicit downside protection, which would require lower-beta or defensive assets.`
    : `Beta of ${beta.toFixed(2)} means corrections amplify beyond the index. When ${benchmarkLabel} drops 10%, this portfolio is expected to drop ~${(beta * 10).toFixed(0)}%. Adding lower-beta assets (bonds, defensive ETFs) is the most direct fix.`;

  const varTip = varGbp == null ? undefined
    : varGbp < totalValue * 0.03
    ? "Daily loss exposure is well-contained. This level of VaR is consistent with a diversified, moderate-risk portfolio."
    : varGbp < totalValue * 0.06
    ? `On a typical bad day, losses could reach ${gbp(varGbp)}. Concentrated positions in high-vol stocks are the primary driver. Reducing the top 1–2 positions by weight would lower this.`
    : `Daily VaR of ${gbp(varGbp)} is significant relative to portfolio size. At this level, a cluster of bad days can cause meaningful capital loss. Position sizing and diversification are the levers to pull.`;

  const mddTip = mddGbp == null ? undefined
    : (metrics.max_drawdown ?? 0) > -0.15
    ? "Drawdown has stayed contained — the portfolio has recovered quickly from dips. Continuing to avoid heavy concentration in correlated assets helps keep this low."
    : (metrics.max_drawdown ?? 0) > -0.30
    ? `A drawdown of ${gbp(mddGbp)} is within normal equity market range. Reviewing what drove the trough — single stock or broad market — informs whether structure changes are needed.`
    : `A drawdown of ${gbp(mddGbp)} is significant. Understanding whether this was one concentrated position or a market-wide move determines the right response — position limits vs. correlation management.`;

  // Static trend arrows (fallback when no performance data)
  const sharpeTrendFallback: TrendInfo = sharpe == null
    ? { arrow: "→", color: "#6b5e7e", label: "stable" }
    : sharpe >= 1 ? { arrow: "↑", color: "#00f5d4", label: "improving" }
    : sharpe < 0.3 ? { arrow: "↓", color: "#ff2d78", label: "declining" }
    : { arrow: "→", color: "#6b5e7e", label: "stable" };

  const volTrendFallback: TrendInfo = vol == null
    ? { arrow: "→", color: "#6b5e7e", label: "stable" }
    : vol < 0.15 ? { arrow: "↓", color: "#00f5d4", label: "low" }
    : vol > 0.30 ? { arrow: "↑", color: "#ff2d78", label: "elevated" }
    : { arrow: "→", color: "#6b5e7e", label: "stable" };

  const confidence = metrics.sample_days == null
    ? "Unknown"
    : metrics.sample_days < 60 ? "Low"
    : metrics.sample_days < 120 ? "Low"
    : metrics.sample_days < 180 ? "Medium"
    : "High";
  const limitedData = (metrics.sample_days ?? 0) > 0 && (metrics.sample_days ?? 0) < 60;

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl px-4 py-3 flex flex-wrap items-center gap-3 ops-panel">
        <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#6b5e7e" }}>Methodology</span>
        <span className="text-xs font-semibold" style={{ color: "#e2d9f3" }}>
          {metrics.risk_model === "current_holdings_cost_weighted" ? "Current Holdings Risk Model" : "Portfolio Risk Model"}
        </span>
        <span
          className="text-[10px] font-mono px-2 py-0.5 rounded-full"
          style={{
            color: confidence === "High" ? "#4dd2ff" : confidence === "Medium" ? "#7ca8ff" : "#ff6b8a",
            border: "1px solid #1f3248",
          }}
        >
          Confidence: {confidence}
        </span>
        {metrics.sample_days != null && (
          <span className="text-[10px] font-mono" style={{ color: "#7f93ad" }}>Sample: {metrics.sample_days} trading days</span>
        )}
        {metrics.benchmark_overlap_days != null && (
          <span className="text-[10px] font-mono" style={{ color: "#7f93ad" }}>Benchmark overlap: {metrics.benchmark_overlap_days} days</span>
        )}
        {(metrics.window_years_equivalent != null || metrics.sample_days != null) && (
          <span className="text-[10px] font-mono" style={{ color: "#7f93ad" }}>
            Window: ~{(metrics.window_years_equivalent ?? ((metrics.sample_days ?? 0) / 252)).toFixed(2)} years
          </span>
        )}
      </div>
      <div className="rounded-xl px-4 py-3 flex flex-wrap items-center gap-2 ops-panel">
        <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#7f93ad" }}>Horizon Map</span>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full" style={{ border: "1px solid #1f3248", color: "#d9e4f2" }}>
          Since inception: Annualised Return
        </span>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full" style={{ border: "1px solid #1f3248", color: "#4dd2ff" }}>
          Trailing 252d: Sharpe, Sortino, Vol, VaR, Drawdown
        </span>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full" style={{ border: "1px solid #1f3248", color: "#7ca8ff" }}>
          Benchmark overlap: Beta, CAPM, Alpha
        </span>
      </div>
      {limitedData && (
        <div className="rounded-xl px-4 py-3 text-[11px] leading-relaxed flex items-start gap-2"
          style={{ background: "#ff6b8a12", border: "1px solid #ff6b8a44", color: "#ff6b8a" }}>
          <span className="shrink-0 mt-0.5">⚠</span>
          <span>
            Limited data quality: fewer than 60 trading days. Treat this as directional only until more observations accumulate.
          </span>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">

        {/* Sharpe Ratio */}
        <MetricCard
          metricKey="sharpe"
          name="Sharpe Ratio"
          period="Trailing 252d"
          question="Is the risk worth the reward?"
          value={sharpe != null ? sharpe.toFixed(2) : "—"}
          status={sharpeStatus(sharpe, riskProfile)}
          explain={sharpeExplain}
          statusContext={`${profileLabel} threshold: Good ≥ ${bands.sharpeGood.toFixed(1)}, OK ≥ ${bands.sharpeOk.toFixed(1)}.`}
          detail="Calculated as excess return over the short-term risk-free rate, divided by portfolio volatility. Status thresholds are adjusted by your selected risk profile."
          tip={sharpeTip}
          sparkData={sharpeSpark}
          trend={sharpeTrend ?? sharpeTrendFallback}
        />

        {/* Sortino Ratio */}
        <MetricCard
          metricKey="sortino"
          name="Sortino Ratio"
          period="Trailing 252d"
          question="Is the downside risk worth it?"
          value={sortino != null ? (sortino > 99 ? "99+" : sortino.toFixed(2)) : "—"}
          status={sortinoStatus(sortino, riskProfile)}
          explain={sortinoExplain}
          statusContext={`${profileLabel} threshold: Good ≥ ${bands.sortinoGood.toFixed(1)}, OK ≥ ${bands.sortinoOk.toFixed(1)}.`}
          detail="Like Sharpe, but only penalises downside volatility. Upside swings don't count against you. Status thresholds are adjusted by your selected risk profile."
          tip={sortinoTip}
        />

        {/* Jensen's Alpha */}
        <MetricCard
          metricKey="alpha"
          name="Jensen's Alpha"
          period={`vs ${benchmarkLabel} (overlap)`}
          question="Are you beating the market?"
          value={alpha != null ? pct(alpha) : "—"}
          status={alphaStatus(alpha)}
          explain={alphaExplain}
          detail={`Alpha measures return above what CAPM predicts given your beta exposure to ${benchmarkLabel}, computed on the same benchmark-overlap window. Positive alpha means outperformance on a risk-adjusted basis.`}
          tip={alphaTip}
        />

        {/* Volatility */}
        <MetricCard
          metricKey="vol"
          name="Portfolio Volatility"
          period="Trailing 252d annualised"
          question="How large are the swings?"
          value={volPct}
          status={volStatus(vol, riskProfile)}
          explain={riskExplain}
          statusContext={`${profileLabel} threshold: Good < ${(bands.volGood * 100).toFixed(0)}%, OK < ${(bands.volOk * 100).toFixed(0)}%.`}
          detail="Annualised standard deviation of daily returns. The S&P 500 runs at roughly 15–18% in normal markets; individual stock-heavy portfolios often exceed 30%."
          tip={volTip}
          sparkData={volSpark}
          trend={volTrend ?? volTrendFallback}
        />

        {/* Beta */}
        <MetricCard
          metricKey="beta"
          name="Market Beta"
          period={`vs ${benchmarkLabel} (overlap)`}
          question="How much does the market move you?"
          value={beta != null ? beta.toFixed(2) : "—"}
          status={betaStatus(beta, riskProfile)}
          explain={betaExplain}
          statusContext={`${profileLabel} threshold: Good < ${bands.betaGood.toFixed(1)}, OK < ${bands.betaOk.toFixed(1)}.`}
          detail={`Beta of 1.0 = moves exactly with ${benchmarkLabel}. Below 1.0 = more defensive. Above 1.3 = amplified market swings. Concentration in high-beta stocks raises this significantly.`}
          tip={betaTip}
          sparkData={betaSpark}
          trend={betaTrend}
        />

        {/* VaR */}
        <MetricCard
          metricKey="var"
          name="Value at Risk"
          period="95% confidence, 1-day, trailing 252d"
          question="What's the worst bad day?"
          value={varGbp != null ? gbp(varGbp) : "—"}
          status={varStatus}
          explain={varExplain}
          statusContext={`${profileLabel} threshold: Good < ${(bands.varGoodPct * 100).toFixed(0)}% of portfolio, OK < ${(bands.varOkPct * 100).toFixed(0)}%.`}
          detail={cfVarGbp != null
            ? `Historical: ${gbp(varGbp ?? 0)} (raw 5th percentile). Cornish-Fisher: ${gbp(cfVarGbp)} (adjusted for skew & kurtosis). The gap between them indicates how fat-tailed your returns are.`
            : "On a typical bad day — the kind that happens roughly once a month — losses are expected to stay below this figure. 5% of days historically exceed it."}
          tip={varTip}
        />

        {/* Max Drawdown */}
        <MetricCard
          metricKey="mdd"
          name="Max Drawdown"
          period="Trailing 252d"
          question="What was the biggest dip?"
          value={mddGbp != null ? gbp(mddGbp) : "—"}
          status={mddStatus}
          explain={mddExplain}
          statusContext={`${profileLabel} threshold: Good drawdown ≤ ${(bands.mddGoodAbs * 100).toFixed(0)}%, OK ≤ ${(bands.mddOkAbs * 100).toFixed(0)}%.`}
          detail={ddRecovery != null
            ? ddRecovery < 0
              ? `Still in drawdown — ${Math.abs(ddRecovery)} trading days since the trough. No full recovery yet. This is the figure that tests emotional discipline.`
              : `Recovery took ${ddRecovery} trading day${ddRecovery !== 1 ? "s" : ""}. Quick recoveries suggest resilient portfolio structure.`
            : "Peak-to-trough decline over the measurement period. This is the figure that tests emotional discipline — it's what investors lived through before any recovery began."}
          tip={mddTip}
          sparkData={ddSpark}
          trend={ddTrend}
        />

      </div>

      {/* Risk warning */}
      <div
        className="rounded-xl px-4 py-3 text-[11px] leading-relaxed flex items-start gap-2"
        style={{ background: "#0d1828", border: "1px solid #1f3248", color: "#7f93ad" }}
      >
        <span style={{ color: "#7ca8ff88" }} className="shrink-0 mt-0.5">⚠</span>
        <span>
          Performance may not persist — current alpha and Sharpe may be driven by concentrated positions rather than structural edge. Horizons are mixed by design: return is since inception, absolute risk metrics are trailing 252d, and benchmark-relative metrics use strict overlap with {benchmarkLabel}. Past performance is not indicative of future results.
        </span>
      </div>
    </div>
  );
}



