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
    const m = data.metrics as Record<string, unknown>;
    const s = data.summary;
    // Convert fractional metrics to percentage for readability
    const pct = (v: unknown) => typeof v === "number" ? +(v * 100).toFixed(4) : null;

    const report = {
      exported_at:    now.toISOString(),
      benchmark,
      benchmark_label: benchLabel,
      risk_profile:   riskProfile,
      currency,
      data_as_of:     data.refreshed_at ? new Date(data.refreshed_at * 1000).toISOString() : null,
      summary: {
        portfolio_value:  s.total_value,
        total_invested:   s.total_cost,
        unrealised_pnl:   s.total_pnl,
        pnl_return_pct:   s.total_pnl_pct,
        holding_count:    s.holding_count,
        fx_gbpusd:        s.gbpusd,
        fx_gbpeur:        s.gbpeur,
      },
      risk_metrics: {
        sharpe_ratio:               m.sharpe_ratio,
        sortino_ratio:              m.sortino_ratio,
        annualised_return_pct:      pct(m.actual_return),
        volatility_pct:             pct(m.volatility),
        beta:                       m.beta,
        capm_expected_return_pct:   pct(m.capm_expected_return),
        alpha_pct:                  pct(m.alpha),
        var_95_pct:                 pct(m.var_95),
        var_95_cornish_fisher_pct:  pct(m.var_95_cf),
        max_drawdown_pct:           pct(m.max_drawdown),
        drawdown_recovery_days:     m.drawdown_recovery_days,
        risk_free_rate_pct:         pct(m.rf_annual),
      },
      confidence: {
        sample_days:            m.sample_days,
        benchmark_overlap_days: m.benchmark_overlap_days,
        window_years:           m.window_years_equivalent,
      },
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json;charset=utf-8" });
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
    const m = data.metrics as Record<string, unknown>;
    const s = data.summary;
    // Convert decimal fractions to human-readable percentages
    const pct  = (v: unknown) => typeof v === "number" ? +(v * 100).toFixed(4) : "";
    const num  = (v: unknown) => v != null ? v : "";
    const cap  = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

    const rows: Array<[string, string, unknown, string]> = [
      // ── Meta ────────────────────────────────────────────────────────────────
      ["Meta", "Exported At",    now.toISOString(),                                                          ""],
      ["Meta", "Benchmark",      benchLabel,                                                                  ""],
      ["Meta", "Risk Profile",   cap(riskProfile),                                                           ""],
      ["Meta", "Currency",       currency,                                                                    ""],
      ["Meta", "Data As Of",     data.refreshed_at ? new Date(data.refreshed_at * 1000).toISOString() : "", ""],
      // ── Summary ─────────────────────────────────────────────────────────────
      ["Summary", "Portfolio Value", num(s.total_value),   currency],
      ["Summary", "Total Invested",  num(s.total_cost),    currency],
      ["Summary", "Unrealised P&L",  num(s.total_pnl),     currency],
      ["Summary", "P&L Return",      num(s.total_pnl_pct), "%"],
      ["Summary", "Holdings",        num(s.holding_count), ""],
      ["Summary", "GBP/USD Rate",    num(s.gbpusd),        ""],
      ["Summary", "GBP/EUR Rate",    num(s.gbpeur),        ""],
      // ── Risk Metrics ─────────────────────────────────────────────────────────
      ["Risk Metrics", "Sharpe Ratio",                      num(m.sharpe_ratio),         ""],
      ["Risk Metrics", "Sortino Ratio",                     num(m.sortino_ratio),         ""],
      ["Risk Metrics", "Annualised Return",                 pct(m.actual_return),         "%"],
      ["Risk Metrics", "Volatility",                        pct(m.volatility),            "%"],
      ["Risk Metrics", "Beta",                              num(m.beta),                  ""],
      ["Risk Metrics", "CAPM Expected Return",              pct(m.capm_expected_return),  "%"],
      ["Risk Metrics", "Alpha",                             pct(m.alpha),                 "%"],
      ["Risk Metrics", "Value at Risk (95%, Historical)",   pct(m.var_95),                "%"],
      ["Risk Metrics", "Value at Risk (95%, Cornish-Fisher)", pct(m.var_95_cf),           "%"],
      ["Risk Metrics", "Max Drawdown",                      pct(m.max_drawdown),          "%"],
      ["Risk Metrics", "Drawdown Recovery",                 num(m.drawdown_recovery_days), "trading days"],
      ["Risk Metrics", "Risk-Free Rate",                    pct(m.rf_annual),             "%"],
      // ── Confidence ───────────────────────────────────────────────────────────
      ["Confidence", "Sample Days",            num(m.sample_days),             "trading days"],
      ["Confidence", "Benchmark Overlap Days", num(m.benchmark_overlap_days),  "trading days"],
      ["Confidence", "Data Window",            num(m.window_years_equivalent),  "years"],
    ];

    const header = "section,metric,value,unit\n";
    const body = rows
      .map(([section, metric, value, unit]) => [section, metric, value, unit].map(escapeCsvValue).join(","))
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
