import type {
  Holding,
  CorrelationData,
  PerformanceData,
  RefreshData,
  RollingCorrelationData,
  SuggestionsData,
} from "@/lib/api";

type Timeframe = "1M" | "3M" | "6M" | "1Y" | "5Y";
type Benchmark = "sp500" | "ftse100" | "msci_world";
type CorrMethod = "pearson" | "spearman";
type DemoAssetClass = "equity_etf" | "bond_etf" | "commodity_etf" | "stock" | "crypto";

const BENCHMARK_DRIFT: Record<Benchmark, number> = {
  sp500: 0.065,
  ftse100: 0.044,
  msci_world: 0.058,
};

const TIMEFRAME_LENGTH: Record<Timeframe, number> = {
  "1M": 22,
  "3M": 66,
  "6M": 132,
  "1Y": 252,
  "5Y": 252 * 5,
};

const DEMO_SUGGESTION_CANDIDATES: Array<{
  ticker: string;
  name: string;
  asset_class: string;
  kind: DemoAssetClass;
}> = [
  {
    ticker: "IGIL.L",
    name: "iShares Global Inflation Linked Govt Bond UCITS ETF",
    asset_class: "Bond ETF",
    kind: "bond_etf",
  },
  {
    ticker: "GLDM",
    name: "SPDR Gold MiniShares Trust",
    asset_class: "Commodity ETF",
    kind: "commodity_etf",
  },
  {
    ticker: "VNQ",
    name: "Vanguard Real Estate ETF",
    asset_class: "REIT ETF",
    kind: "equity_etf",
  },
  {
    ticker: "TLT",
    name: "iShares 20+ Year Treasury Bond ETF",
    asset_class: "Bond ETF",
    kind: "bond_etf",
  },
];

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function generateDates(length: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = length - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    out.push(toIsoDate(d));
  }
  return out;
}

function buildSeries(length: number, yearlyDrift: number, amplitude: number, phase: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < length; i++) {
    const t = i / Math.max(1, length - 1);
    const trend = yearlyDrift * t;
    const wave = Math.sin((i + phase) / 10) * amplitude + Math.cos((i + phase) / 27) * (amplitude * 0.6);
    out.push(100 * (1 + trend + wave));
  }
  return out.map((v) => Number(v.toFixed(2)));
}

function tickerHash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 100000;
  return h;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function inferAssetClass(holding: Pick<Holding, "ticker" | "type">): DemoAssetClass {
  if (holding.type === "crypto") return "crypto";
  if (holding.type === "stock") return "stock";
  const t = holding.ticker.toUpperCase();
  if (/(BOND|GILT|TREAS|AGG|LQD|IGIL|TLT|BND)/.test(t)) return "bond_etf";
  if (/(GOLD|GLD|IAU|SGLN|SLV|DBC|COM)/.test(t)) return "commodity_etf";
  return "equity_etf";
}

function baseCorrelation(a: DemoAssetClass, b: DemoAssetClass): number {
  const key = [a, b].sort().join("|");
  switch (key) {
    case "bond_etf|bond_etf": return 0.55;
    case "bond_etf|commodity_etf": return 0.12;
    case "bond_etf|crypto": return 0.05;
    case "bond_etf|equity_etf": return 0.2;
    case "bond_etf|stock": return 0.18;
    case "commodity_etf|commodity_etf": return 0.6;
    case "commodity_etf|crypto": return 0.1;
    case "commodity_etf|equity_etf": return 0.18;
    case "commodity_etf|stock": return 0.2;
    case "crypto|crypto": return 0.62;
    case "crypto|equity_etf": return 0.24;
    case "crypto|stock": return 0.26;
    case "equity_etf|equity_etf": return 0.78;
    case "equity_etf|stock": return 0.72;
    case "stock|stock": return 0.66;
    default: return 0.35;
  }
}

function pairCorrelation(tickerA: string, classA: DemoAssetClass, tickerB: string, classB: DemoAssetClass, method: CorrMethod): number {
  const base = baseCorrelation(classA, classB);
  const jitter = ((tickerHash(`${tickerA}|${tickerB}`) % 17) - 8) / 100; // [-0.08, 0.08]
  const spearmanScale = method === "spearman" ? 0.95 : 1;
  return Number(clamp((base + jitter) * spearmanScale, -0.15, 0.95).toFixed(3));
}

