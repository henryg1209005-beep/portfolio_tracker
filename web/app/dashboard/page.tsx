"use client";
import { useEffect, useState, useCallback } from "react";
import { fetchRefresh, removeHolding, clearAllHoldings, getProfile, type RefreshData } from "@/lib/api";
import { useCurrency, CURRENCIES } from "@/lib/currencyContext";
import type { RiskProfile } from "@/lib/fixMyPortfolio";
import { DEMO_REFRESH_DATA } from "@/lib/demoPortfolio";
import SummaryCards from "@/components/SummaryCards";
import HoldingsTable from "@/components/HoldingsTable";
import AddHoldingModal from "@/components/AddHoldingModal";
import ImportCSVModal from "@/components/ImportCSVModal";
import FixMyPortfolioPanel from "@/components/FixMyPortfolioPanel";

export default function OverviewPage() {
  const [data, setData] = useState<RefreshData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showFix, setShowFix] = useState(false);
  const [riskProfile, setRiskProfile] = useState<RiskProfile>("balanced");
  const [isDemoMode, setIsDemoMode] = useState(false);
  const { currency, setCurrency } = useCurrency();

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchRefresh("sp500", force));
      setIsDemoMode(false);
    } catch {
      setError("Could not reach the API right now. Please try again in a moment.");
    } finally {
      setLoading(false);
    }
  }, []);

  function loadDemoPortfolio() {
    setData(DEMO_REFRESH_DATA);
    setError("");
    setLoading(false);
    setIsDemoMode(true);
  }

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    getProfile()
      .then((p) => {
        if (p.exists && p.risk_appetite) {
          setRiskProfile(p.risk_appetite);
        }
      })
      .catch(() => {});
  }, []);

  async function handleRemove(ticker: string) {
    if (isDemoMode) return;
    if (!confirm(`Remove ${ticker}?`)) return;
    await removeHolding(ticker);
    load();
  }

  const canReview = !!data && !loading && data.holdings.length > 0;

  return (
    <div className="p-4 md:p-6 max-w-screen-xl mx-auto space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 animate-fade-up sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Overview</h1>
            {!loading && data && (
              <span
                className="flex items-center gap-1.5 text-[10px] font-mono px-2 py-0.5 rounded-full animate-fade-up"
                style={{ background: "#00f5d411", border: "1px solid #00f5d433", color: "#00f5d4", animationDelay: "400ms" }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-cyan animate-pulse" />
                {data.refreshed_at
                  ? `Updated ${Math.round((Date.now() / 1000 - data.refreshed_at) / 60)}m ago`
                  : "LIVE"}
              </span>
            )}
            {isDemoMode && (
              <span
                className="text-[10px] font-mono px-2 py-0.5 rounded-full"
                style={{ background: "#bf5af211", border: "1px solid #bf5af244", color: "#bf5af2" }}
              >
                DEMO PORTFOLIO
              </span>
            )}
          </div>
          <p className="text-muted text-sm mt-0.5">Your portfolio at a glance</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {data && (
            <div className="flex items-center rounded-lg overflow-hidden font-mono text-xs" style={{ border: "1px solid #2a0050" }}>
              {CURRENCIES.map((c) => (
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
            onClick={() => load(true)}
            disabled={loading}
            className="px-3 py-2 text-sm rounded-lg font-mono transition-all disabled:opacity-40"
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
            {loading ? "Refreshing..." : "Refresh"}
          </button>

          {!isDemoMode && (
            <button
              onClick={loadDemoPortfolio}
              className="px-3 py-2 text-sm rounded-lg font-mono transition-all"
              style={{ border: "1px solid #bf5af244", color: "#bf5af2", background: "#bf5af211" }}
            >
              Try Demo
            </button>
          )}

          {isDemoMode && (
            <button
              onClick={() => load(true)}
              className="px-3 py-2 text-sm rounded-lg font-mono transition-all"
              style={{ border: "1px solid #00f5d444", color: "#00f5d4", background: "#00f5d411" }}
            >
              Exit Demo
            </button>
          )}

          {data && data.holdings.length > 0 && !isDemoMode && (
            <button
              onClick={async () => {
                if (!confirm("Remove all holdings? This cannot be undone.")) return;
                await clearAllHoldings();
                load();
              }}
              className="px-3 py-2 text-sm font-mono rounded-lg transition-all"
              style={{ border: "1px solid #ff2d7833", color: "#ff2d7866" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.color = "#ff2d78";
                (e.currentTarget as HTMLElement).style.borderColor = "#ff2d78";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.color = "#ff2d7866";
                (e.currentTarget as HTMLElement).style.borderColor = "#ff2d7833";
              }}
            >
              Clear
            </button>
          )}

          <div className="flex flex-col gap-1">
            <button
              onClick={() => setShowFix(true)}
              disabled={!canReview}
              className="px-3 py-2 text-sm font-semibold rounded-lg transition-all disabled:opacity-40 relative overflow-hidden flex items-center gap-2"
              style={{ background: "linear-gradient(90deg, #3d005e, #1a0030)", border: "1px solid #bf5af266", color: "#bf5af2" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "#bf5af2";
                (e.currentTarget as HTMLElement).style.boxShadow = "0 0 16px #bf5af244";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "#bf5af266";
                (e.currentTarget as HTMLElement).style.boxShadow = "none";
              }}
            >
              Review
            </button>
            {!canReview && (
              <span className="text-[10px] font-mono" style={{ color: "#4a3a5e" }}>
                Add at least one holding to run review.
              </span>
            )}
          </div>

          <button
            onClick={() => setShowImport(true)}
            className="px-3 py-2 text-sm font-mono rounded-lg transition-all"
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
            Import
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

      {error && (
        <div className="rounded-xl p-4 text-sm" style={{ background: "#ff2d7811", border: "1px solid #ff2d7833", color: "#ff2d78" }}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{error}</span>
            {!isDemoMode && (
              <button
                onClick={loadDemoPortfolio}
                className="px-3 py-2 text-xs rounded-lg font-mono transition-all"
                style={{ border: "1px solid #bf5af244", color: "#bf5af2", background: "#bf5af211" }}
              >
                Try Demo Portfolio
              </button>
            )}
          </div>
        </div>
      )}

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
          <HoldingsTable
            holdings={data.holdings}
            onRemove={handleRemove}
            currency={currency}
            fxRate={currency === "EUR" ? (data.summary.gbpeur ?? 1) : currency === "USD" ? (data.summary.gbpusd ?? 1) : 1}
          />
        </>
      ) : null}

      {showImport && <ImportCSVModal onClose={() => setShowImport(false)} onImported={load} />}

      {showAdd && <AddHoldingModal onClose={() => setShowAdd(false)} onAdded={load} />}

      {showFix && data && (
        <FixMyPortfolioPanel
          holdings={data.holdings}
          metrics={
            data.metrics ?? {
              sharpe_ratio: null,
              volatility: null,
              beta: null,
              max_drawdown: null,
              var_95: null,
              alpha: null,
              actual_return: null,
            }
          }
          totalPortfolioValue={data.summary.total_value ?? 0}
          initialProfile={riskProfile}
          onClose={() => setShowFix(false)}
        />
      )}
    </div>
  );
}
