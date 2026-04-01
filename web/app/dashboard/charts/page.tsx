"use client";
import { useEffect, useState, useCallback } from "react";
import { fetchPerformance, fetchRefresh, type PerformanceData, type RefreshData } from "@/lib/api";
import { useCurrency, CURRENCY_SYMBOL } from "@/lib/currencyContext";
import {
  LineChart, Line, AreaChart, Area,
  BarChart, Bar, Cell, ReferenceLine,
  PieChart, Pie, Sector,
  XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from "recharts";

// ── Palette ───────────────────────────────────────────────────────────────────

type Timeframe = "1M" | "3M" | "6M" | "1Y" | "5Y";
const TIMEFRAMES: Timeframe[] = ["1M", "3M", "6M", "1Y", "5Y"];
type Benchmark = "sp500" | "ftse100" | "msci_world";
const BENCHMARKS: { key: Benchmark; label: string; short: string }[] = [
  { key: "sp500", label: "S&P 500", short: "S&P 500" },
  { key: "ftse100", label: "FTSE 100", short: "FTSE 100" },
  { key: "msci_world", label: "MSCI World", short: "MSCI World" },
];

const PIE_COLORS = [
  "#bf5af2", "#00f5d4", "#ff2d78", "#f5a623",
  "#5ac8fa", "#34c759", "#ff9f0a", "#30d158",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string, tf: Timeframe) {
  // Parse YYYY-MM-DD to local date parts to avoid timezone day-shift.
  const [y, m, d] = dateStr.split("-").map(Number);
  const parsed = Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)
    ? new Date(y, m - 1, d)
    : new Date(dateStr);
  const date = Number.isNaN(parsed.getTime()) ? new Date(dateStr) : parsed;
  if (tf === "1M" || tf === "3M")
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  if (tf === "5Y")
    return date.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
  return date.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

function sign(n: number) { return n >= 0 ? "+" : ""; }
function fmtCurrency(n: number, symbol: string) { return `${symbol}${Math.abs(n).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`; }

// ── Shared tooltip ────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, formatter }: {
  active?: boolean;
  payload?: { value: number; name: string; color: string }[];
  label?: string;
  formatter?: (v: number, name: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-xl px-3 py-2.5 text-xs shadow-2xl pointer-events-none"
      style={{ background: "#10001e", border: "1px solid #2a0050", boxShadow: "0 0 16px #bf5af222" }}
    >
      {label && <div className="font-mono text-muted mb-2">{label}</div>}
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2 mb-0.5">
          <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ background: p.color }} />
          <span className="font-mono" style={{ color: p.color }}>
            {p.name}: {formatter ? formatter(p.value, p.name) : p.value.toFixed(2)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-4">
      <div className="text-[11px] font-mono uppercase tracking-widest text-muted">{title}</div>
      <div className="text-xs text-muted/50 mt-0.5">{sub}</div>
    </div>
  );
}

// ── Drawdown computation ──────────────────────────────────────────────────────

function computeDrawdown(portfolio: number[], dates: string[], tf: Timeframe) {
  const out: { date: string; Drawdown: number }[] = [];
  let peak = portfolio[0] ?? 100;
  for (let i = 0; i < portfolio.length; i++) {
    if (portfolio[i] > peak) peak = portfolio[i];
    out.push({
      date: formatDate(dates[i], tf),
      Drawdown: ((portfolio[i] - peak) / peak) * 100,
    });
  }
  return out;
}

// ── Donut active shape ────────────────────────────────────────────────────────

