"use client";
import { useState } from "react";
import type { Holding } from "@/lib/api";

function fmt(n: number | null | undefined, decimals = 2) {
  if (n == null) return <span className="text-muted">—</span>;
  return `£${n.toLocaleString("en-GB", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function PnL({ val, pct }: { val: number | null; pct: number | null }) {
  if (val == null) return <span className="text-muted">—</span>;
  const pos = val >= 0;
  return (
    <div style={{ color: pos ? "#00f5d4" : "#ff2d78" }}>
      <div className="font-mono text-sm">{pos ? "+" : ""}£{Math.abs(val).toFixed(2)}</div>
      <div className="text-xs opacity-70">{pos ? "+" : ""}{pct?.toFixed(2)}%</div>
    </div>
  );
}

const TYPE_BADGE: Record<string, { bg: string; color: string; border: string }> = {
  stock:  { bg: "#00f5d411", color: "#00f5d4", border: "#00f5d433" },
  etf:    { bg: "#bf5af211", color: "#bf5af2", border: "#bf5af233" },
  crypto: { bg: "#ff2d7811", color: "#ff2d78", border: "#ff2d7833" },
};

type SortKey = keyof Holding;

export default function HoldingsTable({ holdings, onRemove }: {
  holdings: Holding[];
  onRemove: (ticker: string) => void;
}) {
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: "market_value", asc: false });

  const sorted = [...holdings].sort((a, b) => {
    const av = a[sort.key] ?? -Infinity;
    const bv = b[sort.key] ?? -Infinity;
    return sort.asc ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });

  function toggle(key: SortKey) {
    setSort(s => s.key === key ? { key, asc: !s.asc } : { key, asc: false });
  }

  function Th({ label, k }: { label: string; k: SortKey }) {
    const active = sort.key === k;
    return (
      <th
        onClick={() => toggle(k)}
        className="px-4 py-3 text-left text-[11px] uppercase tracking-wider cursor-pointer select-none transition-colors font-mono"
        style={{ color: active ? "#bf5af2" : "#6b5e7e" }}
      >
        {label}{active ? (sort.asc ? " ↑" : " ↓") : ""}
      </th>
    );
  }

  if (holdings.length === 0) {
    return (
      <div
        className="synth-card rounded-xl p-12 flex flex-col items-center justify-center gap-4 text-center"
        style={{ borderColor: "#2a0050", borderStyle: "dashed" }}
      >
        <div className="text-4xl" style={{ color: "#2a0050" }}>▦</div>
        <div>
          <p className="text-text text-sm font-medium mb-1">No holdings yet</p>
          <p className="text-muted text-xs">Click <span className="font-mono" style={{ color: "#bf5af2" }}>+ Add Holding</span> to start tracking your portfolio.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="synth-card rounded-xl overflow-hidden" style={{ borderColor: "#2a0050" }}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead style={{ borderBottom: "1px solid #2a0050" }}>
            <tr>
              <Th label="Ticker" k="ticker" />
              <Th label="Shares" k="net_shares" />
              <Th label="Avg Cost" k="avg_cost" />
              <Th label="Price" k="current_price" />
              <Th label="Value" k="market_value" />
              <Th label="P&L" k="pnl" />
              <Th label="Weight" k="weight" />
              <th className="px-4 py-3 text-left text-[11px] text-muted uppercase tracking-wider font-mono">Divs</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((h, i) => {
              const badge = TYPE_BADGE[h.type] ?? TYPE_BADGE.stock;
              return (
                <tr
                  key={h.ticker}
                  className="animate-fade-row transition-colors"
                  style={{
                    borderTop: i > 0 ? "1px solid #1a0030" : undefined,
                    animationDelay: `${i * 40}ms`,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#bf5af208")}
                  onMouseLeave={e => (e.currentTarget.style.background = "")}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold font-mono" style={{ color: "#e2d9f3" }}>{h.ticker}</span>
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-mono font-medium"
                        style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}
                      >
                        {h.type}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-muted">{h.net_shares?.toFixed(4)}</td>
                  <td className="px-4 py-3 font-mono text-text">{fmt(h.avg_cost)}</td>
                  <td className="px-4 py-3 font-mono text-text">{fmt(h.current_price)}</td>
                  <td className="px-4 py-3 font-mono font-semibold text-text">{fmt(h.market_value)}</td>
                  <td className="px-4 py-3"><PnL val={h.pnl} pct={h.pnl_pct} /></td>
                  <td className="px-4 py-3 font-mono text-muted">
                    {h.weight != null ? `${(h.weight * 100).toFixed(1)}%` : "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-muted">{fmt(h.total_dividends)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => onRemove(h.ticker)}
                      className="text-xs text-muted px-2 py-1 rounded transition-all"
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#ff2d78"; (e.currentTarget as HTMLElement).style.background = "#ff2d7811"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = ""; (e.currentTarget as HTMLElement).style.background = ""; }}
                    >
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