function normalisedWeight(holding: Holding, totalValue: number, count: number): number {
  if (totalValue > 0 && holding.market_value != null) return holding.market_value / totalValue;
  if (holding.weight != null && Number.isFinite(holding.weight) && holding.weight > 0) return holding.weight;
  return 1 / Math.max(1, count);
}

function averageUniqueCorrelation(data: CorrelationData): number {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < data.tickers.length; i++) {
    for (let j = i + 1; j < data.tickers.length; j++) {
      const row = data.matrix.find((m) => m.row === data.tickers[i] && m.col === data.tickers[j]);
      if (!row) continue;
      sum += row.value;
      count += 1;
    }
  }
  return count > 0 ? sum / count : 0;
}

function avgCorrVsCandidate(holdings: Holding[], candidateKind: DemoAssetClass): number {
  if (holdings.length === 0) return 0;
  const total = holdings.reduce((s, h) => s + (h.market_value ?? 0), 0);
  let weighted = 0;
  let wsum = 0;
  for (const h of holdings) {
    const cls = inferAssetClass(h);
    const w = normalisedWeight(h, total, holdings.length);
    const corr = baseCorrelation(cls, candidateKind);
    weighted += w * corr;
    wsum += w;
  }
  return wsum > 0 ? weighted / wsum : 0;
}

function buildSuggestions(holdings: Holding[], currentAvg: number): SuggestionsData {
  const suggestions = DEMO_SUGGESTION_CANDIDATES.map((c) => {
    const candidateCorr = avgCorrVsCandidate(holdings, c.kind);
    const estimatedNewAvg = holdings.length > 0
      ? ((currentAvg * holdings.length) + candidateCorr) / (holdings.length + 1)
      : candidateCorr;
    const reduction = Math.max(0, currentAvg - estimatedNewAvg);
    return {
      ticker: c.ticker,
      name: c.name,
      asset_class: c.asset_class,
      avg_corr_vs_portfolio: Number(candidateCorr.toFixed(2)),
      estimated_new_avg: Number(estimatedNewAvg.toFixed(2)),
      correlation_reduction: Number(reduction.toFixed(2)),
    };
  })
    .sort((a, b) => b.correlation_reduction - a.correlation_reduction)
    .slice(0, 3);

  return {
    current_avg_correlation: Number(currentAvg.toFixed(2)),
    suggestions,
  };
}

function buildRollingData(data: CorrelationData, timeframe: Timeframe): RollingCorrelationData {
  const pairs = data.matrix
    .filter((m) => m.row !== m.col)
    .filter((m) => data.tickers.indexOf(m.row) < data.tickers.indexOf(m.col))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 2);

  const length = Math.min(120, TIMEFRAME_LENGTH[timeframe]);
  const dates = generateDates(length);
  const rollingPairs = pairs.map((p, idx) => {
    const amp = 0.05 + idx * 0.01;
    const phase = (tickerHash(`${p.row}/${p.col}`) % 9) + idx;
    const values = Array.from({ length }, (_, i) => {
      const wave = Math.sin((i + phase) / 8) * amp + Math.cos((i + phase) / 17) * (amp * 0.45);
      return Number(clamp(p.value + wave, -0.95, 0.95).toFixed(3));
    });
    return {
      pair: `${p.row} / ${p.col}`,
      ticker_a: p.row,
      ticker_b: p.col,
      static_correlation: p.value,
      dates,
      values,
    };
  });

  return { window: 60, pairs: rollingPairs };
}

export function buildDemoCorrelationBundle(
  holdings: Holding[],
  timeframe: Timeframe,
  method: CorrMethod,
): {
  correlation: CorrelationData;
  suggestions: SuggestionsData;
  rolling: RollingCorrelationData;
} {
  const sorted = [...holdings].sort((a, b) => (b.market_value ?? 0) - (a.market_value ?? 0));
  const tickers = sorted.map((h) => h.ticker);
  const overlap = TIMEFRAME_LENGTH[timeframe];
  const totalValue = sorted.reduce((s, h) => s + (h.market_value ?? 0), 0);

  const weights: Record<string, number> = {};
  for (const h of sorted) {
    weights[h.ticker] = Number(normalisedWeight(h, totalValue, sorted.length).toFixed(6));
  }

  const matrix: CorrelationData["matrix"] = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = 0; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      matrix.push({
        row: a.ticker,
        col: b.ticker,
        value: i === j ? 1 : pairCorrelation(a.ticker, inferAssetClass(a), b.ticker, inferAssetClass(b), method),
        overlap,
      });
    }
  }

  const correlation: CorrelationData = { tickers, method, weights, matrix };
  const currentAvg = averageUniqueCorrelation(correlation);
  return {
    correlation,
    suggestions: buildSuggestions(sorted, currentAvg),
    rolling: buildRollingData(correlation, timeframe),
  };
}

