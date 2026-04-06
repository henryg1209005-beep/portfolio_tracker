"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import {
  fetchCorrelation, fetchCorrelationSuggestions, fetchRollingCorrelation,
  type CorrelationData, type SuggestionsData, type RollingCorrelationData,
} from "@/lib/api";
import { computeCorrelationAnalytics, type CorrelationAnalytics, type PairResult } from "@/lib/correlationAnalytics";
import { buildDemoCorrelationBundle } from "@/lib/demoPortfolio";
import { useDemoMode } from "@/lib/demoModeContext";
import CorrelationHeatmap from "@/components/CorrelationHeatmap";
import RollingCorrelationChart from "@/components/RollingCorrelationChart";

// ── Types ─────────────────────────────────────────────────────────────────────

type Timeframe = "1M" | "3M" | "6M" | "1Y" | "5Y";
type CorrMethod = "pearson" | "spearman";

const TIMEFRAMES: Timeframe[] = ["1M", "3M", "6M", "1Y", "5Y"];

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

// ── Summary metric cards ──────────────────────────────────────────────────────

function MetricCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent: string;
}) {
  return (
    <div
      className="synth-card rounded-xl px-4 py-3.5 flex flex-col gap-1 flex-1 min-w-0"
      style={{ borderColor: `${accent}33` }}
    >
      <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: accent }}>
        {label}
      </span>
      <span className="text-xl font-bold font-mono" style={{ color: accent }}>{value}</span>
      {sub && <span className="text-[11px]" style={{ color: "#4a3a5e" }}>{sub}</span>}
    </div>
  );
}

function SummaryRow({ analytics }: { analytics: CorrelationAnalytics }) {
  const avgCorr = analytics.weightedAvgCorrelation;
  const flagColor = analytics.concentrationFlag ? "#ff2d78" : "#00f5d4";
  const scoreColor =
    analytics.diversificationScore >= 60 ? "#00f5d4" :
    analytics.diversificationScore >= 40 ? "#bf5af2" : "#ff2d78";
  const drColor =
    analytics.diversificationRatio === null ? "#6b5e7e" :
    analytics.diversificationRatio >= 1.5 ? "#00f5d4" :
    analytics.diversificationRatio >= 1.15 ? "#bf5af2" : "#ff2d78";

  return (
    <div className="flex gap-3 flex-wrap">
      <MetricCard
        label="Avg Correlation"
        value={avgCorr >= 0 ? `+${avgCorr.toFixed(2)}` : avgCorr.toFixed(2)}
        sub={
          analytics.method === "spearman" ? "Spearman (rank)" :
          avgCorr > 0.6 ? "High synchronisation" : avgCorr > 0.3 ? "Moderate" : "Low"
        }
        accent={avgCorr > 0.6 ? "#ff2d78" : avgCorr > 0.3 ? "#bf5af2" : "#00f5d4"}
      />
      <MetricCard
        label="Diversification"
        value={`${analytics.diversificationScore} / 100`}
        sub={
          analytics.diversificationRatio !== null
            ? `DR: ${analytics.diversificationRatio.toFixed(2)}x`
            : analytics.diversificationScore >= 60 ? "Well diversified" : analytics.diversificationScore >= 40 ? "Moderate" : "Needs improvement"
        }
        accent={scoreColor}
      />
      <MetricCard
        label="Concentration"
        value={analytics.concentrationFlag ? "High" : "OK"}
        sub={analytics.concentrationFlag ? "Portfolio moves together" : "Acceptable spread"}
        accent={flagColor}
      />
      <MetricCard
        label="Diversifiers"
        value={String(analytics.diversifiers.length)}
        sub={analytics.diversifiers.length > 0 ? analytics.diversifiers.join(", ") : "None detected"}
        accent={analytics.diversifiers.length > 0 ? "#00f5d4" : "#6b5e7e"}
      />
      {analytics.diversificationRatio !== null && (
        <MetricCard
          label="Diversification Ratio"
          value={`${analytics.diversificationRatio.toFixed(2)}x`}
          sub={
            analytics.diversificationRatio >= 1.5 ? "Strong risk reduction" :
            analytics.diversificationRatio >= 1.15 ? "Moderate benefit" : "Weak — acts like one asset"
          }
          accent={drColor}
        />
      )}
    </div>
  );
}

// ── Pair row ─────────────────────────────────────────────────────────────────

