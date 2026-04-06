"use client";
import { useState } from "react";
import type { Holding } from "@/lib/api";

const CURRENCY_SYMBOL: Record<string, string> = { GBP: "£", EUR: "€", USD: "$" };

function fmt(n: number | null | undefined, symbol = "£", decimals = 2) {
  if (n == null) return <span className="text-muted">-</span>;
  return `${symbol}${n.toLocaleString("en-GB", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function PnL({ val, pct, symbol = "£" }: { val: number | null; pct: number | null; symbol?: string }) {
  if (val == null) return <span className="text-muted">-</span>;
  const pos = val >= 0;
  return (
    <div style={{ color: pos ? "#4dd2ff" : "#ff6b8a" }}>
      <div className="font-mono text-sm">{pos ? "+" : ""}{symbol}{Math.abs(val).toFixed(2)}</div>
      <div className="text-xs opacity-70">{pos ? "+" : ""}{pct?.toFixed(2)}%</div>
    </div>
  );
}

const TYPE_BADGE: Record<string, { bg: string; color: string; border: string }> = {
  stock: { bg: "#4dd2ff14", color: "#4dd2ff", border: "#4dd2ff44" },
  etf: { bg: "#7ca8ff14", color: "#7ca8ff", border: "#7ca8ff44" },
  crypto: { bg: "#ff6b8a14", color: "#ff6b8a", border: "#ff6b8a44" },
};

type SortKey = keyof Holding;

export default function HoldingsTable({
  holdings,
  onRemove,
  currency = "GBP",
  fxRate = 1,
}: {
  holdings: Holding[];
  onRemove: (ticker: string) => void;
  currency?: string;
  fxRate?: number;
}) {
  const symbol = CURRENCY_SYMBOL[currency] ?? "£";
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: "market_value", asc: false });

  const sorted = [...holdings].sort((a, b) => {
    const av = a[sort.key] ?? -Infinity;
    const bv = b[sort.key] ?? -Infinity;
    return sort.asc ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });

  function toggle(key: SortKey) {
    setSort((s) => (s.key === key ? { key, asc: !s.asc } : { key, asc: false }));
  }

  function Th({ label, k }: { label: string; k: SortKey }) {
    const active = sort.key === k;
    return (
      <th
        onClick={() => toggle(k)}
        className="px-4 py-3 text-left text-[11px] uppercase tracking-wider cursor-pointer select-none transition-colors font-mono"
        style={{ color: active ? "#4dd2ff" : "#7f93ad" }}
      >
        {label}
        {active ? (sort.asc ? " ↑" : " ↓") : ""}
      </th>
    );
  }

  if (holdings.length === 0) {
    return (
      <div className="synth-card rounded-xl p-12 flex flex-col items-center justify-center gap-4 text-center" style={{ borderColor: "#1f3248", borderStyle: "dashed" }}>
        <div className="text-4xl" style={{ color: "#2b415c" }}>◇</div>
        <div>
          <p className="text-text text-sm font-medium mb-1">No holdings yet</p>
          <p className="text-muted text-xs">
            Click <span className="font-mono" style={{ color: "#4dd2ff" }}>+ Add Holding</span> to start tracking your portfolio.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="synth-card rounded-xl overflow-hidden" style={{ borderColor: "#1f3248" }}>
      <div className="px-4 py-2.5 border-b" style={{ borderColor: "#1f3248", background: "#0d1828" }}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="ontology-chip ontology-chip-entity">Holdings Schema</span>
          <span className="ontology-chip ontology-chip-rel">Each row contributes to portfolio value</span>
          <span className="ontology-chip ontology-chip-rel">Each row tracks its own return stream</span>
        </div>
      </div>
      <div className="md:hidden">
        {sorted.map((h, i) => {
          const badge = TYPE_BADGE[h.type] ?? TYPE_BADGE.stock;
          return (
            <div key={h.ticker} className="px-4 py-3.5 flex items-start justify-between gap-3" style={{ borderTop: i > 0 ? "1px solid #1a2a3f" : undefined }}>
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold font-mono break-all" style={{ color: "#d9e4f2" }}>{h.ticker.replace(".L", "")}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded font-mono font-medium shrink-0" style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>
                    {h.type}
                  </span>
                </div>
                <span className="text-xs font-mono" style={{ color: "#7f93ad" }}>
                  {h.net_shares?.toFixed(4)} shares
                </span>
                <span className="text-xs font-mono" style={{ color: "#7f93ad" }}>
                  avg {typeof fmt(h.avg_cost != null ? h.avg_cost * fxRate : null, symbol) === "string" ? fmt(h.avg_cost != null ? h.avg_cost * fxRate : null, symbol) : "-"}
                </span>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0 max-w-[45%]">
                <span className="font-mono font-semibold text-sm text-text break-words text-right">{fmt(h.market_value != null ? h.market_value * fxRate : null, symbol)}</span>
                <PnL val={h.pnl != null ? h.pnl * fxRate : null} pct={h.pnl_pct} symbol={symbol} />
              </div>
              <button onClick={() => onRemove(h.ticker)} className="text-xs shrink-0 px-2 py-2 rounded transition-colors hover:text-[#ff6b8a] hover:bg-[#ff6b8a14]" style={{ color: "#7f93ad" }}>
                ✕
              </button>
            </div>
          );
        })}
      </div>

      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead style={{ borderBottom: "1px solid #1f3248" }}>
            <tr>
              <Th label="Ticker" k="ticker" />
              <Th label="Shares" k="net_shares" />
              <Th label="Avg Cost" k="avg_cost" />
              <Th label="Price" k="current_price" />
              <Th label="Value" k="market_value" />
              <Th label="P&L" k="pnl" />
              <Th label="Weight" k="weight" />
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((h, i) => {
              const badge = TYPE_BADGE[h.type] ?? TYPE_BADGE.stock;
              return (
                <tr key={h.ticker} className="animate-fade-row transition-colors hover:bg-[#4dd2ff0d]" style={{ borderTop: i > 0 ? "1px solid #1a2a3f" : undefined, animationDelay: `${i * 32}ms` }}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold font-mono" style={{ color: "#d9e4f2" }}>{h.ticker}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-medium" style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>
                        {h.type}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-muted">{h.net_shares?.toFixed(4)}</td>
                  <td className="px-4 py-3 font-mono text-text">{fmt(h.avg_cost != null ? h.avg_cost * fxRate : null, symbol)}</td>
                  <td className="px-4 py-3 font-mono text-text">{fmt(h.current_price != null ? h.current_price * fxRate : null, symbol)}</td>
                  <td className="px-4 py-3 font-mono font-semibold text-text">{fmt(h.market_value != null ? h.market_value * fxRate : null, symbol)}</td>
                  <td className="px-4 py-3"><PnL val={h.pnl != null ? h.pnl * fxRate : null} pct={h.pnl_pct} symbol={symbol} /></td>
                  <td className="px-4 py-3 font-mono text-muted">{h.weight != null ? `${(h.weight * 100).toFixed(1)}%` : "-"}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => onRemove(h.ticker)} className="text-xs text-muted px-2 py-1 rounded transition-colors hover:text-[#ff6b8a] hover:bg-[#ff6b8a14]">
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
