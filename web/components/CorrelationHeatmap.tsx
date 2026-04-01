"use client";
import { useEffect, useRef, useState } from "react";
import type { CorrelationData } from "@/lib/api";

// Synthwave palette: pink (−1) → dark purple (0) → cyan (+1)
const PINK:   [number, number, number] = [255, 45,  120];
const DARK:   [number, number, number] = [16,  0,   32];
const CYAN:   [number, number, number] = [0,   245, 212];

function lerp(a: [number,number,number], b: [number,number,number], t: number): string {
  return `rgb(${Math.round(a[0]+(b[0]-a[0])*t)},${Math.round(a[1]+(b[1]-a[1])*t)},${Math.round(a[2]+(b[2]-a[2])*t)})`;
}

function cellColor(v: number): string {
  if (v >= 0) return lerp(DARK, CYAN, v);
  return lerp(DARK, PINK, -v);
}

function textColor(v: number): string {
  return Math.abs(v) > 0.45 ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.35)";
}

function levelLabel(v: number): string {
  if (v < 0)    return "Inverse";
  if (v > 0.7)  return "High";
  if (v > 0.3)  return "Moderate";
  return "Low";
}

function levelColor(v: number): string {
  if (v < 0)    return "#ff2d78";
  if (v > 0.7)  return "#00f5d4";
  if (v > 0.3)  return "#bf5af2";
  return "#6b5e7e";
}

type Tooltip = { row: string; col: string; value: number; overlap?: number; x: number; y: number } | null;

export default function CorrelationHeatmap({ data }: { data: CorrelationData }) {
  const [tooltip, setTooltip] = useState<Tooltip>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(520);
  const { tickers, matrix } = data;
  const n = tickers.length;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w) setContainerW(w);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  if (n < 2) {
    return (
      <div className="synth-card rounded-xl p-10 text-muted text-sm text-center" style={{ borderColor: "#2a0050" }}>
        Add at least 2 holdings to view the correlation matrix.
      </div>
    );
  }

  const lookup = new Map<string, number>();
  const overlapLookup = new Map<string, number>();
  matrix.forEach(c => {
    lookup.set(`${c.row}|${c.col}`, c.value);
    if (c.overlap !== undefined) overlapLookup.set(`${c.row}|${c.col}`, c.overlap);
  });

  const LABEL_W = 70;
  const PAD     = 4;
  const CELL    = Math.min(76, Math.max(32, Math.floor((containerW - LABEL_W - PAD) / n)));
  const totalW  = LABEL_W + n * CELL + PAD;
  const totalH  = LABEL_W + n * CELL + PAD;

  return (
    <div
      ref={containerRef}
      className="synth-card rounded-xl p-5 relative overflow-x-auto"
      style={{ borderColor: "#2a0050" }}
    >
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-5 mb-5 text-xs font-mono">
        {[
          { color: "#ff2d78", label: "Inverse  (< 0)" },
          { color: "#2a0050", label: "None  (≈ 0)",    border: "#3d0060" },
          { color: "#bf5af2", label: "Moderate  (0.3–0.7)" },
          { color: "#00f5d4", label: "High  (> 0.7)" },
        ].map(({ color, label, border }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span
              className="w-3 h-3 rounded-sm inline-block shrink-0"
              style={{ background: color, border: border ? `1px solid ${border}` : undefined }}
            />
            <span style={{ color: "#6b5e7e" }}>{label}</span>
          </div>
        ))}
      </div>

      <svg
        width="100%"
        height={totalH}
        viewBox={`0 0 ${totalW} ${totalH}`}
        onMouseLeave={() => setTooltip(null)}
        style={{ display: "block" }}
      >
        {/* Column labels */}
        {tickers.map((t, i) => (
          <text
            key={`col-${t}`}
            x={LABEL_W + i * CELL + CELL / 2}
            y={LABEL_W - 10}
            textAnchor="middle"
            fontSize={Math.min(12, CELL * 0.17)}
            fill="#bf5af2"
            fontFamily="'JetBrains Mono', monospace"
            fontWeight="600"
          >
            {t.replace(".L", "")}
          </text>
        ))}

        {/* Row labels */}
        {tickers.map((t, i) => (
          <text
            key={`row-${t}`}
            x={LABEL_W - 10}
            y={LABEL_W + i * CELL + CELL / 2}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize={Math.min(12, CELL * 0.17)}
            fill="#bf5af2"
            fontFamily="'JetBrains Mono', monospace"
            fontWeight="600"
          >
            {t.replace(".L", "")}
          </text>
        ))}

        {/* Cells */}
        {tickers.map((rowT, ri) =>
          tickers.map((colT, ci) => {
            const v      = lookup.get(`${rowT}|${colT}`) ?? 0;
            const x      = LABEL_W + ci * CELL;
            const y      = LABEL_W + ri * CELL;
            const isdiag = ri === ci;
            const gap    = 3;

            return (
              <g key={`${rowT}|${colT}`}>
                <rect
                  x={x + gap}
                  y={y + gap}
                  width={CELL - gap * 2}
                  height={CELL - gap * 2}
                  rx={5}
                  fill={isdiag ? "#1a0035" : cellColor(v)}
                  stroke={isdiag ? "#bf5af2" : "none"}
                  strokeWidth={isdiag ? 1.5 : 0}
                  style={{
                    cursor: isdiag ? "default" : "crosshair",
                    filter: isdiag ? "drop-shadow(0 0 4px #bf5af244)" : undefined,
                  }}
                  onMouseEnter={e => !isdiag && setTooltip({ row: rowT, col: colT, value: v, overlap: overlapLookup.get(`${rowT}|${colT}`), x: e.clientX, y: e.clientY })}
                  onMouseMove={e => !isdiag && setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)}
                />
                {CELL >= 44 && (
                  <text
                    x={x + CELL / 2}
                    y={y + CELL / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={Math.min(11, CELL * 0.19)}
                    fill={isdiag ? "#bf5af2" : textColor(v)}
                    fontFamily="'JetBrains Mono', monospace"
                    fontWeight={isdiag ? "700" : "500"}
                    style={{ pointerEvents: "none" }}
                  >
                    {isdiag ? "—" : v.toFixed(2)}
                  </text>
                )}
              </g>
            );
          })
        )}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none rounded-xl px-3 py-2.5 text-xs shadow-2xl"
          style={{
            left: tooltip.x + 14,
            top: tooltip.y - 48,
            background: "#10001e",
            border: `1px solid ${levelColor(tooltip.value)}44`,
            boxShadow: `0 0 16px ${levelColor(tooltip.value)}22`,
          }}
        >
          <div className="font-mono font-bold text-text mb-1">
            {tooltip.row.replace(".L","")} / {tooltip.col.replace(".L","")}
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-base font-bold" style={{ color: levelColor(tooltip.value) }}>
              {tooltip.value >= 0 ? "+" : ""}{tooltip.value.toFixed(4)}
            </span>
            <span
              className="text-[10px] font-mono px-1.5 py-0.5 rounded"
              style={{ background: `${levelColor(tooltip.value)}22`, color: levelColor(tooltip.value) }}
            >
              {levelLabel(tooltip.value)}
            </span>
          </div>
          {tooltip.overlap !== undefined && (
            <div className="text-[10px] font-mono mt-1" style={{ color: tooltip.overlap < 60 ? "#f5a623" : "#4a3a5e" }}>
              {tooltip.overlap} overlapping days{tooltip.overlap < 60 ? " — low confidence" : ""}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
