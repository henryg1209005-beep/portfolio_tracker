"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { fetchCorrelation, type CorrelationData } from "@/lib/api";
import { computeCorrelationAnalytics, type CorrelationAnalytics, type PairResult } from "@/lib/correlationAnalytics";
import CorrelationHeatmap from "@/components/CorrelationHeatmap";

// ── Types ─────────────────────────────────────────────────────────────────────

type Timeframe = "1M" | "3M" | "6M" | "1Y" | "5Y";

const TIMEFRAMES: Timeframe[] = ["1M", "3M", "6M", "1Y", "5Y"];

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
  const flagColor = analytics.concentrationFlag ? "#ff2d78" : "#00f5d4";
  const scoreColor =
    analytics.diversificationScore >= 60 ? "#00f5d4" :
    analytics.diversificationScore >= 40 ? "#bf5af2" : "#ff2d78";

  return (
    <div className="flex gap-3 flex-wrap">
      <MetricCard
        label="Avg Correlation"
        value={analytics.avgCorrelation >= 0 ? `+${analytics.avgCorrelation.toFixed(2)}` : analytics.avgCorrelation.toFixed(2)}
        sub={analytics.avgCorrelation > 0.6 ? "High synchronisation" : analytics.avgCorrelation > 0.3 ? "Moderate" : "Low"}
        accent={analytics.avgCorrelation > 0.6 ? "#ff2d78" : analytics.avgCorrelation > 0.3 ? "#bf5af2" : "#00f5d4"}
      />
      <MetricCard
        label="Diversification Score"
        value={`${analytics.diversificationScore} / 100`}
        sub={analytics.diversificationScore >= 60 ? "Well diversified" : analytics.diversificationScore >= 40 ? "Moderate" : "Needs improvement"}
        accent={scoreColor}
      />
      <MetricCard
        label="Concentration Flag"
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
    <div className="flex items-center gap-3 py-2" style={{ borderBottom: "1px solid #1a0030" }}>
      <span className="text-[10px] font-mono text-muted w-4 shrink-0">{rank}</span>
      <span className="font-mono text-sm text-text flex-1">
        {pair.row.replace(".L","")}
        <span className="text-muted mx-1">/</span>
        {pair.col.replace(".L","")}
      </span>
      <span className="font-mono text-sm font-bold" style={{ color }}>
        {pair.value >= 0 ? "+" : ""}{pair.value.toFixed(3)}
      </span>
      <span
        className="text-[10px] font-mono px-1.5 py-0.5 rounded w-16 text-center shrink-0"
        style={{ background: `${color}18`, color, border: `1px solid ${color}33` }}
      >
        {pair.level.toUpperCase()}
      </span>
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
        <div className="text-xs text-muted/50 mt-0.5">Deterministic analysis · No estimates</div>
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
  const [data,      setData]      = useState<CorrelationData | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");
  const [timeframe, setTimeframe] = useState<Timeframe>("1Y");

  const load = useCallback(async (tf: Timeframe) => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchCorrelation(tf));
    } catch {
      setError("Could not reach the API. Make sure the Python server is running on port 8000.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(timeframe); }, [timeframe, load]);

  const analytics = useMemo<CorrelationAnalytics | null>(() => {
    if (!data || data.tickers.length < 2) return null;
    return computeCorrelationAnalytics(data.tickers, data.matrix);
  }, [data]);

  return (
    <div className="p-6 max-w-screen-2xl mx-auto flex flex-col gap-6">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Correlation</h1>
          <p className="text-muted text-sm mt-0.5 font-mono">
            Pairwise price correlations · {timeframe} daily returns
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Timeframe selector */}
          <div className="flex" style={{ background: "#0d0020", border: "1px solid #2a0050", borderRadius: "0.5rem" }}>
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
            onClick={() => load(timeframe)}
            disabled={loading}
            className="px-4 py-2 text-sm font-mono rounded-lg transition-all disabled:opacity-40"
            style={{ border: "1px solid #2a0050", color: "#6b5e7e" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color="#e2d9f3"; (e.currentTarget as HTMLElement).style.borderColor="#bf5af2"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color="#6b5e7e"; (e.currentTarget as HTMLElement).style.borderColor="#2a0050"; }}
          >
            {loading ? "Loading…" : "↻ Refresh"}
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
          {[...Array(4)].map((_, i) => (
            <div key={i} className="synth-card rounded-xl h-16 flex-1 animate-pulse" style={{ borderColor: "#2a0050" }} />
          ))}
        </div>
      )}

      {/* ── Matrix + Insights (side by side on desktop) ── */}
      {loading && !data ? (
        <div className="synth-card rounded-xl h-96 animate-pulse" style={{ borderColor: "#2a0050" }} />
      ) : data && data.tickers.length >= 2 ? (
        <div className="flex flex-col xl:flex-row gap-6 items-start">
          {/* Matrix — takes all available space */}
          <div className="flex-1 min-w-0">
            <CorrelationHeatmap data={data} />
          </div>

          {/* Insights — fixed width on desktop */}
          {analytics && (
            <div className="w-full xl:w-80 shrink-0">
              <InsightsPanel analytics={analytics} />
            </div>
          )}
        </div>
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