export const DEMO_REFRESH_DATA: RefreshData = {
  holdings: [
    {
      ticker: "VWRP.L",
      type: "etf",
      net_shares: 45,
      avg_cost: 101.2,
      current_price: 118.6,
      market_value: 5337,
      cost_basis: 4554,
      pnl: 783,
      pnl_pct: 17.19,
      total_dividends: 0,
      weight: 0.44,
      transaction_count: 3,
    },
    {
      ticker: "QQQ",
      type: "etf",
      net_shares: 9,
      avg_cost: 341.8,
      current_price: 395.4,
      market_value: 3558.6,
      cost_basis: 3076.2,
      pnl: 482.4,
      pnl_pct: 15.68,
      total_dividends: 0,
      weight: 0.3,
      transaction_count: 2,
    },
    {
      ticker: "BTC-USD",
      type: "crypto",
      net_shares: 0.035,
      avg_cost: 47200,
      current_price: 51900,
      market_value: 1816.5,
      cost_basis: 1652,
      pnl: 164.5,
      pnl_pct: 9.96,
      total_dividends: 0,
      weight: 0.15,
      transaction_count: 1,
    },
    {
      ticker: "AAPL",
      type: "stock",
      net_shares: 6,
      avg_cost: 149.3,
      current_price: 177.8,
      market_value: 1066.8,
      cost_basis: 895.8,
      pnl: 171,
      pnl_pct: 19.09,
      total_dividends: 0,
      weight: 0.11,
      transaction_count: 2,
    },
  ],
  summary: {
    total_value: 11778.9,
    total_cost: 10178,
    total_pnl: 1600.9,
    total_pnl_pct: 15.73,
    total_dividends: 0,
    holding_count: 4,
    gbpusd: 1.27,
    gbpeur: 1.17,
  },
  metrics: {
    sharpe_ratio: 1.08,
    sortino_ratio: 1.42,
    actual_return: 0.1573,
    volatility: 0.181,
    beta: 0.93,
    capm_expected_return: 0.109,
    alpha: 0.0483,
    var_95: -0.021,
    var_95_cf: -0.026,
    max_drawdown: -0.124,
    drawdown_recovery_days: 37,
    rf_annual: 0.043,
    benchmark_used: "sp500",
    risk_model: "current_holdings_cost_weighted",
    sample_days: 252,
    benchmark_overlap_days: 252,
    window_years_equivalent: 1,
  },
  refreshed_at: Math.floor(Date.now() / 1000),
};

export function getDemoPerformance(
  timeframe: Timeframe = "1Y",
  benchmark: Benchmark = "sp500",
): PerformanceData {
  const length = TIMEFRAME_LENGTH[timeframe];
  const dates = generateDates(length);
  const portfolio = buildSeries(length, 0.16, 0.015, 1);
  const bench = buildSeries(length, BENCHMARK_DRIFT[benchmark], 0.012, 4);
  return {
    dates,
    portfolio,
    benchmark: bench,
    benchmark_used: benchmark,
    benchmark_name:
      benchmark === "ftse100" ? "FTSE 100" :
      benchmark === "msci_world" ? "MSCI World" :
      "S&P 500",
  };
}

