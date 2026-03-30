"use client";
import { useEffect, useRef, useState } from "react";
import type { Summary } from "@/lib/api";

// ── Count-up hook ─────────────────────────────────────────────────────────────

function useCountUp(target: number, duration = 900, delay = 0): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (target === 0) { setValue(0); return; }
    let timeout: ReturnType<typeof setTimeout>;

    timeout = setTimeout(() => {
      const start = performance.now();
      function tick(now: number) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        // ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        setValue(target * eased);
        if (progress < 1) rafRef.current = requestAnimationFrame(tick);
        else setValue(target);
      }
      rafRef.current = requestAnimationFrame(tick);
    }, delay);

    return () => {
      clearTimeout(timeout);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration, delay]);

  return value;
}

// ── Formatter ─────────────────────────────────────────────────────────────────

function fmtAnimated(n: number): string {
  return `£${Math.abs(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtStatic(n: number | null | undefined): string {
  if (n == null) return "—";
  return `£${Math.abs(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Card ──────────────────────────────────────────────────────────────────────

function Card({
  label, rawValue, displayValue, sub, accent, index,
}: {
  label: string;
  rawValue: number;
  displayValue?: string;
  sub?: string;
  accent: "pink" | "cyan" | "purple" | "default";
  index: number;
}) {
  const animated = useCountUp(rawValue, 900, index * 80);

  const accents = {
    pink:    { color: "#ff2d78", border: "#ff2d7844", glow: "0 0 18px #ff2d7833, inset 0 0 12px #ff2d7808" },
    cyan:    { color: "#00f5d4", border: "#00f5d444", glow: "0 0 18px #00f5d433, inset 0 0 12px #00f5d408" },
    purple:  { color: "#bf5af2", border: "#bf5af244", glow: "0 0 18px #bf5af233, inset 0 0 12px #bf5af208" },
    default: { color: "#e2d9f3", border: "#2a0050",   glow: "none" },
  };
  const a = accents[accent];

  return (
    <div
      className="synth-card rounded-xl p-5 flex flex-col gap-1 animate-fade-up transition-all duration-300 hover:scale-[1.02]"
      style={{
        animationDelay: `${index * 80}ms`,
        borderColor: a.border,
        boxShadow: a.glow,
      }}
    >
      <span className="text-[11px] text-muted uppercase tracking-widest font-mono">{label}</span>
      <span
        className="text-2xl font-bold font-mono mt-1 tabular-nums"
        style={{ color: a.color }}
      >
        {displayValue ?? fmtAnimated(animated)}
      </span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </div>
  );
}

// ── Export ────────────────────────────────────────────────────────────────────

export default function SummaryCards({ summary }: { summary: Summary }) {
  const pos = summary.total_pnl >= 0;
  const pnlPct = summary.total_pnl_pct?.toFixed(2) ?? "0.00";

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card
        index={0}
        label="Portfolio Value"
        rawValue={summary.total_value}
        accent="cyan"
      />
      <Card
        index={1}
        label="Unrealised P&L"
        rawValue={summary.total_pnl}
        displayValue={`${pos ? "+" : "-"}${fmtAnimated(Math.abs(summary.total_pnl))}`}
        sub={`${pos ? "+" : ""}${pnlPct}% overall`}
        accent={pos ? "cyan" : "pink"}
      />
      <Card
        index={2}
        label="Dividends Received"
        rawValue={summary.total_dividends}
        accent="purple"
      />
      <Card
        index={3}
        label="GBP / USD"
        rawValue={0}
        displayValue={`${summary.gbpusd?.toFixed(4)}`}
        sub={`${summary.holding_count} holding${summary.holding_count !== 1 ? "s" : ""}`}
        accent="default"
      />
    </div>
  );
}
