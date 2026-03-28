"use client";
import type { Metrics, Summary, PerformanceData } from "@/lib/api";

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

function rollingSharpe(returns: number[], w = 21, rfDaily = 0.045 / 252): number[] {
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
  good:    "#00f5d4",
  ok:      "#bf5af2",
  bad:     "#ff2d78",
  neutral: "#6b5e7e",
};

const STATUS_LABELS: Record<string, Record<Status, string>> = {
  sharpe:  { good: "Efficient",       ok: "Moderate",     bad: "Inefficient",   neutral: "No data" },
  alpha:   { good: "Outperforming",   ok: "Tracking",     bad: "Lagging",       neutral: "No data" },
  vol:     { good: "Low volatility",  ok: "Moderate",     bad: "High vol",      neutral: "No data" },
  var:     { good: "Within bounds",   ok: "Slightly high",bad: "At risk",       neutral: "No data" },
  mdd:     { good: "Contained",       ok: "Moderate",     bad: "Deep drawdown", neutral: "No data" },
  beta:    { good: "Defensive",       ok: "Market-paced", bad: "Amplified",     neutral: "No data" },
};

// ── MetricCard ────────────────────────────────────────────────────────────────

function MetricCard({
  metricKey, name, period, question, value, status, explain, detail, tip, sparkData, trend,
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
}) {
  const color      = STATUS_COLORS[status];
  const statusText = STATUS_LABELS[metricKey]?.[status] ?? (status === "neutral" ? "No data" : status);

  const tipBg: Record<Status, string> = {
    good:    "rgba(0,245,212,0.04)",
    ok:      "rgba(191,90,242,0.04)",
    bad:     "rgba(255,45,120,0.05)",
    neutral: "transparent",
  };
  const tipBorder: Record<Status, string> = {
    good:    "#00f5d433",
    ok:      "#bf5af233",
    bad:     "#ff2d7844",
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
          <span className="text-[11px] font-mono uppercase tracking-widest" style={{ color }}>{name}</span>
          {period && (
            <span className="text-[9px] font-mono text-muted/60">{period}</span>
          )}
        </div>
        <div className="text-xs font-medium text-text/70 mt-0.5">{question}</div>
      </div>

      {/* Value row */}
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold font-mono" style={{ color }}>{value}</span>
          {trend && trend.arrow !== "→" && (
            <div className="flex flex-col pb-0.5">
              <span className="text-sm font-bold leading-none" style={{ color: trend.color }}>{trend.arrow}</span>
              <span className="text-[9px] font-mono leading-none mt-0.5" style={{ color: trend.color + "99" }}>{trend.label}</span>
            </div>
          )}
          {trend && trend.arrow === "→" && (
            <span className="text-xs font-mono pb-1" style={{ color: "#6b5e7e" }}>→ stable</span>
          )}
        </div>
        <div
          className="flex items-center gap-1.5 text-[10px] font-mono px-2 py-0.5 rounded-full shrink-0 mb-1"
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
          <span className="text-[9px] text-muted/50 font-mono">90d trend</span>
        </div>
      )}

      {/* Explanation */}
      <div style={{ borderTop: "1px solid #2a0050" }} className="pt-3 flex flex-col gap-1.5">
        <p className="text-xs text-text leading-relaxed">{explain}</p>
        <p className="text-[10px] leading-relaxed" style={{ color: "#6b5e7e" }}>{detail}</p>
      </div>

      {/* Actionable tip */}
      {tip && status !== "neutral" && (
        <div
          className="rounded-lg px-3 py-2.5 flex gap-2 items-start"
          style={{ background: tipBg[status], borderLeft: `2px solid ${tipBorder[status]}` }}
        >
          <span className="text-[10px] font-bold shrink-0 mt-px" style={{ color }}>→</span>
          <p className="text-[11px] leading-relaxed" style={{ color: `${color}cc` }}>{tip}</p>
        </div>
      )}
    </div>
  );
}

// ── Status functions ──────────────────────────────────────────────────────────

