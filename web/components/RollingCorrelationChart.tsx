"use client";
import { useMemo } from "react";
import type { RollingCorrelationData } from "@/lib/api";

const COLORS = ["#00f5d4", "#bf5af2", "#ff2d78"];

export default function RollingCorrelationChart({ data }: { data: RollingCorrelationData }) {
  const { pairs, window: win } = data;

  if (!pairs || pairs.length === 0) {
    return (
      <div className="synth-card rounded-xl p-8 text-muted text-sm text-center" style={{ borderColor: "#2a0050" }}>
        Not enough data for rolling correlation.
      </div>
    );
  }

  // Use the longest pair's dates as the x-axis reference
  const refPair = pairs.reduce((a, b) => (a.dates.length >= b.dates.length ? a : b));
  const dates = refPair.dates;

  // Chart dimensions
  const W = 700;
  const H = 260;
  const PAD_L = 45;
  const PAD_R = 16;
  const PAD_T = 16;
  const PAD_B = 40;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  // Y range: -1 to 1
  const yMin = -1;
  const yMax = 1;
  const toX = (i: number, total: number) => PAD_L + (i / Math.max(1, total - 1)) * plotW;
  const toY = (v: number) => PAD_T + (1 - (v - yMin) / (yMax - yMin)) * plotH;

  // Grid lines at -0.5, 0, 0.5, 1.0
  const gridYs = [-1, -0.5, 0, 0.5, 1.0];

  // Build SVG paths
  const paths = useMemo(() => {
    return pairs.map((p, pi) => {
      const vals = p.values;
      const total = vals.length;
      if (total < 2) return null;
      const d = vals
        .map((v, i) => `${i === 0 ? "M" : "L"}${toX(i, total).toFixed(1)},${toY(v).toFixed(1)}`)
        .join(" ");
      return { d, color: COLORS[pi % COLORS.length], pair: p.pair, static_corr: p.static_correlation };
    }).filter(Boolean) as { d: string; color: string; pair: string; static_corr: number }[];
  }, [pairs]);

  // X-axis labels (show ~5 evenly spaced dates)
  const xLabels = useMemo(() => {
    if (dates.length < 2) return [];
    const step = Math.max(1, Math.floor(dates.length / 5));
    const labels = [];
    for (let i = 0; i < dates.length; i += step) {
      labels.push({ x: toX(i, dates.length), label: dates[i].slice(5) }); // "MM-DD"
    }
    return labels;
  }, [dates]);

  return (
    <div className="synth-card rounded-xl p-5" style={{ borderColor: "#2a0050" }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#bf5af2" }}>
            Rolling Correlation
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: "#4a3a5e" }}>
            {win}-day window · Top correlated pairs
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mb-3">
        {paths.map((p) => (
          <div key={p.pair} className="flex items-center gap-1.5 text-xs font-mono">
            <span className="w-3 h-0.5 rounded-full inline-block" style={{ background: p.color }} />
            <span style={{ color: p.color }}>{p.pair.replace(/\.L/g, "")}</span>
            <span className="text-muted text-[10px]">({p.static_corr >= 0 ? "+" : ""}{p.static_corr.toFixed(2)})</span>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <svg width={W} height={H} style={{ display: "block" }}>
          {/* Grid lines */}
          {gridYs.map((v) => (
            <g key={v}>
              <line
                x1={PAD_L} x2={W - PAD_R}
                y1={toY(v)} y2={toY(v)}
                stroke={v === 0 ? "#3d006066" : "#1a003044"}
                strokeWidth={v === 0 ? 1 : 0.5}
                strokeDasharray={v === 0 ? undefined : "3,3"}
              />
              <text
                x={PAD_L - 8} y={toY(v)}
                textAnchor="end" dominantBaseline="middle"
                fontSize={10} fill="#4a3a5e"
                fontFamily="'JetBrains Mono', monospace"
              >
                {v.toFixed(1)}
              </text>
            </g>
          ))}

          {/* X-axis labels */}
          {xLabels.map(({ x, label }) => (
            <text
              key={label + x}
              x={x} y={H - 8}
              textAnchor="middle" fontSize={9} fill="#4a3a5e"
              fontFamily="'JetBrains Mono', monospace"
            >
              {label}
            </text>
          ))}

          {/* Data lines */}
          {paths.map((p) => (
            <path
              key={p.pair}
              d={p.d}
              fill="none"
              stroke={p.color}
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ filter: `drop-shadow(0 0 4px ${p.color}44)` }}
            />
          ))}
        </svg>
      </div>
    </div>
  );
}