function ActiveShape(props: {
  cx: number; cy: number; innerRadius: number; outerRadius: number;
  startAngle: number; endAngle: number; fill: string;
  payload: { name: string }; percent: number; value: number;
  symbol?: string; fxRate?: number;
}) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent, value, symbol = "£", fxRate = 1 } = props;
  return (
    <g>
      <text x={cx} y={cy - 10} textAnchor="middle" fill="#e2d9f3" fontSize={13} fontFamily="monospace" fontWeight="700">
        {payload.name}
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" fill={fill} fontSize={12} fontFamily="monospace">
        {(percent * 100).toFixed(1)}%
      </text>
      <text x={cx} y={cy + 28} textAnchor="middle" fill="#6b5e7e" fontSize={11} fontFamily="monospace">
        {fmtCurrency(value * fxRate, symbol)}
      </text>
      <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 6}
        startAngle={startAngle} endAngle={endAngle} fill={fill} />
      <Sector cx={cx} cy={cy} innerRadius={outerRadius + 10} outerRadius={outerRadius + 13}
        startAngle={startAngle} endAngle={endAngle} fill={fill} />
    </g>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ChartsPage() {
  const { currency } = useCurrency();
  const symbol = CURRENCY_SYMBOL[currency] ?? "£";
  const [perfData,    setPerfData]    = useState<PerformanceData | null>(null);
  const [portData,    setPortData]    = useState<RefreshData | null>(null);
  const fxRate = portData?.summary
    ? currency === "EUR" ? (portData.summary.gbpeur ?? 1)
    : currency === "USD" ? (portData.summary.gbpusd ?? 1)
    : 1
    : 1;
  const [perfLoading, setPerfLoading] = useState(true);
  const [portLoading, setPortLoading] = useState(true);
  const [perfError,   setPerfError]   = useState(false);
  const [timeframe,   setTimeframe]   = useState<Timeframe>("1Y");
  const [benchmark,   setBenchmark]   = useState<Benchmark>("sp500");
  const [activeSlice, setActiveSlice] = useState(0);

  const loading = perfLoading || portLoading;

  // Fetch performance and portfolio data independently so one failure
  // doesn't wipe out the other.
  const loadPerf = useCallback(async (tf: Timeframe, bm: Benchmark) => {
    setPerfLoading(true);
    setPerfError(false);
    try {
      const perf = await fetchPerformance(tf, bm);
      setPerfData(perf);
    } catch {
      setPerfError(true);
    } finally {
      setPerfLoading(false);
    }
  }, []);

  const loadPort = useCallback(async () => {
    setPortLoading(true);
    try {
      setPortData(await fetchRefresh());
    } catch {
      // portfolio data failing is non-critical — allocation/P&L charts just won't show
    } finally {
      setPortLoading(false);
    }
  }, []);

  useEffect(() => { loadPerf(timeframe, benchmark); }, [timeframe, benchmark, loadPerf]);
  useEffect(() => { loadPort(); }, [loadPort]);

  // ── Derived data ────────────────────────────────────────────────────────────

  const benchmarkLabel =
    perfData?.benchmark_name ??
    BENCHMARKS.find(b => b.key === benchmark)?.label ??
    "Benchmark";

  const perfChartData = perfData?.dates.map((d, i) => ({
    date: formatDate(d, timeframe),
    Portfolio: perfData.portfolio[i],
    Benchmark: perfData.benchmark[i],
  })) ?? [];

  const drawdownData = perfData && perfData.dates.length > 0
    ? computeDrawdown(perfData.portfolio, perfData.dates, timeframe)
    : [];

  const pnlData = (portData?.holdings ?? [])
    .filter(h => h.pnl != null)
    .map(h => ({ ticker: h.ticker.replace(".L", ""), pnl: (h.pnl as number) * fxRate }))
    .sort((a, b) => b.pnl - a.pnl);

  const allocationData = (portData?.holdings ?? [])
    .filter(h => h.market_value != null && h.market_value > 0)
    .map((h, i) => ({
      name: h.ticker.replace(".L", ""),
      value: Math.round(h.market_value as number),
      fill: PIE_COLORS[i % PIE_COLORS.length],
    }));

  const lastPort   = perfData?.portfolio.at(-1) ?? 100;
  const lastBench  = perfData?.benchmark.at(-1) ?? 100;
  const portReturn = lastPort  - 100;
  const benchReturn = lastBench - 100;
  const alpha = portReturn - benchReturn;
  const maxDD = drawdownData.length > 0
    ? Math.min(...drawdownData.map(d => d.Drawdown))
    : 0;

  const hasHoldings = (portData?.holdings ?? []).length > 0;
  const hasPerf  = !perfLoading && !!perfData && perfData.dates.length > 0;
  const hasPnl   = !portLoading && pnlData.length > 0;
  const hasAlloc = !portLoading && allocationData.length > 0;

  // Show failure state when: not loading, no fetch error, has holdings,
  // but dates came back empty — means backend computed nothing.
  const perfFailed = !perfLoading && !perfError && hasHoldings &&
                     !!perfData && perfData.dates.length === 0;
  // Show error state when fetch itself threw
  const perfNetworkError = !perfLoading && perfError;

  return (
    <div className="p-4 md:p-6 max-w-screen-xl mx-auto flex flex-col gap-6 md:gap-8">

      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">Charts</h1>
          <p className="text-muted text-sm mt-0.5 font-mono">
            Portfolio analytics · {timeframe} · {benchmarkLabel}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex overflow-x-auto" style={{ background: "#0d0020", border: "1px solid #2a0050", borderRadius: "0.5rem" }}>
            {BENCHMARKS.map(b => (
              <button
                key={b.key}
                onClick={() => setBenchmark(b.key)}
                disabled={perfLoading}
                className="px-3 py-1.5 text-xs font-mono font-semibold transition-all disabled:opacity-40 shrink-0"
                style={{
                  borderRadius: "0.45rem",
                  color:      b.key === benchmark ? "#080012" : "#6b5e7e",
                  background: b.key === benchmark ? "linear-gradient(90deg,#00f5d4,#5ac8fa)" : "transparent",
                  boxShadow:  b.key === benchmark ? "0 0 10px #00f5d444" : undefined,
                }}
              >
                {b.short}
              </button>
            ))}
          </div>

          <div className="flex overflow-x-auto" style={{ background: "#0d0020", border: "1px solid #2a0050", borderRadius: "0.5rem" }}>
            {TIMEFRAMES.map(tf => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                disabled={perfLoading}
                className="px-3 py-1.5 text-xs font-mono font-semibold transition-all disabled:opacity-40 shrink-0"
                style={{
                  borderRadius: "0.45rem",
                  color:      tf === timeframe ? "#080012" : "#6b5e7e",
                  background: tf === timeframe ? "linear-gradient(90deg,#bf5af2,#ff2d78)" : "transparent",
                  boxShadow:  tf === timeframe ? "0 0 10px #bf5af244" : undefined,
                }}
              >
                {tf}
              </button>
            ))}
          </div>

          <button
            onClick={() => { loadPerf(timeframe, benchmark); loadPort(); }}
            disabled={loading}
            className="px-3 py-2 text-sm font-mono rounded-lg transition-all disabled:opacity-40"
            style={{ border: "1px solid #2a0050", color: "#6b5e7e" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#e2d9f3"; (e.currentTarget as HTMLElement).style.borderColor = "#bf5af2"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#6b5e7e"; (e.currentTarget as HTMLElement).style.borderColor = "#2a0050"; }}
          >
            {loading ? "Loading…" : "↻"}
          </button>
        </div>
      </div>

      {perfNetworkError && (
        <div className="rounded-xl p-4 text-sm" style={{ background: "#ff2d7811", border: "1px solid #ff2d7833", color: "#ff2d78" }}>
          Could not reach the API. Make sure the Python server is running on port 8000.
        </div>
      )}

      {/* Top-level empty state — shown once loading is done and portfolio is empty */}
      {!loading && !hasHoldings && !perfNetworkError && (
        <div
          className="rounded-2xl flex flex-col items-center justify-center py-20 gap-5 text-center"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid #2a0050" }}
        >
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-xl"
            style={{ background: "rgba(191,90,242,0.08)", border: "1px solid rgba(191,90,242,0.2)" }}
          >
            ↗
          </div>
          <div className="space-y-1.5 max-w-xs">
            <p className="text-base font-semibold text-white">No holdings yet</p>
            <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.35)" }}>
              Add at least one holding on the Overview page to see your charts.
            </p>
          </div>
        </div>
      )}

      {/* ── Summary stat cards ── */}
      {hasPerf && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Portfolio Return", short: "Return",  value: `${sign(portReturn)}${portReturn.toFixed(2)}%`,   accent: portReturn  >= 0 ? "#00f5d4" : "#ff2d78" },
            { label: `${benchmarkLabel} Return`, short: benchmarkLabel, value: `${sign(benchReturn)}${benchReturn.toFixed(2)}%`, accent: benchReturn >= 0 ? "#00f5d4" : "#ff2d78" },
            { label: "Alpha vs Market",  short: "Alpha",   value: `${sign(alpha)}${alpha.toFixed(2)}%`,             accent: alpha >= 0 ? "#00f5d4" : "#ff2d78" },
            { label: "Max Drawdown",     short: "Max DD",  value: `${maxDD.toFixed(2)}%`,                           accent: maxDD > -10 ? "#00f5d4" : maxDD > -25 ? "#bf5af2" : "#ff2d78" },
          ].map(({ label, short, value, accent }) => (
            <div
              key={label}
              className="synth-card rounded-xl px-3 py-3 flex flex-col gap-1 overflow-hidden"
              style={{ borderColor: `${accent}33` }}
            >
              <span className="text-xs font-mono uppercase tracking-wide leading-tight" style={{ color: accent }}>
                <span className="sm:hidden">{short}</span>
                <span className="hidden sm:inline">{label}</span>
              </span>
              <span className="text-base sm:text-xl font-bold font-mono truncate" style={{ color: accent }}>{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── 1. Performance vs Benchmark ── */}
      <div>
        <SectionHeader title={`Performance vs ${benchmarkLabel}`} sub="Indexed to 100 — shows relative growth over the period" />
        {loading ? (
          <div className="synth-card rounded-xl h-72 animate-pulse" style={{ borderColor: "#2a0050" }} />
        ) : hasPerf ? (
          <div className="synth-card rounded-xl p-5" style={{ borderColor: "#2a0050" }}>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={perfChartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a0030" />
                <XAxis dataKey="date" tick={{ fill: "#6b5e7e", fontSize: 10, fontFamily: "monospace" }}
                  axisLine={{ stroke: "#2a0050" }} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: "#6b5e7e", fontSize: 10, fontFamily: "monospace" }}
                  axisLine={{ stroke: "#2a0050" }} tickLine={false}
                  tickFormatter={(v: number) => v.toFixed(0)} width={42} />
                <Tooltip content={<ChartTooltip />} />
                <Legend formatter={v => <span style={{ color: "#e2d9f3", fontFamily: "monospace", fontSize: 11 }}>{v === "Benchmark" ? benchmarkLabel : v}</span>} />
                <Line type="monotone" dataKey="Portfolio" stroke="#bf5af2" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
                <Line type="monotone" dataKey="Benchmark" stroke="#00f5d4" strokeWidth={2} dot={false} strokeDasharray="5 3" activeDot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : perfNetworkError ? (
          <EmptyState icon="↗" message="Could not reach API" sub="Make sure the Python server is running on port 8000." />
        ) : perfFailed ? (
          <EmptyState icon="↗" message="Could not compute performance" sub="Historical price data unavailable for this period. Try a different timeframe." />
        ) : (
          <EmptyState icon="↗" message="No performance data" sub="Add at least one holding to see this chart." />
        )}
      </div>

      {/* ── 2. Drawdown ── */}
      <div>
        <SectionHeader title="Drawdown from Peak" sub="How far your portfolio has fallen from its all-time high at each point" />
        {loading ? (
          <div className="synth-card rounded-xl h-48 animate-pulse" style={{ borderColor: "#2a0050" }} />
        ) : hasPerf ? (
          <div className="synth-card rounded-xl p-5" style={{ borderColor: "#2a0050" }}>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={drawdownData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#ff2d78" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ff2d78" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a0030" />
                <XAxis dataKey="date" tick={{ fill: "#6b5e7e", fontSize: 10, fontFamily: "monospace" }}
                  axisLine={{ stroke: "#2a0050" }} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: "#6b5e7e", fontSize: 10, fontFamily: "monospace" }}
                  axisLine={{ stroke: "#2a0050" }} tickLine={false}
                  tickFormatter={(v: number) => `${v.toFixed(0)}%`} width={48} />
                <Tooltip content={<ChartTooltip formatter={v => `${v.toFixed(2)}%`} />} />
                <Area type="monotone" dataKey="Drawdown" stroke="#ff2d78" strokeWidth={1.5}
                  fill="url(#ddGrad)" activeDot={{ r: 3, fill: "#ff2d78" }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : perfNetworkError ? (
          <EmptyState icon="↘" message="Could not reach API" sub="Make sure the Python server is running on port 8000." />
        ) : perfFailed ? (
          <EmptyState icon="↘" message="Could not compute drawdown" sub="Same data source as performance — try a different timeframe." />
        ) : (
          <EmptyState icon="↘" message="No drawdown data" sub="Add holdings to see this chart." />
        )}
      </div>

      {/* ── 3 + 4. P&L + Allocation (side by side on desktop) ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* P&L by holding */}
        <div>
          <SectionHeader title="P&L by Holding" sub={`Profit or loss per position in ${currency}`} />
          {loading ? (
            <div className="synth-card rounded-xl h-64 animate-pulse" style={{ borderColor: "#2a0050" }} />
          ) : hasPnl ? (
            <div className="synth-card rounded-xl p-5" style={{ borderColor: "#2a0050" }}>
              <ResponsiveContainer width="100%" height={Math.max(200, pnlData.length * 44)}>
                <BarChart
                  data={pnlData}
                  layout="vertical"
                  margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a0030" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: "#6b5e7e", fontSize: 10, fontFamily: "monospace" }}
                    axisLine={{ stroke: "#2a0050" }}
                    tickLine={false}
                    tickFormatter={(v: number) => {
                      const abs = Math.abs(v);
                      const str = abs >= 1000 ? `${symbol}${(abs / 1000).toFixed(1)}k` : `${symbol}${abs.toFixed(0)}`;
                      return v < 0 ? `-${str}` : str;
                    }}
                  />
                  <YAxis
                    type="category"
                    dataKey="ticker"
                    width={52}
                    tick={{ fill: "#bf5af2", fontSize: 11, fontFamily: "monospace", fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    content={<ChartTooltip formatter={(v, name) => name === "pnl" ? `${v >= 0 ? "+" : ""}${symbol}${Math.abs(v).toFixed(2)}` : String(v)} />}
                  />
                  <ReferenceLine x={0} stroke="#2a0050" strokeWidth={1.5} />
                  <Bar dataKey="pnl" radius={[0, 4, 4, 0]} maxBarSize={28}>
                    {pnlData.map((entry, i) => (
                      <Cell key={i} fill={entry.pnl >= 0 ? "#00f5d4" : "#ff2d78"}
                        fillOpacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState icon="▦" message="No P&L data" sub="Add holdings with prices to see this chart." />
          )}
        </div>

        {/* Allocation donut */}
        <div>
          <SectionHeader title="Portfolio Allocation" sub="Current market value weight by holding" />
          {loading ? (
            <div className="synth-card rounded-xl h-64 animate-pulse" style={{ borderColor: "#2a0050" }} />
          ) : hasAlloc ? (
            <div className="synth-card rounded-xl p-5" style={{ borderColor: "#2a0050" }}>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    activeIndex={activeSlice}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  activeShape={(props: any) => <ActiveShape {...props} symbol={symbol} fxRate={fxRate} />}
                    data={allocationData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={72}
                    outerRadius={108}
                    onMouseEnter={(_, index) => setActiveSlice(index)}
                  >
                    {allocationData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              {/* Legend */}
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2 justify-center">
                {allocationData.map((entry, i) => (
                  <button
                    key={i}
                    className="flex items-center gap-1.5 text-xs font-mono"
                    style={{ color: activeSlice === i ? entry.fill : "#6b5e7e" }}
                    onMouseEnter={() => setActiveSlice(i)}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: entry.fill }} />
                    {entry.name}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState icon="⬡" message="No allocation data" sub="Add holdings with live prices to see this chart." />
          )}
        </div>

      </div>
    </div>
  );
}

function EmptyState({ icon, message, sub }: { icon: string; message: string; sub: string }) {
  return (
    <div
      className="synth-card rounded-xl p-10 flex flex-col items-center gap-3 text-center"
      style={{ borderColor: "#2a0050", borderStyle: "dashed" }}
    >
      <div className="text-3xl" style={{ color: "#2a0050" }}>{icon}</div>
      <div>
        <p className="text-text text-sm font-medium mb-0.5">{message}</p>
        <p className="text-muted text-xs">{sub}</p>
      </div>
    </div>
  );
}
