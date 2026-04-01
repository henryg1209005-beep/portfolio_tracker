import type {
  CorrelationData,
  PerformanceData,
  RefreshData,
  RollingCorrelationData,
  SuggestionsData,
} from "@/lib/api";

type Timeframe = "1M" | "3M" | "6M" | "1Y" | "5Y";
type Benchmark = "sp500" | "ftse100" | "msci_world";

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
