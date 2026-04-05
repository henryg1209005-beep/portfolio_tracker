"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import type { Holding, RefreshData } from "@/lib/api";
import { DEMO_REFRESH_DATA } from "@/lib/demoPortfolio";

type DemoModeCtx = {
  isDemoMode: boolean;
  setDemoMode: (enabled: boolean) => void;
  toggleDemoMode: () => void;
  demoData: RefreshData;
  addDemoHolding: (payload: {
    ticker: string;
    type: "stock" | "etf" | "crypto";
    transaction: {
      date: string;
      shares: number;
      price: number;
      type: "buy" | "sell";
      price_currency: "GBP" | "USD" | "EUR";
    };
  }) => void;
  removeDemoHolding: (ticker: string) => void;
  resetDemoPortfolio: () => void;
};

const STORAGE_KEY = "portivex_demo_mode";
const DEMO_HOLDINGS_KEY = "portivex_demo_holdings_v1";

function cloneDefaultDemoData(): RefreshData {
  return {
    ...DEMO_REFRESH_DATA,
    holdings: DEMO_REFRESH_DATA.holdings.map((h) => ({ ...h })),
    summary: { ...DEMO_REFRESH_DATA.summary },
    metrics: DEMO_REFRESH_DATA.metrics ? { ...DEMO_REFRESH_DATA.metrics } : null,
  };
}

function recomputeSummary(holdings: Holding[]): RefreshData["summary"] {
  const total_value = holdings.reduce((s, h) => s + (h.market_value ?? 0), 0);
  const total_cost = holdings.reduce((s, h) => s + (h.cost_basis ?? 0), 0);
  const total_pnl = total_value - total_cost;
  const total_pnl_pct = total_cost > 0 ? (total_pnl / total_cost) * 100 : 0;

  return {
    ...DEMO_REFRESH_DATA.summary,
    total_value,
    total_cost,
    total_pnl,
    total_pnl_pct,
    holding_count: holdings.length,
  };
}

function normaliseWeights(holdings: Holding[]): Holding[] {
  const total = holdings.reduce((s, h) => s + (h.market_value ?? 0), 0);
  if (total <= 0) return holdings.map((h) => ({ ...h, weight: 0 }));
  return holdings.map((h) => ({ ...h, weight: (h.market_value ?? 0) / total }));
}

function toGbp(price: number, currency: "GBP" | "USD" | "EUR"): number {
  if (currency === "USD") return price / (DEMO_REFRESH_DATA.summary.gbpusd || 1);
  if (currency === "EUR") return price / (DEMO_REFRESH_DATA.summary.gbpeur || 1);
  return price;
}

const Ctx = createContext<DemoModeCtx>({
  isDemoMode: false,
  setDemoMode: () => {},
  toggleDemoMode: () => {},
  demoData: cloneDefaultDemoData(),
  addDemoHolding: () => {},
  removeDemoHolding: () => {},
  resetDemoPortfolio: () => {},
});

