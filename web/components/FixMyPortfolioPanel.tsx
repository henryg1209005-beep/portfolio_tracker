"use client";
import { useState, useEffect } from "react";
import {
  generatePortfolioFixPlan,
  concentrationLabel,
  getUnclassifiedTickers,
  type RiskProfile,
  type PortfolioFixPlan,
  type Recommendation,
  type Priority,
  type HoldingInput,
  type MetricsInput,
  type ProjectedMetrics,
  type ScoreBreakdown,
} from "@/lib/fixMyPortfolio";

// ── Tooltip ───────────────────────────────────────────────────────────────────

function Tip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <span className="relative group inline-flex items-center cursor-help">
      {children}
      <span
        className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 rounded-lg px-3 py-2 text-[10px] leading-snug opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-[99] text-center"
        style={{ background: "#1a0030", border: "1px solid #3d005e", color: "#e2d9f3", boxShadow: "0 4px 20px #00000088" }}
      >
        {text}
      </span>
    </span>
  );
}

// ── Dynamic insight line ───────────────────────────────────────────────────────

function insightLine(plan: PortfolioFixPlan): string {
  const highRecos  = plan.recommendations.filter(r => r.priority === "high");
  const reducers   = highRecos.filter(r => r.action === "reduce" || r.action === "trim");
  const tickers    = reducers.map(r => r.ticker).filter(Boolean).slice(0, 2) as string[];

  if (tickers.length > 0) {
    return `You're overexposed to ${tickers.join(" and ")} — reducing concentration can improve stability without meaningfully hurting returns.`;
  }
  if (plan.recommendations.some(r => r.assetClass?.toLowerCase().includes("bond"))) {
    return "No defensive allocation — bonds would reduce drawdown risk without significantly impacting expected returns.";
  }
  if (plan.recommendations.some(r => r.assetClass?.toLowerCase().includes("global") || r.assetClass?.toLowerCase().includes("emerging"))) {
    return "Portfolio is heavily US-focused — adding international exposure reduces single-market dependency.";
  }
  if (plan.score >= 75) {
    return "Portfolio is well-structured. Monitor position drift and rebalance if any holding moves more than 3pp from target.";
  }
  return "A few targeted changes can meaningfully improve your risk-adjusted returns.";
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<Priority, { label: string; color: string; glow: string; bg: string }> = {
  high:   { label: "HIGH IMPACT",   color: "#ff2d78", glow: "#ff2d7833", bg: "#ff2d7811" },
  medium: { label: "MEDIUM IMPACT", color: "#00f5d4", glow: "#00f5d433", bg: "#00f5d411" },
  low:    { label: "LOW IMPACT",    color: "#bf5af2", glow: "#bf5af233", bg: "#bf5af211" },
};

const ACTION_ICON: Record<Recommendation["action"], string> = {
  reduce:   "↓",
  trim:     "↓",
  add:      "+",
  increase: "↑",
};

const ACTION_LABEL: Record<Recommendation["action"], string> = {
  reduce:   "REDUCE",
  trim:     "TRIM",
  add:      "ADD",
  increase: "INCREASE",
};

// ── Profile metadata ──────────────────────────────────────────────────────────

const PROFILE_META = {
  conservative: {
    color:      "#00f5d4",
    glow:       "#00f5d433",
    bg:         "#00f5d40d",
    riskLevel:  1,
    riskLabel:  "Low Risk",
    tag:        "Capital Preservation",
    tagline:    "Strict limits. Bonds required. Prioritises loss avoidance over returns.",
    specs: [
      { label: "Max single position", value: "12%" },
      { label: "Max US equity",       value: "60%" },
      { label: "Max crypto",          value: "3%"  },
      { label: "Bonds",               value: "Required" },
    ],
  },
  balanced: {
    color:      "#bf5af2",
    glow:       "#bf5af233",
    bg:         "#bf5af20d",
    riskLevel:  3,
    riskLabel:  "Moderate Risk",
    tag:        "Growth & Stability",
    tagline:    "Balanced diversification. Accepts some concentration for return potential.",
    specs: [
      { label: "Max single position", value: "20%" },
      { label: "Max US equity",       value: "70%" },
      { label: "Max crypto",          value: "8%"  },
      { label: "Bonds",               value: "Optional" },
    ],
  },
  growth: {
    color:      "#f5a623",
    glow:       "#f5a62333",
    bg:         "#f5a6230d",
    riskLevel:  5,
    riskLabel:  "High Risk",
    tag:        "Maximum Growth",
    tagline:    "Higher concentration tolerance. Suits long-horizon investors.",
    specs: [
      { label: "Max single position", value: "28%" },
      { label: "Max US equity",       value: "82%" },
      { label: "Max crypto",          value: "15%" },
      { label: "Bonds",               value: "Not required" },
    ],
  },
} as const;

function RiskDots({ level, color }: { level: number; color: string }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <div
          key={i}
          className="w-2 h-2 rounded-full"
          style={{ background: i <= level ? color : "#1a0030" }}
        />
      ))}
    </div>
  );
}

