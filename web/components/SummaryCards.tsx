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

const CURRENCY_SYMBOL: Record<string, string> = { GBP: "£", EUR: "€", USD: "$" };

function fmtAnimated(n: number, symbol = "£"): string {
  return `${symbol}${Math.abs(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Card ──────────────────────────────────────────────────────────────────────

function Card({
  label, rawValue, displayValue, sub, accent, index, symbol,
}: {
  label: string;
  rawValue: number;
  displayValue?: string;
  sub?: string;
  accent: "pink" | "cyan" | "purple" | "default";
  index: number;
  symbol?: string;
}) {
  const animated = useCountUp(rawValue, 900, index * 80);

  const accents = {
    pink:    { color: "#ff6b8a", border: "#ff6b8a44", glow: "0 0 14px #ff6b8a22, inset 0 0 10px #ff6b8a10" },
    cyan:    { color: "#4dd2ff", border: "#4dd2ff44", glow: "0 0 14px #4dd2ff22, inset 0 0 10px #4dd2ff10" },
    purple:  { color: "#7ca8ff", border: "#7ca8ff44", glow: "0 0 14px #7ca8ff22, inset 0 0 10px #7ca8ff10" },
    default: { color: "#d9e4f2", border: "#1f3248",   glow: "none" },
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
      <span className="text-[10px] sm:text-xs text-muted uppercase tracking-widest font-mono break-words">{label}</span>
      <span
        className="text-lg sm:text-2xl font-bold font-mono mt-1 tabular-nums leading-tight break-words"
        style={{ color: a.color }}
      >
        {displayValue ?? fmtAnimated(animated, symbol)}
      </span>
      {sub && <span className="text-[11px] sm:text-xs text-muted break-words">{sub}</span>}
    </div>
  );
}

// ── Export ────────────────────────────────────────────────────────────────────

export default function SummaryCards({ summary, currency = "GBP" }: { summary: Summary; currency?: string }) {
  const fxRate = currency === "EUR" ? (summary.gbpeur ?? 1) : currency === "USD" ? (summary.gbpusd ?? 1) : 1;
  const symbol = CURRENCY_SYMBOL[currency] ?? "£";

  const value     = summary.total_value * fxRate;
  const pnl       = summary.total_pnl * fxRate;
  const cost      = summary.total_cost * fxRate;
  const pos       = pnl >= 0;
  const pnlPct    = summary.total_pnl_pct?.toFixed(2) ?? "0.00";

  const fxLabel   = currency === "EUR" ? "GBP / EUR" : "GBP / USD";
  const fxValue   = currency === "EUR"
    ? (summary.gbpeur != null ? summary.gbpeur.toFixed(4) : "—")
    : (summary.gbpusd != null ? summary.gbpusd.toFixed(4) : "—");

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card
        index={0}
        label="Portfolio Value"
        rawValue={value}
        accent="cyan"
        symbol={symbol}
      />
      <Card
        index={1}
        label="Unrealised P&L"
        rawValue={pnl}
        displayValue={`${pos ? "+" : "-"}${fmtAnimated(Math.abs(pnl), symbol)}`}
        sub={`${pos ? "+" : ""}${pnlPct}% overall`}
        accent={pos ? "cyan" : "pink"}
        symbol={symbol}
      />
      <Card
        index={2}
        label="Total Invested"
        rawValue={cost}
        accent="purple"
        symbol={symbol}
      />
      <Card
        index={3}
        label={fxLabel}
        rawValue={0}
        displayValue={fxValue}
        sub={`${summary.holding_count} holding${summary.holding_count !== 1 ? "s" : ""}`}
        accent="default"
      />
    </div>
  );
}