export function DemoModeProvider({ children }: { children: React.ReactNode }) {
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [demoData, setDemoData] = useState<RefreshData>(cloneDefaultDemoData());

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    setIsDemoMode(saved === "1");

    const raw = localStorage.getItem(DEMO_HOLDINGS_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Holding[];
      if (!Array.isArray(parsed)) return;
      const holdings = normaliseWeights(parsed);
      setDemoData({
        ...cloneDefaultDemoData(),
        holdings,
        summary: recomputeSummary(holdings),
        refreshed_at: Math.floor(Date.now() / 1000),
      });
    } catch {
      // Ignore corrupted local demo data and use defaults
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(DEMO_HOLDINGS_KEY, JSON.stringify(demoData.holdings));
  }, [demoData.holdings]);

  function setDemoMode(enabled: boolean) {
    setIsDemoMode(enabled);
    localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
    if (enabled) {
      void trackEvent("demo_mode_enabled", { enabled: true });
    }
  }

  function toggleDemoMode() {
    setDemoMode(!isDemoMode);
  }

  function addDemoHolding(payload: {
    ticker: string;
    type: "stock" | "etf" | "crypto";
    transaction: {
      date: string;
      shares: number;
      price: number;
      type: "buy" | "sell";
      price_currency: "GBP" | "USD" | "EUR";
    };
  }) {
    const ticker = payload.ticker.trim().toUpperCase();
    const shares = Number(payload.transaction.shares);
    const priceGbp = toGbp(Number(payload.transaction.price), payload.transaction.price_currency);

    if (!ticker || !Number.isFinite(shares) || shares <= 0 || !Number.isFinite(priceGbp) || priceGbp <= 0) {
      throw new Error("Please enter a valid ticker, shares, and price.");
    }

    setDemoData((prev) => {
      const holdings = [...prev.holdings];
      const idx = holdings.findIndex((h) => h.ticker.toUpperCase() === ticker);
      const isBuy = payload.transaction.type === "buy";

      if (idx === -1 && !isBuy) {
        throw new Error("Cannot sell a holding that does not exist in demo portfolio.");
      }

      if (idx === -1) {
        const knownPrice =
          DEMO_REFRESH_DATA.holdings.find((h) => h.ticker.toUpperCase() === ticker)?.current_price ?? null;
        const currentPrice = knownPrice ?? null;
        const marketValue = currentPrice != null ? shares * currentPrice : shares * priceGbp;
        const pnl = currentPrice != null ? marketValue - shares * priceGbp : 0;
        holdings.push({
          ticker,
          type: payload.type,
          net_shares: shares,
          avg_cost: priceGbp,
          current_price: currentPrice,
          market_value: marketValue,
          cost_basis: shares * priceGbp,
          pnl,
          pnl_pct: priceGbp > 0 ? (pnl / (shares * priceGbp)) * 100 : 0,
          total_dividends: 0,
          weight: null,
          transaction_count: 1,
        });
      } else {
        const current = holdings[idx];
        const priorShares = current.net_shares;
        const newShares = isBuy ? priorShares + shares : priorShares - shares;

        if (newShares < 0) {
          throw new Error(`Cannot sell more than current shares for ${ticker}.`);
        }

        if (newShares === 0) {
          holdings.splice(idx, 1);
        } else {
          const newAvgCost = isBuy
            ? ((priorShares * current.avg_cost) + (shares * priceGbp)) / newShares
            : current.avg_cost;
          const currentPrice = current.current_price ?? priceGbp;
          const marketValue = newShares * currentPrice;
          const costBasis = newShares * newAvgCost;
          const pnl = marketValue - costBasis;

          holdings[idx] = {
            ...current,
            net_shares: newShares,
            avg_cost: newAvgCost,
            current_price: currentPrice,
            market_value: marketValue,
            cost_basis: costBasis,
            pnl,
            pnl_pct: costBasis > 0 ? (pnl / costBasis) * 100 : 0,
            transaction_count: (current.transaction_count ?? 0) + 1,
          };
        }
      }

      const weighted = normaliseWeights(holdings);
      return {
        ...prev,
        holdings: weighted,
        summary: recomputeSummary(weighted),
        refreshed_at: Math.floor(Date.now() / 1000),
      };
    });
  }

  function removeDemoHolding(ticker: string) {
    setDemoData((prev) => {
      const holdings = prev.holdings.filter((h) => h.ticker !== ticker);
      const weighted = normaliseWeights(holdings);
      return {
        ...prev,
        holdings: weighted,
        summary: recomputeSummary(weighted),
        refreshed_at: Math.floor(Date.now() / 1000),
      };
    });
  }

  function resetDemoPortfolio() {
    const reset = cloneDefaultDemoData();
    setDemoData(reset);
    localStorage.setItem(DEMO_HOLDINGS_KEY, JSON.stringify(reset.holdings));
  }

  return (
    <Ctx.Provider value={{ isDemoMode, setDemoMode, toggleDemoMode, demoData, addDemoHolding, removeDemoHolding, resetDemoPortfolio }}>
      {children}
    </Ctx.Provider>
  );
}

export function useDemoMode() {
  return useContext(Ctx);
}