function PairRow({ pair, rank }: { pair: PairResult; rank: number }) {
  const color =
    pair.level === "high"     ? "#00f5d4" :
    pair.level === "moderate" ? "#bf5af2" :
    pair.level === "inverse"  ? "#ff2d78" : "#6b5e7e";

  return (
    <div className="flex items-center gap-2 sm:gap-3 py-2" style={{ borderBottom: "1px solid #1a0030" }}>
      <span className="text-[10px] font-mono text-muted w-4 shrink-0">{rank}</span>
      <span className="font-mono text-xs sm:text-sm text-text flex-1 break-all">
        {pair.row.replace(".L","")}
        <span className="text-muted mx-1">/</span>
        {pair.col.replace(".L","")}
      </span>
      <span className="font-mono text-xs sm:text-sm font-bold shrink-0" style={{ color }}>
        {pair.value >= 0 ? "+" : ""}{pair.value.toFixed(3)}
      </span>
      <span
        className="hidden sm:inline text-[10px] font-mono px-1.5 py-0.5 rounded w-16 text-center shrink-0"
        style={{ background: `${color}18`, color, border: `1px solid ${color}33` }}
      >
        {pair.level.toUpperCase()}
      </span>
      {!pair.confident && (
        <span
          className="text-[9px] font-mono px-1 py-0.5 rounded shrink-0"
          style={{ background: "#f5a62318", color: "#f5a623", border: "1px solid #f5a62333" }}
          title={`Only ${pair.overlap} overlapping days — low confidence`}
        >
          LOW DATA
        </span>
      )}
    </div>
  );
}

// ── Suggestions panel ────────────────────────────────────────────────────────

