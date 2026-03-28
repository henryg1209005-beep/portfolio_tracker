import type { Summary } from "@/lib/api";

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return `£${Math.abs(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Card({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent: "pink" | "cyan" | "purple" | "default";
}) {
  const accents = {
    pink:    { color: "#ff2d78", glow: "border-glow-pink",   border: "#ff2d7833" },
    cyan:    { color: "#00f5d4", glow: "border-glow-cyan",   border: "#00f5d433" },
    purple:  { color: "#bf5af2", glow: "border-glow-purple", border: "#bf5af233" },
    default: { color: "#e2d9f3", glow: "",                   border: "#2a0050"   },
  };
  const a = accents[accent];

  return (
    <div
      className={`synth-card rounded-xl p-5 flex flex-col gap-1 ${a.glow}`}
      style={{ borderColor: a.border }}
    >
      <span className="text-[11px] text-muted uppercase tracking-widest font-mono">{label}</span>
      <span className="text-2xl font-bold font-mono mt-1" style={{ color: a.color }}>
        {value}
      </span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </div>
  );
}

export default function SummaryCards({ summary }: { summary: Summary }) {
  const pos = summary.total_pnl >= 0;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card label="Portfolio Value" value={fmt(summary.total_value)} accent="cyan" />
      <Card
        label="Unrealised P&L"
        value={`${pos ? "+" : "-"}${fmt(summary.total_pnl)}`}
        sub={`${pos ? "+" : ""}${summary.total_pnl_pct?.toFixed(2)}% overall`}
        accent={pos ? "cyan" : "pink"}
      />
      <Card label="Dividends Received" value={fmt(summary.total_dividends)} accent="purple" />
      <Card
        label="GBP / USD"
        value={`${summary.gbpusd?.toFixed(4)}`}
        sub={`${summary.holding_count} holdings`}
        accent="default"
      />
    </div>
  );
}
