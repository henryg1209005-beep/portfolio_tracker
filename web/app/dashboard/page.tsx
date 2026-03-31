"use client";
import { useEffect, useState, useCallback } from "react";
import { fetchRefresh, removeHolding, clearAllHoldings, type RefreshData } from "@/lib/api";
import SummaryCards from "@/components/SummaryCards";
import HoldingsTable from "@/components/HoldingsTable";
import AddHoldingModal from "@/components/AddHoldingModal";
import ImportCSVModal from "@/components/ImportCSVModal";
import FixMyPortfolioPanel from "@/components/FixMyPortfolioPanel";

type Currency = "GBP" | "EUR" | "USD";
const CURRENCIES: Currency[] = ["GBP", "EUR", "USD"];
const STORAGE_KEY = "portivex_currency";

function useCurrency(): [Currency, (c: Currency) => void] {
  const [currency, setCurrencyState] = useState<Currency>("GBP");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Currency | null;
    if (saved && CURRENCIES.includes(saved)) setCurrencyState(saved);
  }, []);

  function setCurrency(c: Currency) {
    setCurrencyState(c);
    localStorage.setItem(STORAGE_KEY, c);
  }

  return [currency, setCurrency];
}

export default function OverviewPage() {
  const [data, setData]       = useState<RefreshData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [showAdd, setShowAdd]     = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showFix, setShowFix]     = useState(false);
  const [fixLoading, setFixLoading] = useState(false);
  const [currency, setCurrency] = useCurrency();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchRefresh());
    } catch {
      setError("Could not reach the API. Make sure the Python server is running on port 8000.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleRemove(ticker: string) {
    if (!confirm(`Remove ${ticker}?`)) return;
    await removeHolding(ticker);
    load();
  }

  return (
    <div className="p-4 md:p-6 max-w-screen-xl mx-auto space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 animate-fade-up sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Overview</h1>
            {!loading && data && (
              <span className="flex items-center gap-1.5 text-[10px] font-mono px-2 py-0.5 rounded-full animate-fade-up"
                style={{ background: "#00f5d411", border: "1px solid #00f5d433", color: "#00f5d4", animationDelay: "400ms" }}>
                <span className="w-1.5 h-1.5 rounded-full bg-cyan animate-pulse" />
                LIVE
              </span>
            )}
          </div>
          <p className="text-muted text-sm mt-0.5">Your portfolio at a glance</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Currency toggle */}
          {data && (
            <div className="flex items-center rounded-lg overflow-hidden font-mono text-xs"
              style={{ border: "1px solid #2a0050" }}>
              {CURRENCIES.map(c => (
                <button
                  key={c}
                  onClick={() => setCurrency(c)}
                  className="px-3 py-2 transition-all"
                  style={{
                    background: currency === c ? "linear-gradient(90deg,#bf5af2,#ff2d78)" : "transparent",
                    color: currency === c ? "#fff" : "#6b5e7e",
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          <button
            onClick={load}
            disabled={loading}
            className="px-3 py-2 text-sm rounded-lg font-mono transition-all disabled:opacity-40"
            style={{ border: "1px solid #2a0050", color: "#6b5e7e" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#e2d9f3"; (e.currentTarget as HTMLElement).style.borderColor = "#bf5af2"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#6b5e7e"; (e.currentTarget as HTMLElement).style.borderColor = "#2a0050"; }}
          >
            {loading ? "Refreshing…" : "↻ Refresh"}
          </button>

          {data && data.holdings.length > 0 && (
            <button
              onClick={async () => {
                if (!confirm("Remove all holdings? This cannot be undone.")) return;
                await clearAllHoldings();
                load();
              }}
              className="px-3 py-2 text-sm font-mono rounded-lg transition-all"
              style={{ border: "1px solid #ff2d7833", color: "#ff2d7866" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#ff2d78"; (e.currentTarget as HTMLElement).style.borderColor = "#ff2d78"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#ff2d7866"; (e.currentTarget as HTMLElement).style.borderColor = "#ff2d7833"; }}
            >
              ✕ Clear
            </button>
          )}

          {/* Portfolio Review */}
          <button
            onClick={() => {
              setFixLoading(true);
              setTimeout(() => { setFixLoading(false); setShowFix(true); }, 120);
            }}
            disabled={!data || loading || fixLoading}
            className="px-3 py-2 text-sm font-semibold rounded-lg transition-all disabled:opacity-40 relative overflow-hidden flex items-center gap-2"
            style={{ background: "linear-gradient(90deg, #3d005e, #1a0030)", border: "1px solid #bf5af266", color: "#bf5af2" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "#bf5af2"; (e.currentTarget as HTMLElement).style.boxShadow = "0 0 16px #bf5af244"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "#bf5af266"; (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
          >
            {fixLoading
              ? <><span className="w-3 h-3 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "#bf5af266", borderTopColor: "transparent" }} />Analysing…</>
              : <>✦ Review</>
            }
          </button>

          <button
            onClick={() => setShowImport(true)}
            className="px-3 py-2 text-sm font-mono rounded-lg transition-all"
            style={{ border: "1px solid #2a0050", color: "#6b5e7e" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#e2d9f3"; (e.currentTarget as HTMLElement).style.borderColor = "#bf5af2"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#6b5e7e"; (e.currentTarget as HTMLElement).style.borderColor = "#2a0050"; }}
          >
            ↑ Import
          </button>

          <button
            onClick={() => setShowAdd(true)}
            className="px-3 py-2 text-sm font-semibold rounded-lg transition-all"
            style={{ background: "linear-gradient(90deg, #bf5af2, #ff2d78)", color: "#fff" }}
          >
            + Add
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl p-4 text-sm" style={{ background: "#ff2d7811", border: "1px solid #ff2d7833", color: "#ff2d78" }}>
          {error}
        </div>
      )}

      {/* Skeleton / Content */}
      {loading && !data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="synth-card rounded-xl p-5 h-24 animate-pulse" />
            ))}
          </div>
          <div className="synth-card rounded-xl h-64 animate-pulse" />
        </div>
      ) : data ? (
        <>
          <SummaryCards summary={data.summary} currency={currency} />
          <HoldingsTable holdings={data.holdings} onRemove={handleRemove} currency={currency} fxRate={currency === "EUR" ? (data.summary.gbpeur ?? 1) : currency === "USD" ? (data.summary.gbpusd ?? 1) : 1} />
        </>
      ) : null}

      {showImport && (
        <ImportCSVModal onClose={() => setShowImport(false)} onImported={load} />
      )}

      {showAdd && (
        <AddHoldingModal onClose={() => setShowAdd(false)} onAdded={load} />
      )}

      {showFix && data && (
        <FixMyPortfolioPanel
          holdings={data.holdings}
          metrics={data.metrics ?? {
            sharpe_ratio: null, volatility: null, beta: null,
            max_drawdown: null, var_95: null, alpha: null, actual_return: null,
          }}
          totalPortfolioValue={data.summary.total_value ?? 0}
          onClose={() => setShowFix(false)}
        />
      )}
    </div>
  );
}
