"use client";
import { useEffect, useState, useCallback } from "react";
import {
  fetchRefresh,
  fetchPerformance,
  getProfile,
  type RefreshData,
  type PerformanceData,
  type InvestorProfile,
} from "@/lib/api";
import SummaryCards from "@/components/SummaryCards";
import MetricsGrid from "@/components/MetricsGrid";
import { useCurrency } from "@/lib/currencyContext";

type Benchmark = "sp500" | "ftse100" | "msci_world";
const BENCHMARKS: { key: Benchmark; label: string }[] = [
  { key: "sp500", label: "S&P 500" },
  { key: "ftse100", label: "FTSE 100" },
  { key: "msci_world", label: "MSCI World" },
];

function formatTimestampForFilename(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${min}`;
}

function escapeCsvValue(v: unknown): string {
  if (v == null) return "";
  const raw = String(v);
  if (!/[",\n]/.test(raw)) return raw;
  return `"${raw.replace(/"/g, "\"\"")}"`;
}

export default function MetricsPage() {
  const { currency } = useCurrency();
  const [data, setData] = useState<RefreshData | null>(null);
  const [perfData, setPerfData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [benchmark, setBenchmark] = useState<Benchmark>("sp500");
  const [riskProfile, setRiskProfile] = useState<InvestorProfile["risk_appetite"]>("balanced");

  const load = useCallback(async (bench: Benchmark) => {
    setLoading(true);
    setError("");
    try {
      const [refresh, perf] = await Promise.all([
        fetchRefresh(bench),
        fetchPerformance("1Y", bench).catch(() => null),
      ]);
      setData(refresh);
      setPerfData(perf);
    } catch {
      setError("Could not reach the API. Make sure the Python server is running on port 8000.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(benchmark);
  }, [load, benchmark]);

  useEffect(() => {
    getProfile()
      .then((p) => {
        if (p.exists && p.risk_appetite) setRiskProfile(p.risk_appetite);
      })
      .catch(() => {});
  }, []);

  const benchLabel = BENCHMARKS.find((b) => b.key === benchmark)?.label ?? "S&P 500";
  const canExport = !!data && !!data.metrics;

  function exportJson() {
    if (!data || !data.metrics) return;
    const now = new Date();
    const report = {
      exported_at: now.toISOString(),
      benchmark,
      benchmark_label: benchLabel,
      risk_profile: riskProfile,
      currency,
      refreshed_at: data.refreshed_at ? new Date(data.refreshed_at * 1000).toISOString() : null,
      summary: data.summary,
      metrics: data.metrics,
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `portivex-risk-metrics-${formatTimestampForFilename(now)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportCsv() {
    if (!data || !data.metrics) return;
    const now = new Date();

    const rows: Array<[string, string, unknown]> = [
      ["meta", "exported_at", now.toISOString()],
      ["meta", "benchmark", benchmark],
      ["meta", "benchmark_label", benchLabel],
      ["meta", "risk_profile", riskProfile],
      ["meta", "currency", currency],
      ["meta", "refreshed_at", data.refreshed_at ? new Date(data.refreshed_at * 1000).toISOString() : ""],
      ["summary", "total_value", data.summary.total_value],
      ["summary", "total_cost", data.summary.total_cost],
      ["summary", "total_pnl", data.summary.total_pnl],
      ["summary", "total_pnl_pct", data.summary.total_pnl_pct],
      ["summary", "holding_count", data.summary.holding_count],
      ["summary", "gbpusd", data.summary.gbpusd],
      ["summary", "gbpeur", data.summary.gbpeur],
    ];

    Object.entries(data.metrics).forEach(([key, value]) => {
      rows.push(["metrics", key, value]);
    });

    const header = "section,key,value\n";
    const body = rows
      .map(([section, key, value]) => [section, key, value].map(escapeCsvValue).join(","))
      .join("\n");

    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `portivex-risk-metrics-${formatTimestampForFilename(now)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-4 md:p-6 max-w-screen-xl mx-auto space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Risk Metrics</h1>
          <p className="text-muted text-sm mt-0.5">1-year rolling, {benchLabel} benchmark</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center rounded-lg overflow-hidden font-mono text-xs" style={{ border: "1px solid #2a0050" }}>
            {BENCHMARKS.map((b) => (
              <button
                key={b.key}
                onClick={() => setBenchmark(b.key)}
                className="px-3 py-2 transition-all"
                style={{
                  background: benchmark === b.key ? "linear-gradient(90deg,#bf5af2,#ff2d78)" : "transparent",
                  color: benchmark === b.key ? "#fff" : "#6b5e7e",
                }}
              >
                {b.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => load(benchmark)}
            disabled={loading}
            className="px-3 py-2 text-sm font-mono rounded-lg transition-all disabled:opacity-40"
            style={{ border: "1px solid #2a0050", color: "#6b5e7e" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = "#e2d9f3";
              (e.currentTarget as HTMLElement).style.borderColor = "#bf5af2";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = "#6b5e7e";
              (e.currentTarget as HTMLElement).style.borderColor = "#2a0050";
            }}
          >
            {loading ? "Refreshing..." : "↻ Refresh"}
          </button>

          <button
            onClick={exportCsv}
            disabled={!canExport}
            className="px-3 py-2 text-sm font-mono rounded-lg transition-all disabled:opacity-40"
            style={{ border: "1px solid #2a0050", color: "#6b5e7e" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = "#e2d9f3";
              (e.currentTarget as HTMLElement).style.borderColor = "#bf5af2";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = "#6b5e7e";
              (e.currentTarget as HTMLElement).style.borderColor = "#2a0050";
            }}
          >
            ↓ Export CSV
          </button>

          <button
            onClick={exportJson}
            disabled={!canExport}
            className="px-3 py-2 text-sm font-mono rounded-lg transition-all disabled:opacity-40"
            style={{ border: "1px solid #2a0050", color: "#6b5e7e" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = "#e2d9f3";
              (e.currentTarget as HTMLElement).style.borderColor = "#bf5af2";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = "#6b5e7e";
              (e.currentTarget as HTMLElement).style.borderColor = "#2a0050";
            }}
          >
            ↓ Export JSON
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl p-4 text-sm" style={{ background: "#ff2d7811", border: "1px solid #ff2d7833", color: "#ff2d78" }}>
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="synth-card rounded-xl h-36 animate-pulse" />
          ))}
        </div>
      ) : data ? (
        <>
          <SummaryCards summary={data.summary} currency={currency} />
          {data.metrics ? (
            <MetricsGrid
              metrics={data.metrics}
              summary={data.summary}
              perfData={perfData}
              benchmarkLabel={benchLabel}
              riskProfile={riskProfile}
            />
          ) : (
            <div className="text-muted text-sm synth-card rounded-xl p-6" style={{ borderColor: "#2a0050" }}>
              Not enough historical data to compute metrics yet. Add more holdings or wait for 30+ trading days.
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