function SuggestionsPanel({ data }: { data: SuggestionsData }) {
  if (!data.suggestions || data.suggestions.length === 0) return null;

  return (
    <div
      className="synth-card rounded-xl flex flex-col overflow-hidden"
      style={{ borderColor: "#2a0050", width: "100%" }}
    >
      <div className="px-5 py-4" style={{ borderBottom: "1px solid #1a0030" }}>
        <div className="text-[11px] font-mono uppercase tracking-widest" style={{ color: "#00f5d4" }}>
          What Should I Add?
        </div>
        <div className="text-xs mt-0.5" style={{ color: "#4a3a5e" }}>
          Assets that would improve your diversification
        </div>
      </div>

      <div className="px-5 py-3 flex flex-col gap-0.5">
        {data.suggestions.map((s) => {
          const reductionPct = ((s.correlation_reduction / Math.max(0.01, data.current_avg_correlation)) * 100);
          const impactColor = s.correlation_reduction > 0.05 ? "#00f5d4" : s.correlation_reduction > 0.02 ? "#bf5af2" : "#6b5e7e";
          return (
            <div key={s.ticker} className="flex items-center gap-3 py-2.5" style={{ borderBottom: "1px solid #1a0030" }}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-text">{s.ticker.replace(".L", "")}</span>
                  <span
                    className="text-[9px] font-mono px-1.5 py-0.5 rounded"
                    style={{ background: "#bf5af218", color: "#bf5af2", border: "1px solid #bf5af233" }}
                  >
                    {s.asset_class}
                  </span>
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: "#4a3a5e" }}>{s.name}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-mono text-sm font-bold" style={{ color: impactColor }}>
                  {s.avg_corr_vs_portfolio >= 0 ? "+" : ""}{s.avg_corr_vs_portfolio.toFixed(2)}
                </div>
                <div className="text-[10px] font-mono" style={{ color: impactColor }}>
                  {s.correlation_reduction > 0 ? `-${reductionPct.toFixed(0)}% avg corr` : "minimal impact"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Insights panel ────────────────────────────────────────────────────────────

function InsightsPanel({ analytics }: { analytics: CorrelationAnalytics }) {
  return (
    <div
      className="synth-card rounded-xl flex flex-col overflow-hidden"
      style={{ borderColor: "#2a0050", width: "100%" }}
    >
      {/* Header */}
      <div className="px-5 py-4" style={{ borderBottom: "1px solid #1a0030" }}>
        <div className="text-[11px] font-mono uppercase tracking-widest text-muted">Correlation Insights</div>
        <div className="text-xs text-muted/50 mt-0.5">
          {analytics.method === "spearman" ? "Spearman rank · " : ""}Deterministic analysis · No estimates
        </div>
      </div>

      <div className="flex flex-col gap-0 divide-y" style={{ borderColor: "#1a0030" }}>

        {/* Most correlated */}
        <div className="px-5 py-4">
          <div className="text-[10px] font-mono uppercase tracking-wider mb-3" style={{ color: "#ff2d78" }}>
            Most Correlated Pairs
          </div>
          {analytics.mostCorrelated.length > 0
            ? analytics.mostCorrelated.map((p, i) => <PairRow key={`m${i}`} pair={p} rank={i+1} />)
            : <p className="text-xs text-muted">No data</p>
          }
        </div>

        {/* Least correlated */}
        <div className="px-5 py-4">
          <div className="text-[10px] font-mono uppercase tracking-wider mb-3" style={{ color: "#00f5d4" }}>
            Least Correlated Pairs
          </div>
          {analytics.leastCorrelated.length > 0
            ? analytics.leastCorrelated.map((p, i) => <PairRow key={`l${i}`} pair={p} rank={i+1} />)
            : <p className="text-xs text-muted">No data</p>
          }
        </div>

        {/* Redundant assets */}
        <div className="px-5 py-4">
          <div className="text-[10px] font-mono uppercase tracking-wider mb-3" style={{ color: "#f5a623" }}>
            Redundant Assets
          </div>
          {analytics.redundantAssets.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {analytics.redundantAssets.map(t => (
                <span
                  key={t}
                  className="text-xs font-mono px-2 py-1 rounded"
                  style={{ background: "#f5a62318", color: "#f5a623", border: "1px solid #f5a62333" }}
                >
                  {t.replace(".L","")}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted">No redundant assets detected</p>
          )}
          {analytics.redundantAssets.length > 0 && (
            <p className="text-[11px] mt-2" style={{ color: "#4a3a5e" }}>
              Correlation &gt; 0.7 with 2 or more other holdings
            </p>
          )}
        </div>

        {/* Diversifiers */}
        <div className="px-5 py-4">
          <div className="text-[10px] font-mono uppercase tracking-wider mb-3" style={{ color: "#00f5d4" }}>
            Diversifiers
          </div>
          {analytics.diversifiers.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {analytics.diversifiers.map(t => (
                <span
                  key={t}
                  className="text-xs font-mono px-2 py-1 rounded"
                  style={{ background: "#00f5d418", color: "#00f5d4", border: "1px solid #00f5d433" }}
                >
                  {t.replace(".L","")}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted">No strong diversifiers identified</p>
          )}
          {analytics.diversifiers.length > 0 && (
            <p className="text-[11px] mt-2" style={{ color: "#4a3a5e" }}>
              Avg correlation vs all others &lt; 0.3
            </p>
          )}
        </div>

        {/* Suggested actions */}
        <div className="px-5 py-4">
          <div className="text-[10px] font-mono uppercase tracking-wider mb-3 text-muted">
            Observations
          </div>
          <div className="flex flex-col gap-2">
            {analytics.suggestedActions.map((a, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span className="text-[10px] mt-0.5 shrink-0" style={{ color: "#bf5af2" }}>→</span>
                <span className="text-xs text-text leading-relaxed">{a}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CorrelationPage() {
  const { isDemoMode, demoData } = useDemoMode();
  const [data,        setData]        = useState<CorrelationData | null>(null);
  const [suggestions, setSuggestions]  = useState<SuggestionsData | null>(null);
  const [rolling,     setRolling]     = useState<RollingCorrelationData | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [timeframe,   setTimeframe]   = useState<Timeframe>("1Y");
  const [method,      setMethod]      = useState<CorrMethod>("pearson");

  const load = useCallback(async (tf: Timeframe, m: CorrMethod) => {
    setLoading(true);
    setError("");
    setSuggestions(null);
    setRolling(null);
    if (isDemoMode) {
      const demo = buildDemoCorrelationBundle(demoData.holdings, tf, m);
      setData(demo.correlation);
      setSuggestions(demo.suggestions);
      setRolling(demo.rolling);
      setLoading(false);
      return;
    }
    try {
      // Load heatmap first — it's cached and renders immediately
      const corrData = await fetchCorrelation(tf, m);
      setData(corrData);
      setLoading(false);
      // Load secondary panels in the background — don't block the heatmap
      fetchCorrelationSuggestions(tf).then(setSuggestions).catch(() => null);
      fetchRollingCorrelation(tf).then(setRolling).catch(() => null);
    } catch (err) {
      setError(errorMessage(err, "Could not reach the API right now. Please try again in a moment."));
      setLoading(false);
    }
  }, [isDemoMode, demoData.holdings]);

  useEffect(() => { load(timeframe, method); }, [timeframe, method, load, isDemoMode, demoData.refreshed_at]);

  const analytics = useMemo<CorrelationAnalytics | null>(() => {
    if (!data || data.tickers.length < 2) return null;
    return computeCorrelationAnalytics(data.tickers, data.matrix, data.weights, data.method);
  }, [data]);

  return (
    <div className="p-4 md:p-6 max-w-screen-2xl mx-auto flex flex-col gap-6">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-text">Diversification Map</h1>
          <p className="text-muted text-sm mt-0.5 font-mono">
            Which holdings move together vs independently ({timeframe})
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* Method toggle */}
          <div className="flex overflow-x-auto max-w-full" style={{ background: "#0d0020", border: "1px solid #2a0050", borderRadius: "0.5rem" }}>
            {(["pearson", "spearman"] as CorrMethod[]).map(m => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                disabled={loading}
                className="px-3 py-1.5 text-xs font-mono font-semibold transition-all disabled:opacity-40 capitalize"
                style={{
                  borderRadius: "0.45rem",
                  color:      m === method ? "#080012" : "#6b5e7e",
                  background: m === method ? "linear-gradient(90deg,#00f5d4,#00b89c)" : "transparent",
                  boxShadow:  m === method ? "0 0 10px #00f5d444" : undefined,
                }}
              >
                {m}
              </button>
            ))}
          </div>

          {/* Timeframe selector */}
          <div className="flex overflow-x-auto max-w-full" style={{ background: "#0d0020", border: "1px solid #2a0050", borderRadius: "0.5rem" }}>
            {TIMEFRAMES.map(tf => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                disabled={loading}
                className="px-3 py-1.5 text-xs font-mono font-semibold transition-all disabled:opacity-40"
                style={{
                  borderRadius: "0.45rem",
                  color:      tf === timeframe ? "#080012" : "#6b5e7e",
                  background: tf === timeframe ? "linear-gradient(90deg,#bf5af2,#ff2d78)" : "transparent",
                  boxShadow:  tf === timeframe ? "0 0 10px #bf5af244" : undefined,
                }}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Refresh */}
          <button
            onClick={() => load(timeframe, method)}
            disabled={loading}
            className="px-4 py-2 text-sm font-mono rounded-lg transition-all disabled:opacity-40"
            style={{ border: "1px solid #2a0050", color: "#6b5e7e" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color="#e2d9f3"; (e.currentTarget as HTMLElement).style.borderColor="#bf5af2"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color="#6b5e7e"; (e.currentTarget as HTMLElement).style.borderColor="#2a0050"; }}
          >
            {loading ? "Loading\u2026" : "\u21BB Refresh"}
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="rounded-xl p-4 text-sm" style={{ background: "#ff2d7811", border: "1px solid #ff2d7833", color: "#ff2d78" }}>
          {error}
        </div>
      )}

      {/* ── Summary metrics ── */}
      {analytics && !loading && (
        <SummaryRow analytics={analytics} />
      )}
      {loading && (
        <div className="flex gap-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="synth-card rounded-xl h-16 flex-1 animate-pulse" style={{ borderColor: "#2a0050" }} />
          ))}
        </div>
      )}

      {/* ── Matrix + Insights (side by side on desktop) ── */}
      {loading && !data ? (
        <div className="synth-card rounded-xl h-96 animate-pulse" style={{ borderColor: "#2a0050" }} />
      ) : data && data.tickers.length >= 2 ? (
        <>
          <div className="flex flex-col xl:flex-row gap-6 items-start">
            {/* Matrix */}
            <div className="flex-1 min-w-0">
              <CorrelationHeatmap data={data} />
            </div>

            {/* Insights */}
            {analytics && (
              <div className="w-full xl:w-80 shrink-0">
                <InsightsPanel analytics={analytics} />
              </div>
            )}
          </div>

          {/* ── Rolling Correlation Chart ── */}
          {rolling && rolling.pairs.length > 0 && (
            <RollingCorrelationChart data={rolling} />
          )}

          {/* ── Diversification Suggestions ── */}
          {suggestions && suggestions.suggestions && suggestions.suggestions.length > 0 && (
            <SuggestionsPanel data={suggestions} />
          )}
        </>
      ) : !loading ? (
        <div
          className="rounded-2xl flex flex-col items-center justify-center py-20 gap-5 text-center"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid #2a0050" }}
        >
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-xl"
            style={{ background: "rgba(191,90,242,0.08)", border: "1px solid rgba(191,90,242,0.2)" }}
          >
            ⬡
          </div>
          <div className="space-y-1.5 max-w-xs">
            <p className="text-base font-semibold text-white">Not enough holdings</p>
            <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.35)" }}>
              Add at least 2 holdings on the Overview page to see correlation data.
            </p>
          </div>
        </div>
      ) : null}

    </div>
  );
}