// ── Trade risk helper ─────────────────────────────────────────────────────────

function getTradeRisk(r: Recommendation): { level: "Low" | "Medium" | "High"; color: string; note: string } {
  const asset = (r.assetClass ?? "").toLowerCase();

  if (r.action === "reduce" || r.action === "trim") {
    return {
      level: "Low", color: "#00f5d4",
      note: "Reducing a position lowers concentration and limits downside exposure",
    };
  }
  if (asset.includes("bond") || asset.includes("gilt")) {
    return {
      level: "Low", color: "#00f5d4",
      note: "Investment grade bonds have low volatility and act as portfolio stabilisers",
    };
  }
  if (asset.includes("crypto") || (r.ticker ?? "").includes("-USD")) {
    return {
      level: "High", color: "#ff2d78",
      note: "Crypto assets carry high volatility and drawdown risk relative to traditional assets",
    };
  }
  if (asset.includes("emerging")) {
    return {
      level: "Medium", color: "#f5a623",
      note: "Emerging market equities are more volatile than developed market equivalents",
    };
  }
  if (asset.includes("global") || asset.includes("world")) {
    return {
      level: "Low", color: "#00f5d4",
      note: "Broad market ETFs distribute risk across hundreds of holdings globally",
    };
  }
  return {
    level: "Medium", color: "#f5a623",
    note: "Adding equity exposure increases market risk alongside return potential",
  };
}

// ── Score ring ────────────────────────────────────────────────────────────────

