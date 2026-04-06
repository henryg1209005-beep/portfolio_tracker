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
import { DEMO_REFRESH_DATA, getDemoPerformance } from "@/lib/demoPortfolio";
import { useDemoMode } from "@/lib/demoModeContext";
import { trackEvent } from "@/lib/analytics";

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

function isValidValue(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "string") return v.trim().length > 0;
  return true;
}

function cleanObject<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  Object.entries(obj).forEach(([k, v]) => {
    if (!isValidValue(v)) return;
    out[k as keyof T] = v as T[keyof T];
  });
  return out;
}

function fmtNumber(v: unknown, digits = 4): string {
  if (!isValidValue(v) || typeof v !== "number") return "";
  return v.toFixed(digits);
}

function fmtPercent(v: unknown, digits = 2): string {
  if (!isValidValue(v) || typeof v !== "number") return "";
  return `${(v * 100).toFixed(digits)}%`;
}

function fmtCurrency(v: unknown): string {
  if (!isValidValue(v) || typeof v !== "number") return "";
  return v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function MetricsPage() {
  const { currency } = useCurrency();
  const { isDemoMode, demoData } = useDemoMode();
  const [data, setData] = useState<RefreshData | null>(null);
  const [perfData, setPerfData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [benchmark, setBenchmark] = useState<Benchmark>("sp500");
  const [riskProfile, setRiskProfile] = useState<InvestorProfile["risk_appetite"]>("balanced");

  const load = useCallback(async (bench: Benchmark, force = false) => {
    setLoading(true);
    setError("");
    if (isDemoMode) {
      const demoRefresh = {
        ...demoData,
        metrics: DEMO_REFRESH_DATA.metrics ? { ...DEMO_REFRESH_DATA.metrics, benchmark_used: bench } : null,
      };
      setData(demoRefresh);
      setPerfData(getDemoPerformance("1Y", bench));
      setLoading(false);
      return;
    }
    try {
      const [refresh, perf] = await Promise.all([
        fetchRefresh(bench, force),
        fetchPerformance("1Y", bench).catch(() => null),
      ]);
      setData(refresh);
      setPerfData(perf);
    } catch {
      setError("Could not reach the API right now. Please try again in a moment.");
    } finally {
      setLoading(false);
    }
  }, [isDemoMode, demoData]);

  useEffect(() => {
    load(benchmark);
  }, [load, benchmark, isDemoMode]);

  useEffect(() => {
    getProfile()
      .then((p) => {
        if (p.exists && p.risk_appetite) setRiskProfile(p.risk_appetite);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    void trackEvent("risk_metrics_viewed", { benchmark });
  }, [benchmark]);

  const benchLabel = BENCHMARKS.find((b) => b.key === benchmark)?.label ?? "S&P 500";
  const canExport = !!data && !!data.metrics;

  function exportJson() {
    if (!data || !data.metrics) return;
    void trackEvent("export_clicked", { format: "json", benchmark, is_demo_mode: isDemoMode });
    const now = new Date();
    const m = data.metrics as Record<string, unknown>;
    const s = data.summary;

    const summary = cleanObject({
      portfolio_value: s.total_value,
      total_invested: s.total_cost,
      unrealised_pnl: s.total_pnl,
      pnl_return_pct: s.total_pnl_pct,
      holding_count: s.holding_count,
      fx_gbpusd: s.gbpusd,
      fx_gbpeur: s.gbpeur,
    });

    const riskMetricsRaw = cleanObject({
      sharpe_ratio: m.sharpe_ratio,
      sortino_ratio: m.sortino_ratio,
      annualised_return_since_inception: m.actual_return,
      volatility: m.volatility,
      beta: m.beta,
      capm_expected_return: m.capm_expected_return,
      alpha: m.alpha,
      var_95: m.var_95,
      var_95_cornish_fisher: m.var_95_cf,
      max_drawdown: m.max_drawdown,
      drawdown_recovery_days: m.drawdown_recovery_days,
      risk_free_rate: m.rf_annual,
    });

    const riskMetricsDisplay = cleanObject({
      sharpe_ratio: fmtNumber(m.sharpe_ratio, 3),
      sortino_ratio: fmtNumber(m.sortino_ratio, 3),
      annualised_return_since_inception: fmtPercent(m.actual_return, 2),
      volatility: fmtPercent(m.volatility, 2),
      beta: fmtNumber(m.beta, 3),
      capm_expected_return: fmtPercent(m.capm_expected_return, 2),
      alpha: fmtPercent(m.alpha, 2),
      var_95: fmtPercent(m.var_95, 2),
      var_95_cornish_fisher: fmtPercent(m.var_95_cf, 2),
      max_drawdown: fmtPercent(m.max_drawdown, 2),
      drawdown_recovery_days: isValidValue(m.drawdown_recovery_days) ? String(m.drawdown_recovery_days) : "",
      risk_free_rate: fmtPercent(m.rf_annual, 2),
    });

    const confidence = cleanObject({
      sample_days: m.sample_days,
      benchmark_overlap_days: m.benchmark_overlap_days,
      window_years: m.window_years_equivalent,
    });

    const report = cleanObject({
      exported_at: now.toISOString(),
      benchmark,
      benchmark_label: benchLabel,
      risk_profile: riskProfile,
      currency,
      data_as_of: data.refreshed_at ? new Date(data.refreshed_at * 1000).toISOString() : null,
      summary,
      risk_metrics_raw: riskMetricsRaw,
      risk_metrics_display: riskMetricsDisplay,
      confidence,
    });

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
    void trackEvent("export_clicked", { format: "csv", benchmark, is_demo_mode: isDemoMode });
    const now = new Date();
    const m = data.metrics as Record<string, unknown>;
    const s = data.summary;
    const rows: Array<[string, string, string, string]> = [];
    const cap = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

    const addRow = (section: string, metric: string, value: string, unit = "") => {
      if (!value) return;
      rows.push([section, metric, value, unit]);
    };

    addRow("Meta", "Exported At", now.toISOString());
    addRow("Meta", "Benchmark", benchLabel);
    addRow("Meta", "Risk Profile", cap(riskProfile));
    addRow("Meta", "Currency", currency);
    addRow("Meta", "Data As Of", data.refreshed_at ? new Date(data.refreshed_at * 1000).toISOString() : "");

    addRow("Summary", "Portfolio Value", fmtCurrency(s.total_value), currency);
    addRow("Summary", "Total Invested", fmtCurrency(s.total_cost), currency);
    addRow("Summary", "Unrealised P&L", fmtCurrency(s.total_pnl), currency);
    addRow("Summary", "P&L Return", fmtNumber(s.total_pnl_pct, 2), "%");
    addRow("Summary", "Holdings", isValidValue(s.holding_count) ? String(s.holding_count) : "");
    addRow("Summary", "GBP/USD Rate", fmtNumber(s.gbpusd, 4));
    addRow("Summary", "GBP/EUR Rate", fmtNumber(s.gbpeur, 4));

    addRow("Risk Metrics", "Sharpe Ratio", fmtNumber(m.sharpe_ratio, 3));
    addRow("Risk Metrics", "Sortino Ratio", fmtNumber(m.sortino_ratio, 3));
    addRow("Risk Metrics", "Annualised Return (Since inception)", fmtPercent(m.actual_return, 2));
    addRow("Risk Metrics", "Volatility (Trailing 252d annualised)", fmtPercent(m.volatility, 2));
    addRow("Risk Metrics", "Beta (Benchmark overlap)", fmtNumber(m.beta, 3));
    addRow("Risk Metrics", "CAPM Expected Return (Benchmark overlap)", fmtPercent(m.capm_expected_return, 2));
    addRow("Risk Metrics", "Alpha (Benchmark overlap)", fmtPercent(m.alpha, 2));
    addRow("Risk Metrics", "Value at Risk (95%, Historical, Trailing 252d)", fmtPercent(m.var_95, 2));
    addRow("Risk Metrics", "Value at Risk (95%, Cornish-Fisher, Trailing 252d)", fmtPercent(m.var_95_cf, 2));
    addRow("Risk Metrics", "Max Drawdown (Trailing 252d)", fmtPercent(m.max_drawdown, 2));
    addRow("Risk Metrics", "Drawdown Recovery (Trailing 252d)", isValidValue(m.drawdown_recovery_days) ? String(m.drawdown_recovery_days) : "", "trading days");
    addRow("Risk Metrics", "Risk-Free Rate", fmtPercent(m.rf_annual, 2));

    addRow("Confidence", "Sample Days", isValidValue(m.sample_days) ? String(m.sample_days) : "", "trading days");
    addRow("Confidence", "Benchmark Overlap Days", isValidValue(m.benchmark_overlap_days) ? String(m.benchmark_overlap_days) : "", "trading days");
    addRow("Confidence", "Data Window", fmtNumber(m.window_years_equivalent, 2), "years");

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
          <h1 className="text-2xl font-bold">Risk Analysis</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="ontology-chip ontology-chip-entity">Risk Metrics Model</span>
            <span className="ontology-chip ontology-chip-rel">Calculated from your returns</span>
            <span className="ontology-chip ontology-chip-rel">Compared with benchmark</span>
            <span className="ontology-id">Ref: OBJ-RISKMODEL-TRAILING252</span>
          </div>
          <p className="text-muted text-sm mt-0.5">How your portfolio risk compares to {benchLabel}</p>
          {isDemoMode && (
            <p className="text-[11px] font-mono mt-1" style={{ color: "#7ca8ff" }}>
              Demo mode data
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="ops-segment flex items-center rounded-lg overflow-hidden font-mono text-xs">
            {BENCHMARKS.map((b) => (
              <button
                key={b.key}
                onClick={() => setBenchmark(b.key)}
                className="px-3 py-2 transition-all"
                style={{
                  background: benchmark === b.key ? "linear-gradient(90deg,#1f4b67,#1a3653)" : "transparent",
                  color: benchmark === b.key ? "#d9f2ff" : undefined,
                }}
              >
                {b.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => load(benchmark, true)}
            disabled={loading}
            className="ops-btn px-3 py-2 text-sm font-mono rounded-lg disabled:opacity-40"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>

          <button
            onClick={exportCsv}
            disabled={!canExport}
            className="ops-btn px-3 py-2 text-sm font-mono rounded-lg disabled:opacity-40"
          >Export CSV</button>

          <button
            onClick={exportJson}
            disabled={!canExport}
            className="ops-btn px-3 py-2 text-sm font-mono rounded-lg disabled:opacity-40"
          >Export JSON</button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl p-4 text-sm" style={{ background: "#ff6b8a12", border: "1px solid #ff6b8a44", color: "#ff6b8a" }}>
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
            <div className="text-muted text-sm synth-card rounded-xl p-6" style={{ borderColor: "#1f3248" }}>
              Not enough historical data to compute metrics yet. Add more holdings or wait for 30+ trading days.
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

