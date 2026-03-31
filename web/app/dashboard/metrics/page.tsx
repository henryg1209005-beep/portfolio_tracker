"use client";
import { useEffect, useState, useCallback } from "react";
import { fetchRefresh, fetchPerformance, type RefreshData, type PerformanceData } from "@/lib/api";
import SummaryCards from "@/components/SummaryCards";
import MetricsGrid from "@/components/MetricsGrid";
import { useCurrency } from "@/lib/currencyContext";

export default function MetricsPage() {
  const { currency } = useCurrency();
  const [data, setData] = useState<RefreshData | null>(null);
  const [perfData, setPerfData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [refresh, perf] = await Promise.all([
        fetchRefresh(),
        fetchPerformance("1Y").catch(() => null),
      ]);
      setData(refresh);
      setPerfData(perf);
    } catch {
      setError("Could not reach the API. Make sure the Python server is running on port 8000.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 max-w-screen-xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Risk Metrics</h1>
          <p className="text-muted text-sm mt-0.5">1-year rolling, S&P 500 benchmark</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="px-4 py-2 text-sm border border-border rounded-lg text-muted hover:text-white hover:border-white/30 transition-colors disabled:opacity-40"
        >
          {loading ? "Refreshing…" : "↻ Refresh"}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-surface border border-border rounded-xl h-36 animate-pulse" />
          ))}
        </div>
      ) : data ? (
        <>
          <SummaryCards summary={data.summary} currency={currency} />
          {data.metrics ? (
            <MetricsGrid metrics={data.metrics} summary={data.summary} perfData={perfData} />
          ) : (
            <div className="text-muted text-sm bg-surface border border-border rounded-xl p-6">
              Not enough historical data to compute metrics yet. Add more holdings or wait for 30+ trading days.
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