function ScoreRing({
  score, label, hhi, effectiveN, calmarRatio, breakdown,
}: {
  score: number; label: string;
  hhi: number; effectiveN: number; calmarRatio: number | null;
  breakdown: ScoreBreakdown;
}) {
  const r     = 38;
  const circ  = 2 * Math.PI * r;
  const fill  = (score / 100) * circ;
  const color =
    score >= 75 ? "#00f5d4" :
    score >= 55 ? "#bf5af2" :
    score >= 35 ? "#f5a623" : "#ff2d78";

  const FACTORS: { key: keyof ScoreBreakdown; label: string; max: number; tip: string }[] = [
    { key: "concentration",   label: "Concentration", max: 30, tip: "How evenly spread your money is. Heavily concentrated in 1–2 stocks scores low. Equal spread scores high." },
    { key: "riskAdjReturn",   label: "Risk vs Return",  max: 25, tip: "Sharpe ratio — how much return you're getting per unit of risk. Above 1.0 is strong." },
    { key: "drawdown",        label: "Drawdown Control", max: 20, tip: "Based on your worst peak-to-trough loss. Smaller drawdowns score higher." },
    { key: "diversification", label: "Diversification",  max: 15, tip: "Geographic spread (US only vs global) and mix of asset types (stocks, ETFs, bonds)." },
    { key: "alignment",       label: "Profile Fit",       max: 10, tip: "How well your current portfolio volatility and exposure match your selected risk profile." },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Ring + headline stats */}
      <div className="flex items-center gap-5">
        <div className="relative w-20 h-20 shrink-0">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            <circle cx="50" cy="50" r={r} fill="none" stroke="#1a0030" strokeWidth="10" />
            <circle
              cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="10"
              strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 8px ${color})`, transition: "stroke-dasharray 0.9s ease" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-bold font-mono" style={{ color }}>{score}</span>
            <span className="text-[9px] text-muted font-mono">/ 100</span>
          </div>
        </div>
        <div className="flex-1">
          <div className="text-lg font-bold" style={{ color }}>{label}</div>
          <div className="text-[10px] text-muted mt-0.5 font-mono">Multi-factor portfolio quality score</div>
          {/* Key quant stats inline */}
          <div className="grid grid-cols-3 gap-2 mt-2.5">
            {[
              { label: "HHI",    value: hhi.toFixed(3),    tip: "Concentration index (0–1). Lower is better — 0 means perfectly spread, 1 means one position holds everything." },
              { label: "Eff-N",  value: effectiveN.toFixed(1), tip: "Effective number of positions. If you hold 6 stocks equally weighted, Eff-N = 6. Concentration pulls this down." },
              { label: "Calmar", value: calmarRatio != null ? calmarRatio.toFixed(2) : "—", tip: "Return divided by worst drawdown. Higher = better. Above 1.0 means you're earning more than your worst loss." },
            ].map(s => (
              <Tip key={s.label} text={s.tip}>
                <div className="rounded-lg px-2 py-1.5 w-full" style={{ background: "#0d0020", border: "1px solid #1a0030" }}>
                  <div className="text-[10px] font-mono font-bold text-text">{s.value}</div>
                  <div className="text-[9px] text-muted">{s.label} ⓘ</div>
                </div>
              </Tip>
            ))}
          </div>
        </div>
      </div>

      {/* Score breakdown bars */}
      <div className="flex flex-col gap-1.5 pt-1" style={{ borderTop: "1px solid #1a0030" }}>
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted mb-0.5">Score breakdown</div>
        {FACTORS.map(f => {
          const val  = breakdown[f.key];
          const pct  = (val / f.max) * 100;
          const fc   = pct >= 70 ? "#00f5d4" : pct >= 40 ? "#bf5af2" : "#ff2d78";
          return (
            <div key={f.key} className="flex items-center gap-2">
              <Tip text={f.tip}>
                <span className="text-[10px] text-muted w-36 shrink-0 cursor-help border-b border-dashed" style={{ borderColor: "#3a2a50" }}>{f.label} ⓘ</span>
              </Tip>
              <div className="flex-1 h-1.5 rounded-full" style={{ background: "#1a0030" }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, background: fc, boxShadow: `0 0 6px ${fc}66` }}
                />
              </div>
              <span className="text-[10px] font-mono w-10 text-right" style={{ color: fc }}>
                {val}/{f.max}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Before / After metrics ────────────────────────────────────────────────────

const CONCENTRATION_ORDER = { "Low": 0, "Moderate": 1, "High": 2, "Very High": 3 } as const;

function BeforeAfter({
  metrics,
  projected,
  currentMaxWeight,
  currentConcentration,
  currentHHI,
  currentEffN,
}: {
  metrics: MetricsInput;
  projected: ProjectedMetrics;
  currentMaxWeight: number;
  currentConcentration: ReturnType<typeof concentrationLabel>;
  currentHHI: number;
  currentEffN: number;
}) {
  const concImproved =
    CONCENTRATION_ORDER[projected.concentrationLevel] <= CONCENTRATION_ORDER[currentConcentration];

  const rows = [
    {
      label: "Volatility",
      before: metrics.volatility != null ? `${(metrics.volatility * 100).toFixed(1)}%` : "—",
      after:  `${(projected.volatility * 100).toFixed(1)}%`,
      improved: metrics.volatility != null && projected.volatility < metrics.volatility,
    },
    {
      label: "Sharpe Ratio",
      before: metrics.sharpe_ratio != null ? metrics.sharpe_ratio.toFixed(2) : "—",
      after:  projected.sharpe.toFixed(2),
      improved: metrics.sharpe_ratio != null && projected.sharpe > metrics.sharpe_ratio,
    },
    {
      label: "HHI",
      before: currentHHI.toFixed(3),
      after:  projected.hhi.toFixed(3),
      improved: projected.hhi < currentHHI,
    },
    {
      label: "Effective-N",
      before: currentEffN.toFixed(1),
      after:  projected.effectiveN.toFixed(1),
      improved: projected.effectiveN > currentEffN,
    },
    {
      label: "Concentration",
      before: currentConcentration,
      after:  projected.concentrationLevel,
      improved: concImproved,
    },
    {
      label: "Largest Position",
      before: `${currentMaxWeight}%`,
      after:  `${projected.maxSingleWeight}%`,
      improved: projected.maxSingleWeight < currentMaxWeight,
    },
  ];

  return (
    <div className="synth-card rounded-xl overflow-hidden" style={{ borderColor: "#2a0050" }}>
      <div className="px-5 py-3" style={{ borderBottom: "1px solid #1a0030" }}>
        <span className="text-[11px] font-mono uppercase tracking-widest text-muted">Projected After Changes</span>
        <Tip text="Projected using MCTR: how much volatility each position contributes per unit of weight. Reducing a high-MCTR position lowers total portfolio risk.">
          <span className="ml-2 text-[10px] text-muted/40 cursor-help">(first-order estimate ⓘ)</span>
        </Tip>
      </div>
      <div className="divide-y" style={{ borderColor: "#1a0030" }}>
        {rows.map(row => (
          <div key={row.label} className="flex items-center px-5 py-3 gap-4">
            <span className="text-xs text-muted w-32 shrink-0">{row.label}</span>
            <span className="font-mono text-sm text-muted flex-1">{row.before}</span>
            <span className="text-muted mx-1">→</span>
            <span
              className="font-mono text-sm font-bold flex-1 text-right"
              style={{ color: row.improved ? "#00f5d4" : "#ff2d78" }}
            >
              {row.after}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Recommendation card ───────────────────────────────────────────────────────

function RecoCard({ r, index }: { r: Recommendation; index: number }) {
  const [open, setOpen] = useState(index === 0); // first card open by default
  const p     = PRIORITY_CONFIG[r.priority];
  const name  = r.ticker ?? r.assetClass ?? "Asset";
  const icon  = ACTION_ICON[r.action];
  const label = ACTION_LABEL[r.action];

  const isHigh = r.priority === "high";

  return (
    <div
      className="rounded-xl overflow-hidden cursor-pointer transition-all"
      style={{
        background: p.bg,
        border:     `1px solid ${p.glow}`,
        boxShadow:  isHigh ? `0 0 16px ${p.glow}` : undefined,
      }}
      onClick={() => setOpen(o => !o)}
    >
      {/* Priority bar */}
      <div
        className="px-4 py-1.5 flex items-center justify-between"
        style={{ background: `${p.color}18`, borderBottom: `1px solid ${p.glow}` }}
      >
        <span className="text-[10px] font-bold font-mono tracking-widest" style={{ color: p.color }}>
          {p.label}
        </span>
        {isHigh && (
          <span className="text-[10px] font-mono" style={{ color: p.color }}>
            ● Act on this first
          </span>
        )}
      </div>

      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Action icon */}
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-lg shrink-0"
          style={{ background: `${p.color}22`, color: p.color }}
        >
          {icon}
        </div>

        {/* Label + action */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-muted">{label}</span>
            <span className="font-bold font-mono text-text truncate">{name}</span>
          </div>
          {/* Weight change */}
          <div className="flex items-center gap-1.5 mt-0.5 font-mono text-xs">
            {r.currentWeight > 0 && (
              <>
                <span className="text-muted">{r.currentWeight}%</span>
                <span className="text-muted">→</span>
              </>
            )}
            <span style={{ color: p.color }} className="font-bold">{r.targetWeight}%</span>
            <span
              className="px-1.5 py-0.5 rounded text-[10px] font-bold"
              style={{ background: `${p.color}22`, color: p.color }}
            >
              {r.changePct >= 0 ? "+" : ""}{r.changePct}pp
            </span>
          </div>
        </div>

        {/* Amount */}
        <div className="text-right shrink-0">
          <div className="font-bold font-mono text-sm" style={{ color: p.color }}>
            £{r.amountGBP.toLocaleString("en-GB")}
          </div>
          <div className="text-[10px] text-muted font-mono">to {r.action === "add" || r.action === "increase" ? "buy" : "sell"}</div>
        </div>

        <span className="text-muted text-xs ml-1">{open ? "▲" : "▼"}</span>
      </div>

      {/* Expanded */}
      {open && (
        <div
          className="px-4 pb-4 flex flex-col gap-3 pt-1"
          style={{ borderTop: `1px solid ${p.glow}` }}
        >
          {/* Trade risk */}
          {(() => {
            const tr = getTradeRisk(r);
            const trDots = tr.level === "Low" ? 1 : tr.level === "Medium" ? 3 : 5;
            return (
              <div className="mt-3 flex items-start justify-between gap-4 rounded-lg px-3 py-2.5"
                style={{ background: `${tr.color}0e`, border: `1px solid ${tr.color}33` }}>
                <div className="flex-1">
                  <Tip text="Risk of executing this specific trade — not the same as portfolio risk. Selling = low trade risk. Adding new assets = medium. Adding crypto = high.">
                    <div className="text-[10px] font-mono uppercase tracking-wider mb-1 cursor-help" style={{ color: tr.color }}>
                      Trade Risk — {tr.level} ⓘ
                    </div>
                  </Tip>
                  <p className="text-[11px] leading-relaxed" style={{ color: tr.color + "bb" }}>{tr.note}</p>
                </div>
                <RiskDots level={trDots} color={tr.color} />
              </div>
            );
          })()}
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted mb-1.5">Rationale</div>
            <p className="text-sm text-text leading-relaxed">{r.reason}</p>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted mb-1.5">Expected Impact</div>
            <p className="text-sm leading-relaxed" style={{ color: p.color }}>{r.expectedImpact}</p>
          </div>

          {/* CGT warning — only shown for sell actions with a gain */}
          {(r.action === "reduce" || r.action === "trim") && (r.pnlPct ?? 0) > 0 && (
            <div
              className="rounded-lg px-3 py-2.5 flex gap-2 items-start"
              style={{ background: "#f5a6230d", border: "1px solid #f5a62333" }}
            >
              <span className="text-[10px] font-bold shrink-0 mt-px" style={{ color: "#f5a623" }}>⚠</span>
              <p className="text-[11px] leading-relaxed" style={{ color: "#f5a623cc" }}>
                Selling a position at a gain may trigger a Capital Gains Tax liability in the UK. Consider your annual CGT allowance and consult a tax adviser before acting.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Profile toggle ────────────────────────────────────────────────────────────

function ProfileToggle({ value, onChange }: { value: RiskProfile; onChange: (p: RiskProfile) => void }) {
  const opts: { key: RiskProfile }[] = [
    { key: "conservative" },
    { key: "balanced" },
    { key: "growth" },
  ];

  return (
    <div className="flex gap-2">
      {opts.map(({ key }) => {
        const meta    = PROFILE_META[key];
        const active  = value === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className="flex-1 rounded-xl px-3 py-2.5 text-left transition-all"
            style={
              active
                ? { background: meta.bg, border: `1px solid ${meta.color}`, boxShadow: `0 0 14px ${meta.glow}` }
                : { background: "#0d0020", border: "1px solid #2a0050" }
            }
          >
            <div className="flex items-center justify-between mb-1.5">
              <span
                className="text-xs font-bold font-mono"
                style={{ color: active ? meta.color : "#6b5e7e" }}
              >
                {key.charAt(0).toUpperCase() + key.slice(1)}
              </span>
              <RiskDots level={meta.riskLevel} color={active ? meta.color : "#2a0050"} />
            </div>
            <div
              className="text-[10px] font-mono"
              style={{ color: active ? meta.color + "bb" : "#3a2a50" }}
            >
              {meta.riskLabel}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ProfileBanner({ profile }: { profile: RiskProfile }) {
  const meta = PROFILE_META[profile];
  return (
    <div
      className="rounded-xl px-4 py-3 flex flex-col gap-2.5"
      style={{ background: meta.bg, border: `1px solid ${meta.glow}` }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold" style={{ color: meta.color }}>{meta.tag}</span>
        <span className="text-[10px] font-mono" style={{ color: meta.color + "99" }}>{meta.tagline.split(".")[0]}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1">
        {meta.specs.map(s => (
          <div key={s.label} className="flex items-center justify-between">
            <span className="text-[10px] text-muted">{s.label}</span>
            <span className="text-[10px] font-mono font-bold" style={{ color: meta.color }}>{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

type Props = {
  holdings: HoldingInput[];
  metrics: MetricsInput;
  totalPortfolioValue: number;
  initialProfile?: RiskProfile;
  onClose: () => void;
};

type RecommendationFilter = "all" | Priority;

function formatGBP(amount: number): string {
  return `£${Math.abs(amount).toLocaleString("en-GB")}`;
}

export default function FixMyPortfolioPanel({ holdings, metrics, totalPortfolioValue, initialProfile = "balanced", onClose }: Props) {
  const [profile, setProfile] = useState<RiskProfile>(initialProfile);
  const [plan, setPlan]       = useState<PortfolioFixPlan | null>(null);
  const [filter, setFilter] = useState<RecommendationFilter>("all");
  const [copiedPlan, setCopiedPlan] = useState(false);

  useEffect(() => {
    setProfile(initialProfile);
  }, [initialProfile]);

  useEffect(() => {
    setPlan(generatePortfolioFixPlan(holdings, metrics, profile, totalPortfolioValue));
  }, [holdings, metrics, profile, totalPortfolioValue]);

  if (!plan) return null;

  const highCount        = plan.recommendations.filter(r => r.priority === "high").length;
  const medCount         = plan.recommendations.filter(r => r.priority === "medium").length;
  const lowCount         = plan.recommendations.filter(r => r.priority === "low").length;
  const currentMaxWeight = Math.round(Math.max(...holdings.map(h => (h.weight ?? 0) * 100), 0));
  const currentConcentration = concentrationLabel(currentMaxWeight);
  const unclassified     = getUnclassifiedTickers(holdings);
  const filteredRecommendations = filter === "all"
    ? plan.recommendations
    : plan.recommendations.filter(r => r.priority === filter);

  const totalBuyGBP = plan.recommendations
    .filter(r => r.action === "add" || r.action === "increase")
    .reduce((sum, r) => sum + r.amountGBP, 0);
  const totalSellGBP = plan.recommendations
    .filter(r => r.action === "reduce" || r.action === "trim")
    .reduce((sum, r) => sum + r.amountGBP, 0);
  const netDeployGBP = totalBuyGBP - totalSellGBP;

  function recommendationLabel(r: Recommendation): string {
    const target = r.ticker ?? r.assetClass ?? "asset";
    if (r.action === "add") return `Add ${target} (${r.targetWeight}%)`;
    if (r.action === "increase") return `Increase ${target} to ${r.targetWeight}%`;
    if (r.action === "reduce") return `Reduce ${target} to ${r.targetWeight}%`;
    return `Trim ${target} to ${r.targetWeight}%`;
  }

  async function copyActionPlan() {
    const sourcePlan = plan;
    if (!sourcePlan) return;

    const lines = sourcePlan.recommendations.map((r, i) => {
      const side = r.action === "add" || r.action === "increase" ? "Buy" : "Sell";
      return `${i + 1}. ${recommendationLabel(r)} — ${side} ${formatGBP(r.amountGBP)} (${r.priority})`;
    });
    const text = [
      "Portivex Review Action Plan",
      `Risk profile: ${profile}`,
      `Top priority: ${sourcePlan.topPriorityAction}`,
      "",
      ...lines,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(text);
      setCopiedPlan(true);
      setTimeout(() => setCopiedPlan(false), 1800);
    } catch {}
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ background: "rgba(5,0,12,0.80)", backdropFilter: "blur(8px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="h-full overflow-y-auto flex flex-col"
        style={{
          width: "min(660px, 100vw)",
          background: "linear-gradient(170deg, #0f0020 0%, #080012 60%, #0a001a 100%)",
          borderLeft: "1px solid #2a0050",
          boxShadow: "-12px 0 60px #bf5af222, -2px 0 0 #3d005e",
        }}
      >
        {/* Sticky header */}
        <div
          className="sticky top-0 z-10 px-6 py-4"
          style={{ background: "#0f0020ee", borderBottom: "1px solid #2a0050", backdropFilter: "blur(12px)" }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-bold text-base text-text">Portfolio Review</h2>
              {plan && (
                <p className="text-xs mt-1 leading-relaxed max-w-sm" style={{ color: "#9b8ab0" }}>
                  {insightLine(plan)}
                </p>
              )}
            </div>
            <button onClick={onClose} style={{ color: "#6b5e7e" }} className="hover:text-text transition-colors text-lg leading-none shrink-0 mt-0.5">✕</button>
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-7 px-6 py-6">

          {/* Profile toggle */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[11px] text-muted uppercase tracking-widest font-mono">Risk Profile</div>
              <div className="text-[10px] font-mono" style={{ color: "#6b5e7e" }}>
                {profile === initialProfile ? "Using saved profile" : "What-if override active"}
              </div>
            </div>
            <ProfileToggle value={profile} onChange={setProfile} />
            <ProfileBanner profile={profile} />
          </div>

          {/* Score + summary stats */}
          <div
            className="rounded-xl p-5 flex flex-col gap-5"
            style={{ background: "linear-gradient(135deg, #16002b, #0d0020)", border: "1px solid #2a0050" }}
          >
            <ScoreRing
              score={plan.score}
              label={plan.scoreLabel}
              hhi={plan.hhi}
              effectiveN={plan.effectiveN}
              calmarRatio={plan.calmarRatio}
              breakdown={plan.scoreBreakdown}
            />
            {/* Action counts */}
            <div className="flex gap-4 pt-1" style={{ borderTop: "1px solid #1a0030" }}>
              {[
                { count: highCount,   color: "#ff2d78", label: "High Impact" },
                { count: medCount,    color: "#00f5d4", label: "Medium Impact" },
                { count: lowCount,    color: "#bf5af2", label: "Low Impact" },
              ].map(({ count, color, label }) => count > 0 && (
                <div key={label} className="flex items-center gap-2">
                  <span className="font-bold font-mono text-sm" style={{ color }}>{count}</span>
                  <span className="text-xs text-muted">{label}</span>
                </div>
              ))}
              {plan.recommendations.length === 0 && (
                <span className="text-xs text-muted">No changes required</span>
              )}
            </div>
          </div>

          {/* Top priority action banner */}
          {plan.recommendations.length > 0 && (
            <div
              className="rounded-xl px-5 py-4"
              style={{
                background: "linear-gradient(90deg, #ff2d7815, #bf5af215)",
                border: "1px solid #ff2d7833",
                boxShadow: "0 0 20px #ff2d7811",
              }}
            >
              <div className="text-[10px] font-mono uppercase tracking-widest mb-1.5" style={{ color: "#ff2d78" }}>
                ● Top Priority Action
              </div>
              <p className="text-sm font-medium text-text leading-relaxed">{plan.topPriorityAction}</p>
            </div>
          )}

          {/* Capital movement summary */}
          {plan.recommendations.length > 0 && (
            <div
              className="rounded-xl px-5 py-4 grid grid-cols-3 gap-3"
              style={{ background: "#0d0020", border: "1px solid #2a0050" }}
            >
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#6b5e7e" }}>Total Buys</div>
                <div className="text-sm font-bold mt-1" style={{ color: "#00f5d4" }}>{formatGBP(totalBuyGBP)}</div>
              </div>
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#6b5e7e" }}>Total Sells</div>
                <div className="text-sm font-bold mt-1" style={{ color: "#ff2d78" }}>{formatGBP(totalSellGBP)}</div>
              </div>
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#6b5e7e" }}>Net Cash</div>
                <div className="text-sm font-bold mt-1" style={{ color: netDeployGBP >= 0 ? "#00f5d4" : "#ff2d78" }}>
                  {netDeployGBP >= 0 ? `${formatGBP(netDeployGBP)} to deploy` : `${formatGBP(netDeployGBP)} to free up`}
                </div>
              </div>
            </div>
          )}

          {/* Primary issues */}
          <div className="flex flex-col gap-3">
            <div className="text-[11px] text-muted uppercase tracking-widest font-mono">Issues Detected</div>
            {plan.primaryIssues.map((issue, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0 text-sm" style={{ color: "#ff2d78" }}>⚠</span>
                <span className="text-sm text-text leading-relaxed">{issue}</span>
              </div>
            ))}
          </div>

          {/* Recommendations */}
          {plan.recommendations.length > 0 && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="text-[11px] text-muted uppercase tracking-widest font-mono">Recommended Changes</div>
                <button
                  onClick={copyActionPlan}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-mono transition-all"
                  style={{ background: "#0d0020", border: "1px solid #2a0050", color: copiedPlan ? "#00f5d4" : "#6b5e7e" }}
                >
                  {copiedPlan ? "Copied" : "Copy Plan"}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: "all" as RecommendationFilter, label: `All (${plan.recommendations.length})` },
                  { key: "high" as RecommendationFilter, label: `High (${highCount})` },
                  { key: "medium" as RecommendationFilter, label: `Medium (${medCount})` },
                  { key: "low" as RecommendationFilter, label: `Low (${lowCount})` },
                ].map((opt) => {
                  const active = filter === opt.key;
                  return (
                    <button
                      key={opt.key}
                      onClick={() => setFilter(opt.key)}
                      className="px-2.5 py-1 rounded-lg text-[10px] font-mono transition-all"
                      style={{
                        background: active ? "linear-gradient(90deg,#bf5af211,#ff2d7811)" : "#0d0020",
                        border: `1px solid ${active ? "#bf5af255" : "#2a0050"}`,
                        color: active ? "#e2d9f3" : "#6b5e7e",
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {filteredRecommendations.length === 0 && (
                <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "#0d0020", border: "1px solid #2a0050", color: "#6b5e7e" }}>
                  No recommendations in this filter.
                </div>
              )}
              {filteredRecommendations.map((r, i) => (
                <RecoCard key={`${r.action}-${r.ticker ?? r.assetClass ?? i}-${i}`} r={r} index={i} />
              ))}
            </div>
          )}

          {/* Before / After */}
          {plan.recommendations.length > 0 && (
            <div className="flex flex-col gap-3">
              <div className="text-[11px] text-muted uppercase tracking-widest font-mono">Before vs After</div>
              <BeforeAfter
                metrics={metrics}
                projected={plan.projectedMetrics}
                currentMaxWeight={currentMaxWeight}
                currentConcentration={currentConcentration}
                currentHHI={plan.hhi}
                currentEffN={plan.effectiveN}
              />
            </div>
          )}

          {/* Expected benefits */}
          <div className="flex flex-col gap-3">
            <div className="text-[11px] text-muted uppercase tracking-widest font-mono">Expected Benefits</div>
            {plan.expectedBenefits.map((b, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0" style={{ color: "#00f5d4" }}>✓</span>
                <span className="text-sm text-text leading-relaxed">{b}</span>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div
            className="rounded-xl p-5"
            style={{ background: "linear-gradient(135deg, #16002b, #0d0020)", border: "1px solid #bf5af233" }}
          >
            <div className="text-[11px] text-muted uppercase tracking-widest font-mono mb-3">Assessment</div>
            <p className="text-sm text-text leading-relaxed">{plan.summary}</p>
          </div>

          {/* Unknown holdings notice */}
          {unclassified.length > 0 && (
            <div
              className="rounded-xl px-4 py-3 flex gap-3 items-start"
              style={{ background: "#f5a6230a", border: "1px solid #f5a62322" }}
            >
              <span className="text-xs shrink-0 mt-px" style={{ color: "#f5a623" }}>ⓘ</span>
              <p className="text-[11px] leading-relaxed" style={{ color: "#f5a623aa" }}>
                <span className="font-semibold" style={{ color: "#f5a623" }}>
                  {unclassified.length === 1
                    ? `${unclassified[0]} uses`
                    : `${unclassified.slice(0, -1).join(", ")} and ${unclassified.at(-1)} use`}
                </span>
                {" "}generic equity risk estimates (σ 30%, ρ 0.65) as{" "}
                {unclassified.length === 1 ? "it is" : "they are"} not in the classification database.
                Volatility and risk contribution figures for{" "}
                {unclassified.length === 1 ? "this holding" : "these holdings"} may be less precise.
              </p>
            </div>
          )}

          {/* Disclaimer */}
          <p className="text-[11px] pb-4 leading-relaxed" style={{ color: "#4a3a5e" }}>
            Analysis uses variance-based risk decomposition (MCTR/HHI) with modelled long-run asset volatilities and correlations — not live data. Projected improvements are illustrative estimates, not guarantees of future performance. Past performance is not a reliable indicator of future results. This tool does not constitute financial advice. Consult a qualified financial adviser before making investment decisions.
          </p>

        </div>
      </div>
    </div>
  );
}