function sharpeStatus(s: number | null): Status {
  if (s == null) return "neutral";
  if (s >= 1)    return "good";
  if (s >= 0.3)  return "ok";
  return "bad";
}
function alphaStatus(a: number | null): Status {
  if (a == null) return "neutral";
  if (a > 0.03)  return "good";
  if (a > -0.02) return "ok";
  return "bad";
}
function volStatus(v: number | null): Status {
  if (v == null) return "neutral";
  if (v < 0.15)  return "good";
  if (v < 0.30)  return "ok";
  return "bad";
}
function betaStatus(b: number | null): Status {
  if (b == null) return "neutral";
  if (b < 0.8)   return "good";
  if (b < 1.3)   return "ok";
  return "bad";
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MetricsGrid({
  metrics,
  summary,
  perfData,
}: {
  metrics: Metrics;
  summary: Summary;
  perfData?: PerformanceData | null;
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
  const mddGbp     = metrics.max_drawdown != null ? Math.abs(metrics.max_drawdown) * totalValue : null;
  const sharpe     = metrics.sharpe_ratio;
  const alpha      = metrics.alpha;
  const vol        = metrics.volatility;
  const beta       = metrics.beta;
  const actRet     = metrics.actual_return;
  const expRet     = metrics.capm_expected_return;
  const volPct     = vol != null ? `${(vol * 100).toFixed(1)}%` : "—";

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
    const rs     = rollingSharpe(portR);
    const rv     = rollingVol(portR);
    const rb     = rollingBeta(portR, benchR);
    const dd     = drawdownSeries(perfData.portfolio);

    sharpeSpark = rs.slice(-90);
    volSpark    = rv.slice(-90);
    betaSpark   = rb.slice(-90);
    ddSpark     = dd.slice(-90);

    sharpeTrend = trendArrow(rs, true);
    volTrend    = trendArrow(rv, false);    // lower vol = improving
    betaTrend   = trendArrow(rb, false);    // lower beta = improving
    ddTrend     = trendArrow(dd, true);     // less negative = improving
  }

  // ── Copy ──────────────────────────────────────────────────────────────────

  const sharpeExplain = sharpe == null
    ? "Not enough data yet."
    : sharpe >= 1
    ? `Generating ${sharpe.toFixed(2)} units of return per unit of risk — above the 1.0 threshold considered strong. You're being compensated well for volatility.`
    : sharpe >= 0.3
    ? `Earning ${sharpe.toFixed(2)} units of return per unit of risk. Decent, but below the 1.0 target. Reducing concentration may push this higher.`
    : `Only ${sharpe.toFixed(2)} units of return per unit of risk. The portfolio is taking on more risk than its returns justify.`;

  const alphaExplain = alpha == null
    ? "Not enough data to compare against the market."
    : alpha > 0
    ? `Returned ${pct(actRet ?? 0)}, beating the CAPM-expected ${pct(expRet ?? 0)} by ${pct(alpha)}. You're generating excess return above market compensation.`
    : `Returned ${pct(actRet ?? 0)}, ${pct(Math.abs(alpha ?? 0))} below the CAPM-expected ${pct(expRet ?? 0)}. The market benchmark has outpaced this period's performance.`;

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
    ? `Beta of ${beta.toFixed(2)} — portfolio moves less sharply than the market. When the S&P falls 10%, this portfolio is statistically expected to fall ~${(beta * 10).toFixed(0)}%.`
    : beta < 1.3
    ? `Beta of ${beta.toFixed(2)} — tracks the market closely. When the S&P moves 10%, this portfolio is expected to move ~${(beta * 10).toFixed(0)}%.`
    : `Beta of ${beta.toFixed(2)} — portfolio amplifies market moves. When the S&P falls 10%, this portfolio is statistically expected to fall ~${(beta * 10).toFixed(0)}%.`;

  const varExplain = varGbp == null
    ? "Not enough data to estimate worst-case scenarios."
    : `On the worst 1-in-20 trading days (95% VaR), this portfolio has historically lost more than ${gbp(varGbp)}. This is a statistical estimate based on observed daily moves.`;

  const mddExplain = mddGbp == null
    ? "Not enough data to calculate the maximum drawdown."
    : `The largest peak-to-trough decline over the last 12 months was ${gbp(mddGbp)}. This is the number that tests whether you'd have held on through the worst stretch.`;

  const mddStatus: Status = (metrics.max_drawdown ?? 0) > -0.15 ? "good" : (metrics.max_drawdown ?? 0) > -0.30 ? "ok" : "bad";
  const varStatus: Status = varGbp != null && varGbp < totalValue * 0.03 ? "good" : varGbp != null && varGbp < totalValue * 0.06 ? "ok" : "bad";

  // ── Actionable tips ────────────────────────────────────────────────────────

  const sharpeTip = sharpe == null ? undefined
    : sharpe >= 1
    ? "Strong risk-adjusted return. Protect this by keeping position weights balanced — a single concentrated winner that reverses can erode Sharpe quickly."
    : sharpe >= 0.3
    ? `Sharpe of ${sharpe.toFixed(2)} is below the 1.0 institutional target. Volatility is likely the drag. Trimming the highest-vol position is the most direct lever without cutting expected returns.`
    : `Only ${sharpe.toFixed(2)} units of return per unit of risk taken. The portfolio is over-exposed relative to its rewards. Reducing single-stock concentration would have the largest impact here.`;

  const alphaTip = alpha == null ? undefined
    : alpha > 0.03
    ? "Positive alpha is rare — protect it by avoiding pure index overlap. If multiple holdings track the same index, genuine excess return gets diluted."
    : alpha > -0.02
    ? "Alpha near zero means returns are roughly what market exposure predicts. To generate genuine excess return, differentiated holdings away from index overlap are key."
    : `Negative alpha suggests the benchmark has outperformed on a risk-adjusted basis. High overlap between ETFs (e.g. multiple S&P 500 trackers) is a common cause — check for redundant holdings.`;

  const volTip = vol == null ? undefined
    : vol < 0.15
    ? "Low volatility supports smoother compounding. Maintaining this requires keeping individual high-vol stocks small — even a single 20%+ allocation in a volatile name raises portfolio vol significantly."
    : vol < 0.30
    ? `Volatility of ${volPct} is in normal equity range. Adding one uncorrelated asset (e.g. bonds, gold) typically reduces portfolio vol by 2–4pp without proportionally reducing expected return.`
    : `Volatility above 30% is high. At ${volPct}, a one-standard-deviation down year would reduce the portfolio by ~£${Math.round(totalValue * (vol ?? 0)).toLocaleString("en-GB")}. Position sizing in the top 1–2 holdings is the primary lever.`;

  const betaTip = beta == null ? undefined
    : beta < 0.8
    ? "Defensive beta provides downside cushion in corrections. If this is intentional, it's working as designed. If not, check whether low-beta ETFs are suppressing growth exposure unintentionally."
    : beta < 1.3
    ? `Beta of ${beta.toFixed(2)} tracks the market closely — typical for a diversified equity portfolio. Acceptable unless you want explicit downside protection, which would require lower-beta or defensive assets.`
    : `Beta of ${beta.toFixed(2)} means corrections amplify beyond the index. When the S&P drops 10%, this portfolio is expected to drop ~${(beta * 10).toFixed(0)}%. Adding lower-beta assets (bonds, defensive ETFs) is the most direct fix.`;

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

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">

        {/* Sharpe Ratio */}
        <MetricCard
          metricKey="sharpe"
          name="Sharpe Ratio"
          period="1Y rolling"
          question="Is the risk worth the reward?"
          value={sharpe != null ? sharpe.toFixed(2) : "—"}
          status={sharpeStatus(sharpe)}
          explain={sharpeExplain}
          detail="Above 1.0 is considered strong. Most diversified funds sit between 0.5 and 1.0. Calculated as excess return over the 13-week T-bill rate, divided by portfolio volatility."
          tip={sharpeTip}
          sparkData={sharpeSpark}
          trend={sharpeTrend ?? sharpeTrendFallback}
        />

        {/* Jensen's Alpha */}
        <MetricCard
          metricKey="alpha"
          name="Jensen's Alpha"
          period="vs S&P 500"
          question="Are you beating the market?"
          value={alpha != null ? pct(alpha) : "—"}
          status={alphaStatus(alpha)}
          explain={alphaExplain}
          detail="Alpha measures return above what CAPM predicts given your beta exposure. Positive alpha means you outperformed on a risk-adjusted basis. Beating it consistently is rare — most professional funds don't."
          tip={alphaTip}
        />

        {/* Volatility */}
        <MetricCard
          metricKey="vol"
          name="Portfolio Volatility"
          period="annualised"
          question="How large are the swings?"
          value={volPct}
          status={volStatus(vol)}
          explain={riskExplain}
          detail="Annualised standard deviation of daily returns. The S&P 500 runs at roughly 15–18% in normal markets; individual stock-heavy portfolios often exceed 30%."
          tip={volTip}
          sparkData={volSpark}
          trend={volTrend ?? volTrendFallback}
        />

        {/* Beta — separated from volatility */}
        <MetricCard
          metricKey="beta"
          name="Market Beta"
          period="vs S&P 500"
          question="How much does the market move you?"
          value={beta != null ? beta.toFixed(2) : "—"}
          status={betaStatus(beta)}
          explain={betaExplain}
          detail="Beta of 1.0 = moves exactly with the S&P 500. Below 1.0 = more defensive. Above 1.3 = amplified market swings. Concentration in high-beta stocks (NVDA, PLTR) raises this significantly."
          tip={betaTip}
          sparkData={betaSpark}
          trend={betaTrend}
        />

        {/* VaR */}
        <MetricCard
          metricKey="var"
          name="Value at Risk"
          period="95% confidence, 1-day"
          question="What's the worst bad day?"
          value={varGbp != null ? gbp(varGbp) : "—"}
          status={varStatus}
          explain={varExplain}
          detail="On a typical bad day — the kind that happens roughly once a month — losses are expected to stay below this figure. 5% of days historically exceed it."
          tip={varTip}
        />

        {/* Max Drawdown */}
        <MetricCard
          metricKey="mdd"
          name="Max Drawdown"
          period="last 12 months"
          question="What was the biggest dip?"
          value={mddGbp != null ? gbp(mddGbp) : "—"}
          status={mddStatus}
          explain={mddExplain}
          detail="Peak-to-trough decline over the measurement period. This is the figure that tests emotional discipline — it's what investors lived through before any recovery began."
          tip={mddTip}
          sparkData={ddSpark}
          trend={ddTrend}
        />

      </div>

      {/* Risk warning */}
      <div
        className="rounded-xl px-4 py-3 text-[11px] leading-relaxed flex items-start gap-2"
        style={{ background: "#1a001a", border: "1px solid #3d005e33", color: "#6b5e7e" }}
      >
        <span style={{ color: "#bf5af266" }} className="shrink-0 mt-0.5">⚠</span>
        <span>
          Performance may not persist — current alpha and Sharpe may be driven by concentrated positions rather than structural edge. Metrics are based on a 1-year rolling window and will shift as the holding period extends. Past performance is not indicative of future results.
        </span>
      </div>
    </div>
  );
}
