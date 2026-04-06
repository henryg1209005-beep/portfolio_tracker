"use client";
import { useEffect, useState, useCallback } from "react";
import { fetchRefresh, removeHolding, clearAllHoldings, getProfile, type RefreshData } from "@/lib/api";
import { useCurrency, CURRENCIES } from "@/lib/currencyContext";
import type { RiskProfile } from "@/lib/fixMyPortfolio";
import { useDemoMode } from "@/lib/demoModeContext";
import { trackEvent } from "@/lib/analytics";
import { readAttribution } from "@/lib/growthAttribution";
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
  const [hasRunReview, setHasRunReview] = useState(false);
  const [nudgeTracked, setNudgeTracked] = useState(false);
  const [riskProfile, setRiskProfile] = useState<RiskProfile>("balanced");
  const { currency, setCurrency } = useCurrency();
  const { isDemoMode, setDemoMode, demoData, addDemoHolding, removeDemoHolding, resetDemoPortfolio } = useDemoMode();

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchRefresh("sp500", force));
    } catch {
      setError("Could not reach the API right now. Please try again in a moment.");
    } finally {
      setLoading(false);
    }
  }, []);

  function enableDemoPortfolio() {
    setDemoMode(true);
  }

  function applyDemoPortfolio() {
    setData(demoData);
    setError("");
    setLoading(false);
  }

  function handleRefresh() {
    if (isDemoMode) {
      applyDemoPortfolio();
      return;
    }
    void load(true);
  }

  useEffect(() => {
    if (isDemoMode) {
      applyDemoPortfolio();
      return;
    }
    load();
  }, [load, isDemoMode, demoData]);

  useEffect(() => {
    getProfile()
      .then((p) => {
        if (p.exists && p.risk_appetite) {
          setRiskProfile(p.risk_appetite);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const attribution = readAttribution();
    void trackEvent("dashboard_first_view", attribution);

    const signupTracked = localStorage.getItem("portivex_signup_tracked_v1") === "1";
    if (!signupTracked) {
      localStorage.setItem("portivex_signup_tracked_v1", "1");
      void trackEvent("signup_completed", attribution);
    }
  }, []);

  useEffect(() => {
    const seen = localStorage.getItem("portivex_first_review_done") === "1";
    setHasRunReview(seen);
  }, []);

  async function handleRemove(ticker: string) {
    if (isDemoMode) {
      removeDemoHolding(ticker);
      return;
    }
    if (!confirm(`Remove ${ticker}?`)) return;
    await removeHolding(ticker);
    load();
  }

  function startReview(source: "header_button" | "first_review_nudge") {
    localStorage.setItem("portivex_first_review_done", "1");
    setHasRunReview(true);
    void trackEvent("first_review_run", {
      is_demo_mode: isDemoMode,
      holdings_count: data?.holdings.length ?? 0,
      source,
      ...readAttribution(),
    });
    setShowFix(true);
  }

  const canReview = !!data && !loading && data.holdings.length > 0;
  const shouldShowFirstReviewNudge = !isDemoMode && canReview && !hasRunReview;

  useEffect(() => {
    if (!shouldShowFirstReviewNudge || nudgeTracked) return;
    setNudgeTracked(true);
    void trackEvent("first_review_nudge_shown", { holdings_count: data?.holdings.length ?? 0 });
  }, [shouldShowFirstReviewNudge, nudgeTracked, data?.holdings.length]);

  return (
    <div className="p-4 md:p-6 max-w-screen-xl mx-auto space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 animate-fade-up sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Overview</h1>
            {!loading && data && (
              <span
                className="flex items-center gap-1.5 text-[10px] font-mono px-2 py-0.5 rounded-full animate-fade-up"
                style={{ background: "#4dd2ff14", border: "1px solid #4dd2ff44", color: "#4dd2ff", animationDelay: "400ms" }}
              >
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#4dd2ff" }} />
                {data.refreshed_at
                  ? `Updated ${Math.round((Date.now() / 1000 - data.refreshed_at) / 60)}m ago`
                  : "LIVE"}
              </span>
            )}
            {isDemoMode && (
              <span
                className="text-[10px] font-mono px-2 py-0.5 rounded-full"
                style={{ background: "#7ca8ff14", border: "1px solid #7ca8ff44", color: "#7ca8ff" }}
              >
                DEMO PORTFOLIO
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="ontology-chip ontology-chip-entity">Portfolio Snapshot</span>
            <span className="ontology-chip ontology-chip-rel">Includes your holdings</span>
            <span className="ontology-chip ontology-chip-rel">Calculates live P&L</span>
            <span className="ontology-id">Ref: OBJ-PORTFOLIO-SNAPSHOT</span>
          </div>
          <p className="text-muted text-sm mt-0.5">
            {isDemoMode ? "Demo sandbox: local-only edits, reset anytime." : "Your portfolio at a glance"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {data && (
            <div className="ops-segment flex items-center rounded-lg overflow-hidden font-mono text-xs">
              {CURRENCIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCurrency(c)}
                  className="px-3 py-2 transition-all"
                  style={{
                    background: currency === c ? "linear-gradient(90deg,#1f4b67,#1a3653)" : "transparent",
                    color: currency === c ? "#d9f2ff" : undefined,
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          <button
            onClick={handleRefresh}
            disabled={loading}
            className="ops-btn px-3 py-2 text-sm rounded-lg font-mono disabled:opacity-40"
          >
            {loading ? "Refreshing..." : isDemoMode ? "Sync Demo" : "Refresh"}
          </button>

          {!isDemoMode && (
            <button
              onClick={enableDemoPortfolio}
              className="ops-btn-soft px-3 py-2 text-sm rounded-lg font-mono"
            >
              Try Demo
            </button>
          )}

          {isDemoMode && (
            <button
              onClick={() => setDemoMode(false)}
              className="ops-btn px-3 py-2 text-sm rounded-lg font-mono"
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
              className="ops-btn-danger px-3 py-2 text-sm font-mono rounded-lg"
            >
              Clear
            </button>
          )}

          {isDemoMode && (
            <button
              onClick={resetDemoPortfolio}
              className="ops-btn-soft px-3 py-2 text-sm font-mono rounded-lg"
            >
              Reset Demo
            </button>
          )}

          <div className="flex flex-col gap-1">
            <button
              onClick={() => startReview("header_button")}
              disabled={!canReview}
              className="ops-btn-primary px-3 py-2 text-sm font-semibold rounded-lg disabled:opacity-40 relative overflow-hidden flex items-center gap-2"
            >
              Review
            </button>
            {!canReview && (
              <span className="text-[10px] font-mono text-muted">
                Add at least one holding to run review.
              </span>
            )}
          </div>

          <button
            onClick={() => setShowImport(true)}
            disabled={isDemoMode}
            className="ops-btn px-3 py-2 text-sm font-mono rounded-lg disabled:opacity-40"
          >
            Import
          </button>

          <button
            onClick={() => setShowAdd(true)}
            className="ops-btn-primary px-3 py-2 text-sm font-semibold rounded-lg"
          >
            + Add
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl p-4 text-sm" style={{ background: "#ff6b8a12", border: "1px solid #ff6b8a44", color: "#ff6b8a" }}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{error}</span>
            {!isDemoMode && (
              <button
                onClick={enableDemoPortfolio}
                className="ops-btn-soft px-3 py-2 text-xs rounded-lg font-mono"
              >
                Try Demo Portfolio
              </button>
            )}
          </div>
        </div>
      )}

      {shouldShowFirstReviewNudge && (
        <div className="rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" style={{ background: "#4dd2ff14", border: "1px solid #4dd2ff44" }}>
          <div>
            <div className="text-sm font-semibold" style={{ color: "#4dd2ff" }}>
              Run your first portfolio review
            </div>
            <div className="text-xs font-mono mt-1 text-muted">
              You have holdings loaded. Get your first actionable risk breakdown now.
            </div>
          </div>
          <button
            onClick={() => {
              void trackEvent("first_review_nudge_clicked", { holdings_count: data?.holdings.length ?? 0 });
              startReview("first_review_nudge");
            }}
            className="ops-btn-primary px-4 py-2 text-sm font-semibold rounded-lg"
          >
            Run Review
          </button>
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

      {showAdd && (
        <AddHoldingModal
          onClose={() => setShowAdd(false)}
          onAdded={async () => {
            if (!isDemoMode) await load();
          }}
          onSubmit={isDemoMode ? addDemoHolding : undefined}
        />
      )}

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