export const DEMO_CORRELATION_DATA: CorrelationData = {
  tickers: ["VWRP.L", "QQQ", "AAPL", "BTC-USD"],
  method: "pearson",
  weights: {
    "VWRP.L": 0.44,
    QQQ: 0.3,
    AAPL: 0.11,
    "BTC-USD": 0.15,
  },
  matrix: [
    { row: "VWRP.L", col: "VWRP.L", value: 1, overlap: 252 },
    { row: "VWRP.L", col: "QQQ", value: 0.78, overlap: 252 },
    { row: "VWRP.L", col: "AAPL", value: 0.69, overlap: 252 },
    { row: "VWRP.L", col: "BTC-USD", value: 0.24, overlap: 252 },
    { row: "QQQ", col: "VWRP.L", value: 0.78, overlap: 252 },
    { row: "QQQ", col: "QQQ", value: 1, overlap: 252 },
    { row: "QQQ", col: "AAPL", value: 0.74, overlap: 252 },
    { row: "QQQ", col: "BTC-USD", value: 0.29, overlap: 252 },
    { row: "AAPL", col: "VWRP.L", value: 0.69, overlap: 252 },
    { row: "AAPL", col: "QQQ", value: 0.74, overlap: 252 },
    { row: "AAPL", col: "AAPL", value: 1, overlap: 252 },
    { row: "AAPL", col: "BTC-USD", value: 0.21, overlap: 252 },
    { row: "BTC-USD", col: "VWRP.L", value: 0.24, overlap: 252 },
    { row: "BTC-USD", col: "QQQ", value: 0.29, overlap: 252 },
    { row: "BTC-USD", col: "AAPL", value: 0.21, overlap: 252 },
    { row: "BTC-USD", col: "BTC-USD", value: 1, overlap: 252 },
  ],
};

export const DEMO_SUGGESTIONS_DATA: SuggestionsData = {
  current_avg_correlation: 0.54,
  suggestions: [
    {
      ticker: "IGIL.L",
      name: "iShares Global Inflation Linked Govt Bond UCITS ETF",
      asset_class: "Bond ETF",
      avg_corr_vs_portfolio: 0.14,
      estimated_new_avg: 0.49,
      correlation_reduction: 0.05,
    },
    {
      ticker: "INRG.L",
      name: "iShares Global Clean Energy UCITS ETF",
      asset_class: "Thematic ETF",
      avg_corr_vs_portfolio: 0.27,
      estimated_new_avg: 0.51,
      correlation_reduction: 0.03,
    },
  ],
};

export const DEMO_ROLLING_CORRELATION_DATA: RollingCorrelationData = {
  window: 60,
  pairs: [
    {
      pair: "VWRP.L / QQQ",
      ticker_a: "VWRP.L",
      ticker_b: "QQQ",
      static_correlation: 0.78,
      dates: generateDates(120),
      values: Array.from({ length: 120 }, (_, i) => Number((0.72 + Math.sin(i / 9) * 0.07).toFixed(3))),
    },
    {
      pair: "QQQ / BTC-USD",
      ticker_a: "QQQ",
      ticker_b: "BTC-USD",
      static_correlation: 0.29,
      dates: generateDates(120),
      values: Array.from({ length: 120 }, (_, i) => Number((0.25 + Math.cos(i / 10) * 0.08).toFixed(3))),
    },
  ],
};

export const DEMO_AI_REPORT = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TL;DR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Portfolio is growth-oriented with healthy return potential and moderate concentration risk.
- Correlation profile is acceptable, but overlap between broad equity exposures can be tightened.
- Add one diversifying sleeve (bonds or defensive ETF) to stabilise drawdowns.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PORTFOLIO SCORE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Overall score: 78 / 100.
Risk posture appears suitable for a balanced-to-growth investor.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. PORTFOLIO SNAPSHOT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total value is £11,778.90 across four positions.
Current allocation is concentrated in global equity beta and US growth.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2. SHARPE RATIO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Sharpe ratio is 1.08 using a 1-year window.
This indicates efficient return generation for the realised volatility taken.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3. RISK METRICS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Volatility: 18.10%
Max drawdown: -12.40%
VaR(95%): -2.10%
These are coherent with a medium-high risk growth allocation.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4. PERFORMANCE VS BENCHMARK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Portfolio return exceeds benchmark expectation with positive alpha.
Beta below 1.0 suggests slightly lower market sensitivity than a pure index proxy.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
5. HIDDEN EXPOSURES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Broad equity sleeves may overlap in US mega-cap exposure.
Diversification can improve by adding a lower-correlation asset bucket.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
6. OBSERVATIONS WORTH CONSIDERING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Maintain growth core but cap single-theme concentration.
- Add one stabiliser allocation and rebalance quarterly.
- Keep position sizing discipline in higher-volatility sleeves.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
7. OVERALL ASSESSMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The portfolio is investable and directionally strong.
Primary improvement area is drawdown resilience, not return potential.
`;
