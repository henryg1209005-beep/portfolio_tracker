/**
 * Portfolio Risk Engine
 *
 * Deterministic, variance-based portfolio analysis.
 * Methodology: HHI concentration, MCTR-based vol projection,
 * Calmar ratio, multi-factor score decomposition.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type RiskProfile = "conservative" | "balanced" | "growth";
export type Priority    = "high" | "medium" | "low";

export type Recommendation = {
  action: "reduce" | "increase" | "add" | "trim";
  priority: Priority;
  ticker?: string;
  assetClass?: string;
  currentWeight: number;   // percentage points 0–100
  targetWeight: number;
  changePct: number;       // signed delta e.g. -16 or +10
  amountGBP: number;
  reason: string;
  expectedImpact: string;
  pnlPct?: number | null;  // holding's unrealised P&L %, used for CGT warning
};

export type ProjectedMetrics = {
  volatility: number;
  sharpe: number;
  concentrationLevel: "Low" | "Moderate" | "High" | "Very High";
  maxSingleWeight: number;
  hhi: number;
  effectiveN: number;
};

export type ScoreBreakdown = {
  concentration: number;    // max 30 — HHI efficiency
  riskAdjReturn: number;    // max 25 — Sharpe ratio quality
  drawdown: number;         // max 20 — drawdown severity
  diversification: number;  // max 15 — geographic + asset class
  alignment: number;        // max 10 — profile vol/exposure fit
};

export type PortfolioFixPlan = {
  score: number;
  scoreLabel: string;
  scoreBreakdown: ScoreBreakdown;
  hhi: number;
  effectiveN: number;
  calmarRatio: number | null;
  primaryIssues: string[];
  recommendations: Recommendation[];
  projectedMetrics: ProjectedMetrics;
  topPriorityAction: string;
  summary: string;
  expectedBenefits: string[];
};

export type HoldingInput = {
  ticker: string;
  type: string;
  weight: number | null;      // 0–1 fraction
  market_value: number | null;
  pnl_pct: number | null;
};

export type MetricsInput = {
  sharpe_ratio: number | null;
  volatility: number | null;
  beta: number | null;
  max_drawdown: number | null;
  var_95: number | null;
  alpha: number | null;
  actual_return: number | null;
};

// ── Ticker classification sets ─────────────────────────────────────────────────

const HIGH_VOL_STOCKS = new Set([
  "NVDA","PLTR","TSLA","AMD","COIN","HOOD","RIVN","LCID","SNOW","SHOP","SQ","ROKU","ZM","SOFI",
]);

const US_STOCKS = new Set([
  "NVDA","MSFT","AAPL","GOOGL","GOOG","META","AMZN","TSLA","PLTR","AMD",
  "INTC","CRM","NFLX","UBER","PYPL","JPM","BAC","WFC","GS","V","MA",
  "JNJ","PFE","UNH","ABBV","XOM","CVX","DIS","BABA","COIN","HOOD",
  "SNOW","SHOP","SQ","ROKU","ZM","RIVN","LCID","SOFI",
]);

const US_ETFS = new Set([
  "VUSA","VOO","SPY","QQQ","IVV","VTI","SCHB","VUG","VTV","CSPX","VUAG",
]);

const GLOBAL_ETFS = new Set([
  "VWRL","SWLD","HMWO","VEVE","IWRD","ACWI","VT","VHVG",
]);

const EM_ETFS = new Set([
  "VFEM","EEM","VWO","EIMI",
]);

const UK_STOCKS = new Set([
  "SHEL","BP","HSBA","GSK","AZN","LLOY","BARC","RIO","ULVR","DGE","REL","NG",
]);

const UK_ETFS = new Set([
  "HUKX","ISF",
]);

const BOND_ETFS = new Set([
  "IGLT","VGOV","IGLS","SLXX","CORP","AGG","BND","TLT","IEF","LQD","VGSH",
]);

const CRYPTO = new Set([
  "BTC-USD","ETH-USD","BNB-USD","SOL-USD","ADA-USD","XRP-USD","DOGE-USD",
]);

// ── Profile thresholds ─────────────────────────────────────────────────────────

const THRESHOLDS = {
  conservative: {
    singleStockMax:   0.12,
    top2Max:          0.25,
    top3Max:          0.40,
    usMax:            0.60,
    cryptoMax:        0.03,
    volatilityHigh:   0.18,
    maxHHI:           0.18,   // Effective-N ≥ 5.6
    requireDefensive: true,
  },
  balanced: {
    singleStockMax:   0.20,
    top2Max:          0.40,
    top3Max:          0.60,
    usMax:            0.70,
    cryptoMax:        0.08,
    volatilityHigh:   0.28,
    maxHHI:           0.28,   // Effective-N ≥ 3.6
    requireDefensive: false,
  },
  growth: {
    singleStockMax:   0.28,
    top2Max:          0.52,
    top3Max:          0.72,
    usMax:            0.82,
    cryptoMax:        0.15,
    volatilityHigh:   0.40,
    maxHHI:           0.40,   // Effective-N ≥ 2.5
    requireDefensive: false,
  },
} as const;

// ── Asset parameters ──────────────────────────────────────────────────────────
//
// σᵢ  — annualised asset volatility (realised estimates from long-run data)
// ρᵢₚ — correlation of asset with a broad equity portfolio
//
// These are used to compute:
//   MCTR_i = ρᵢₚ × σᵢ  (marginal contribution to risk per unit of weight)
//   RC_i   = wᵢ × MCTRᵢ (risk contribution)
//   σₚ     ≈ Σᵢ wᵢ × MCTRᵢ  (first-order portfolio vol estimate)

type AssetParams = { sigma: number; rho: number };

function getAssetParams(ticker: string, assetClass?: string): AssetParams {
  const t = ticker.replace(".L", "").toUpperCase();
  if (CRYPTO.has(ticker) || assetClass === "crypto")    return { sigma: 0.80, rho: 0.15 };
  if (BOND_ETFS.has(t))                                  return { sigma: 0.06, rho: -0.15 };
  if (EM_ETFS.has(t))                                    return { sigma: 0.19, rho: 0.55 };
  if (UK_ETFS.has(t))                                    return { sigma: 0.13, rho: 0.62 };
  if (GLOBAL_ETFS.has(t))                                return { sigma: 0.16, rho: 0.93 };
  if (US_ETFS.has(t))                                    return { sigma: 0.15, rho: 0.97 };
  if (HIGH_VOL_STOCKS.has(t))                            return { sigma: 0.50, rho: 0.65 };
  if (US_STOCKS.has(t))                                  return { sigma: 0.28, rho: 0.70 };
  if (UK_STOCKS.has(t))                                  return { sigma: 0.22, rho: 0.60 };
  return { sigma: 0.30, rho: 0.65 };                     // default: generic equity
}

/** Returns tickers that fell back to generic equity parameters (not in any known set). */
export function getUnclassifiedTickers(holdings: HoldingInput[]): string[] {
  return holdings
    .filter(h => {
      const t = h.ticker.replace(".L", "").toUpperCase();
      return (
        !CRYPTO.has(h.ticker) &&
        h.type !== "crypto" &&
        !BOND_ETFS.has(t) &&
        !EM_ETFS.has(t) &&
        !UK_ETFS.has(t) &&
        !GLOBAL_ETFS.has(t) &&
        !US_ETFS.has(t) &&
        !HIGH_VOL_STOCKS.has(t) &&
        !US_STOCKS.has(t) &&
        !UK_STOCKS.has(t)
      );
    })
    .map(h => h.ticker);
}

// ── Concentration metrics ──────────────────────────────────────────────────────

/** Herfindahl-Hirschman Index: Σwᵢ² (0–1). Higher = more concentrated. */
function computeHHI(holdings: HoldingInput[]): number {
  return holdings.reduce((s, h) => s + wt(h) ** 2, 0);
}

/** Effective number of positions: 1 / HHI. Equal-weight portfolio of N gives N. */
function effectiveN(hhi: number): number {
  return hhi > 0 ? 1 / hhi : 0;
}

/** HHI-based concentration label.
 *  Thresholds adapted from DOJ market concentration guidelines for portfolio use. */
export function hhiLabel(hhi: number): "Low" | "Moderate" | "High" | "Very High" {
  if (hhi < 0.10) return "Low";        // Eff-N > 10
  if (hhi < 0.18) return "Moderate";   // Eff-N 5.6–10
  if (hhi < 0.30) return "High";       // Eff-N 3.3–5.6
  return "Very High";                    // Eff-N < 3.3
}

/** Legacy weight-based label used for BeforeAfter display. */
export function concentrationLabel(maxW: number): "Low" | "Moderate" | "High" | "Very High" {
  if (maxW <= 15) return "Low";
  if (maxW <= 25) return "Moderate";
  if (maxW <= 35) return "High";
  return "Very High";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const wt = (h: HoldingInput): number => h.weight ?? 0;

function gbp(totalValue: number, pp: number): number {
  return Math.round(Math.abs(pp) / 100 * totalValue);
}

function assignPriority(
  action: Recommendation["action"],
  changePct: number,
  currentWeight: number,
  isFirstIntlAdd = false,
): Priority {
  const mag = Math.abs(changePct);
  if (action === "reduce" || action === "trim") {
    if (currentWeight >= 25 || mag >= 15) return "high";
    if (currentWeight >= 15 || mag >= 7)  return "medium";
    return "low";
  }
  if (action === "add") {
    if (isFirstIntlAdd && mag >= 8) return "high";
    if (mag >= 10) return "medium";
    return "low";
  }
  if (mag >= 8) return "medium";
  return "low";
}

function estimateUSExposure(holdings: HoldingInput[]): number {
  let us = 0;
  for (const h of holdings) {
    const t = h.ticker.replace(".L", "");
    if (US_STOCKS.has(t) || US_ETFS.has(t))  us += wt(h);
    else if (GLOBAL_ETFS.has(t))              us += wt(h) * 0.62; // MSCI ACWI ~62% US
  }
  return us;
}

function hasInternational(holdings: HoldingInput[]): boolean {
  return holdings.some(h => {
    const t = h.ticker.replace(".L", "");
    return GLOBAL_ETFS.has(t) || EM_ETFS.has(t) || UK_STOCKS.has(t) || UK_ETFS.has(t) || h.ticker.endsWith(".L");
  });
}

function hasEM(holdings: HoldingInput[]): boolean {
  return holdings.some(h => EM_ETFS.has(h.ticker.replace(".L", "")));
}

function hasBonds(holdings: HoldingInput[]): boolean {
  return holdings.some(h => BOND_ETFS.has(h.ticker.replace(".L", "")));
}

function cryptoWt(holdings: HoldingInput[]): number {
  return holdings.filter(h => CRYPTO.has(h.ticker) || h.type === "crypto").reduce((s, h) => s + wt(h), 0);
}

function holdingGeographyDescription(ticker: string): string {
  const t = ticker.replace(".L", "");
  if (UK_ETFS.has(t))     return "adds UK equity exposure, reducing US market concentration";
  if (EM_ETFS.has(t))     return "adds emerging markets exposure";
  if (GLOBAL_ETFS.has(t)) return "broadens exposure across developed markets globally";
  return "improves geographic balance";
}

// ── MCTR and risk contribution ────────────────────────────────────────────────

/**
 * MCTRᵢ = ρᵢₚ × σᵢ
 * Marginal contribution to portfolio vol per unit of weight.
 * Portfolio vol ≈ Σᵢ wᵢ × MCTRᵢ  (first-order; exact under constant-corr assumption).
 */
function mctr(ticker: string, type?: string): number {
  const p = getAssetParams(ticker, type);
  return p.rho * p.sigma;
}

/**
 * Risk contribution (RC) of a position as a fraction of portfolio vol.
 * RC_i / σₚ = (wᵢ × MCTRᵢ) / σₚ
 * Returns percentage share of portfolio volatility.
 */
function riskContributionPct(h: HoldingInput, portfolioVol: number): number {
  if (portfolioVol <= 0) return 0;
  return (wt(h) * mctr(h.ticker, h.type)) / portfolioVol * 100;
}

// ── Projection engine ─────────────────────────────────────────────────────────

/**
 * First-order vol projection after applying all recommendations.
 *
 * Δσₚ ≈ Σᵢ Δwᵢ × MCTRᵢ
 *
 * This is exact when MCTRs are constant (valid for small weight shifts).
 * For large shifts the second-order term (Δwᵢ² × σᵢ²) is neglected, which
 * gives a slight underestimate of vol reductions — conservative by design.
 */
function projectVolatility(
  currentVol: number,
  recommendations: Recommendation[],
  holdings: HoldingInput[],
): number {
  let volDelta = 0;
  for (const r of recommendations) {
    const deltaW = (r.targetWeight - r.currentWeight) / 100;
    const h      = holdings.find(h => h.ticker === r.ticker);
    const type   = h?.type ?? (
      (r.assetClass ?? "").toLowerCase().includes("bond")     ? "bond"   :
      (r.assetClass ?? "").toLowerCase().includes("emerging") ? "em"     : "stock"
    );
    volDelta += deltaW * mctr(r.ticker ?? "", type);
  }
  return Math.max(0.04, currentVol + volDelta);
}

/**
 * Sharpe projection under constant-excess-return assumption.
 *
 * If excess return E[rₚ - rf] doesn't change (valid for vol-neutral reallocations),
 * then projSharpe = Sharpe₀ × (σ₀ / σ_new).
 * Provides an exact result for diversification trades; slightly optimistic for
 * trades that also change expected returns.
 */
function projectSharpe(currentSharpe: number, currentVol: number, projVol: number): number {
  if (currentVol <= 0 || projVol <= 0) return currentSharpe;
  return Math.min(2.5, Math.max(-2.0, currentSharpe * (currentVol / projVol)));
}

export function simulatePortfolioAfterChanges(
  holdings: HoldingInput[],
  recommendations: Recommendation[],
  metrics: MetricsInput,
): ProjectedMetrics {
  const currentVol    = metrics.volatility ?? 0.30;
  const currentSharpe = metrics.sharpe_ratio ?? 0;

  const projVol    = projectVolatility(currentVol, recommendations, holdings);
  const projSharpe = projectSharpe(currentSharpe, currentVol, projVol);

  // Simulated weights
  const simWeights: Record<string, number> = {};
  for (const h of holdings) simWeights[h.ticker] = wt(h) * 100;
  for (const r of recommendations) {
    if (r.ticker) simWeights[r.ticker] = r.targetWeight;
  }
  const allWeights = [
    ...Object.values(simWeights).filter(w => w > 0.5),
    ...recommendations.filter(r => r.action === "add" && !r.ticker).map(r => r.targetWeight),
  ];
  const newMaxW = allWeights.length > 0 ? Math.max(...allWeights) : 100;

  // HHI projection: compute from simulated weight fractions
  const totalW = allWeights.reduce((s, w) => s + w, 0) || 100;
  const newHHI = allWeights.reduce((s, w) => s + (w / totalW) ** 2, 0);

  return {
    volatility:         projVol,
    sharpe:             projSharpe,
    concentrationLevel: concentrationLabel(newMaxW),
    maxSingleWeight:    Math.round(newMaxW),
    hhi:                Math.round(newHHI * 1000) / 1000,
    effectiveN:         Math.round(effectiveN(newHHI) * 10) / 10,
  };
}

// ── Score (multi-factor decomposition) ────────────────────────────────────────
//
// Five independently scored factors, each with a defined maximum and methodology.
// Total max = 100.

function computeScore(
  sorted: HoldingInput[],
  metrics: MetricsInput,
  profile: RiskProfile,
  usExposure: number,
  hhi: number,
  effN: number,
  bonds: boolean,
  intl: boolean,
  em: boolean,
  crypto: number,
): { total: number; breakdown: ScoreBreakdown } {
  const t = THRESHOLDS[profile];

  // ── Factor 1: Concentration efficiency (0–30) ────────────────────────────
  // Metric: how close is Effective-N to the maximum possible (= holdingCount)?
  // Efficiency ratio = Eff-N / N. Perfect = 1.0 (equal weight).
  const N = sorted.length;
  const efficiencyRatio = N > 1 ? effN / N : 0;
  let concentrationScore =
    efficiencyRatio >= 0.80 ? 30 :
    efficiencyRatio >= 0.65 ? 24 :
    efficiencyRatio >= 0.50 ? 17 :
    efficiencyRatio >= 0.35 ? 10 :
    efficiencyRatio >= 0.20 ? 4  : 0;

  // Additional penalty if HHI exceeds profile limit
  if (hhi > t.maxHHI * 1.5)      concentrationScore = Math.max(0, concentrationScore - 12);
  else if (hhi > t.maxHHI)        concentrationScore = Math.max(0, concentrationScore - 6);

  // ── Factor 2: Risk-adjusted return (0–25) ───────────────────────────────
  // Metric: Sharpe ratio. Thresholds per CFA Institute benchmarks.
  const sharpe = metrics.sharpe_ratio ?? 0;
  const riskAdjReturn =
    sharpe >= 1.5  ? 25 :
    sharpe >= 1.0  ? 20 :
    sharpe >= 0.6  ? 14 :
    sharpe >= 0.3  ? 8  :
    sharpe >= 0.0  ? 3  : 0;

  // ── Factor 3: Drawdown control (0–20) ───────────────────────────────────
  // Metric: max drawdown severity. > 40% is structurally dangerous.
  const mdd = Math.abs(metrics.max_drawdown ?? 0);
  const drawdown =
    mdd <= 0.10 ? 20 :
    mdd <= 0.20 ? 15 :
    mdd <= 0.30 ? 9  :
    mdd <= 0.40 ? 4  : 0;

  // ── Factor 4: Diversification (0–15) ────────────────────────────────────
  // Geographic (0–8) + asset class breadth (0–7)
  let divScore = 0;
  if (intl && em) divScore += 8;
  else if (intl)  divScore += 4;
  if (usExposure <= t.usMax) divScore += Math.round((1 - usExposure / (t.usMax + 0.001)) * 3);
  if (bonds)      divScore += 4;
  const types = new Set(sorted.map(h => h.type));
  if (types.size >= 3) divScore += 3;
  else if (types.size === 2) divScore += 1;
  const diversification = Math.min(15, divScore);

  // ── Factor 5: Profile alignment (0–10) ──────────────────────────────────
  // How well does actual vol, crypto exposure, and US exposure fit the profile?
  const vol = metrics.volatility ?? 0;
  let alignment = 10;
  if (vol > t.volatilityHigh * 1.5)      alignment -= 10;
  else if (vol > t.volatilityHigh * 1.2) alignment -= 7;
  else if (vol > t.volatilityHigh)       alignment -= 4;
  if (usExposure > t.usMax + 0.10)       alignment -= 3;
  else if (usExposure > t.usMax)         alignment -= 1;
  if (crypto > t.cryptoMax * 1.5)        alignment -= 3;
  else if (crypto > t.cryptoMax)         alignment -= 1;
  alignment = Math.max(0, alignment);

  const total = concentrationScore + riskAdjReturn + drawdown + diversification + alignment;

  return {
    total: Math.max(0, Math.min(100, total)),
    breakdown: { concentration: concentrationScore, riskAdjReturn, drawdown, diversification, alignment },
  };
}

function scoreLabel(s: number): string {
  if (s >= 75) return "Strong";
  if (s >= 55) return "Moderate";
  if (s >= 35) return "Needs Attention";
  return "At Risk";
}

// ── Main engine ────────────────────────────────────────────────────────────────

export function generatePortfolioFixPlan(
  holdings: HoldingInput[],
  metrics: MetricsInput,
  profile: RiskProfile,
  totalPortfolioValue = 0,
): PortfolioFixPlan {
  const active = holdings.filter(h => wt(h) > 0.001);
  const sorted = [...active].sort((a, b) => wt(b) - wt(a));
  const t      = THRESHOLDS[profile];

  const usExposure = estimateUSExposure(active);
  const intl       = hasInternational(active);
  const em         = hasEM(active);
  const bonds      = hasBonds(active);
  const crypto     = cryptoWt(active);
  const sharpe     = metrics.sharpe_ratio ?? 0;
  const vol        = metrics.volatility ?? 0;
  const mdd        = Math.abs(metrics.max_drawdown ?? 0);

  const hhi  = computeHHI(active);
  const effN = effectiveN(hhi);

  // Calmar ratio: annualised return / |max drawdown|
  const calmarRatio = (metrics.actual_return != null && mdd > 0)
    ? Math.round((metrics.actual_return / mdd) * 100) / 100
    : null;

  const { total: score, breakdown: scoreBreakdown } = computeScore(
    sorted, metrics, profile, usExposure, hhi, effN, bonds, intl, em, crypto,
  );

  const issues:   string[] = [];
  const recos:    Recommendation[] = [];
  const benefits: string[] = [];
  let freedPP = 0;

  // ── 1. Single-holding concentration ──────────────────────────────────────
  for (const h of sorted) {
    const curr  = wt(h) * 100;
    const cap   = t.singleStockMax * 100;
    if (curr <= cap) continue;

    const target     = Math.max(cap, Math.round(curr * 0.58));
    const delta      = target - curr;
    freedPP         += Math.abs(delta);
    const params     = getAssetParams(h.ticker, h.type);
    const rcPct      = vol > 0 ? Math.round(riskContributionPct(h, vol)) : null;
    const volReductionPp = Math.round(Math.abs(delta) / 100 * params.rho * params.sigma * 100 * 10) / 10;

    issues.push(
      `${h.ticker} HHI contribution: ${((wt(h)**2 / hhi) * 100).toFixed(0)}% of portfolio concentration index. ` +
      `At ${curr.toFixed(0)}% weight${rcPct != null ? ` and ~${rcPct}% of portfolio volatility` : ""}, ` +
      `this exceeds the ${cap.toFixed(0)}% single-position limit for a ${profile} allocation by ${(curr - cap).toFixed(0)}pp.`
    );

    recos.push({
      action:        "reduce",
      priority:      assignPriority("reduce", delta, curr),
      ticker:        h.ticker,
      assetClass:    h.type,
      currentWeight: Math.round(curr),
      targetWeight:  Math.round(target),
      changePct:     Math.round(delta),
      amountGBP:     gbp(totalPortfolioValue, delta),
      pnlPct:        h.pnl_pct,
      reason:
        `${h.ticker} contributes an estimated ${rcPct != null ? `${rcPct}% of portfolio volatility` : "an outsized share of portfolio risk"} ` +
        `(MCTR = ${(params.rho * params.sigma * 100).toFixed(1)}% per pp of weight). ` +
        `At a ${curr.toFixed(0)}% allocation, a 1σ monthly move in ${h.ticker} alone shifts the portfolio ` +
        `by approximately ${(wt(h) * params.sigma / Math.sqrt(12) * 100).toFixed(1)}%. ` +
        `The concentration also raises the HHI to ${hhi.toFixed(3)} — above the ${t.maxHHI.toFixed(2)} ceiling for a ${profile} profile.`,
      expectedImpact:
        `Reducing to ${target.toFixed(0)}% is estimated to lower annualised portfolio volatility by ~${volReductionPp}pp ` +
        `(Δσ ≈ ${(Math.abs(delta)/100).toFixed(2)} × ${(params.rho * params.sigma * 100).toFixed(1)}%) ` +
        `and improve Effective-N from ${effN.toFixed(1)} toward ${effectiveN(hhi - (wt(h)**2 - (target/100)**2)).toFixed(1)}.`,
    });
  }

  // ── 2. Top-2 combined concentration ──────────────────────────────────────
  if (sorted.length >= 2) {
    const s0 = wt(sorted[0]) * 100;
    const s1 = wt(sorted[1]) * 100;
    const top2 = s0 + s1;
    const alreadyFlagged = s1 > t.singleStockMax * 100;

    if (top2 > t.top2Max * 100 && !alreadyFlagged) {
      const target = Math.max(t.singleStockMax * 100, Math.round(s1 * 0.80));
      const delta  = target - s1;
      if (delta < -2) {
        freedPP += Math.abs(delta);
        issues.push(
          `Top-2 combined weight (${sorted[0].ticker} + ${sorted[1].ticker}): ${top2.toFixed(0)}% — ` +
          `${(top2 - t.top2Max * 100).toFixed(0)}pp above the ${(t.top2Max * 100).toFixed(0)}% limit. ` +
          `Combined correlated drawdown risk is elevated.`
        );
        const p2 = getAssetParams(sorted[1].ticker, sorted[1].type);
        recos.push({
          action:        "trim",
          priority:      assignPriority("trim", delta, s1),
          ticker:        sorted[1].ticker,
          assetClass:    sorted[1].type,
          currentWeight: Math.round(s1),
          targetWeight:  Math.round(target),
          changePct:     Math.round(delta),
          amountGBP:     gbp(totalPortfolioValue, delta),
          pnlPct:        sorted[1].pnl_pct,
          reason:
            `With ${sorted[0].ticker} as the dominant position, ${sorted[1].ticker} at ${s1.toFixed(0)}% ` +
            `amplifies pairwise correlation risk. If both assets decline in the same drawdown event ` +
            `(common in risk-off episodes), the combined ${top2.toFixed(0)}% would drive ` +
            `a ${(top2 / 100 * (p2.sigma / Math.sqrt(12)) * 100).toFixed(1)}% worst-month impact at 1σ.`,
          expectedImpact:
            `Trimming ${sorted[1].ticker} to ${target.toFixed(0)}% reduces the correlated pair concentration ` +
            `and reallocates ~£${gbp(totalPortfolioValue, Math.abs(delta)).toLocaleString("en-GB")} to less-correlated assets.`,
        });
      }
    }
  }

  // ── 3. Geographic concentration ──────────────────────────────────────────
  if (usExposure > t.usMax) {
    issues.push(
      `Estimated US equity exposure: ~${Math.round(usExposure * 100)}% — ` +
      `${(usExposure - t.usMax) * 100 > 0 ? `${Math.round((usExposure - t.usMax) * 100)}pp` : ""} above the ${Math.round(t.usMax * 100)}% ceiling. ` +
      `Single-country concentration increases sensitivity to US monetary policy, earnings cycles, and dollar volatility.`
    );
    benefits.push("Geographic diversification reduces single-country factor exposure and policy risk");

    if (!intl) {
      const addWt = Math.min(Math.round(freedPP * 0.55), 15);
      const target = Math.max(addWt, 10);
      recos.push({
        action:        "add",
        priority:      assignPriority("add", target, 0, true),
        assetClass:    "Global Equity ETF (e.g. VWRL, SWLD)",
        currentWeight: 0,
        targetWeight:  target,
        changePct:     target,
        amountGBP:     gbp(totalPortfolioValue, target),
        reason:
          `The portfolio has zero non-US equity exposure. US-only portfolios have historically exhibited ` +
          `higher drawdowns during USD-weakening or US-specific shock episodes. ` +
          `A global ETF adds exposure to ~22 developed markets and introduces a natural FX diversifier ` +
          `against USD concentration.`,
        expectedImpact:
          `A ${target}% allocation to a global ETF (σ ≈ 16%, ρ ≈ 0.93 with equity market) ` +
          `begins to address geographic concentration. Combined with position reductions, ` +
          `this is estimated to reduce effective US exposure toward ${Math.round((usExposure - target/100 * 0.38) * 100)}%.`,
      });
    } else if (!em) {
      const addWt = Math.min(Math.round(freedPP * 0.30), 8);
      const target = Math.max(addWt, 5);
      recos.push({
        action:        "add",
        priority:      "medium",
        assetClass:    "Emerging Markets ETF (e.g. VFEM, EEM)",
        currentWeight: 0,
        targetWeight:  target,
        changePct:     target,
        amountGBP:     gbp(totalPortfolioValue, target),
        reason:
          `EM equities (σ ≈ 19%, ρ ≈ 0.55 with portfolio) provide lower pairwise correlation ` +
          `than additional developed-market exposure. EM weight represents ~13% of global market cap ` +
          `and provides exposure to different growth, rates, and currency cycles.`,
        expectedImpact:
          `A ${target}% EM allocation adds ~${(target * 0.19 * 0.55).toFixed(2)}pp of expected vol reduction benefit ` +
          `relative to equivalent weight in a high-correlation asset. Effective-N improves marginally.`,
      });
    }
  }

  // ── 4. Sharpe / risk-adjusted efficiency ──────────────────────────────────
  if (metrics.sharpe_ratio != null) {
    if (sharpe < 0.3) {
      issues.push(
        `Sharpe ratio: ${sharpe.toFixed(2)} — below 0.3, indicating uncompensated risk-taking. ` +
        `The portfolio is accepting significant volatility without proportionate return.`
      );
      benefits.push("Rebalancing toward lower-correlation assets may improve risk-adjusted efficiency (Sharpe)");
    } else if (sharpe >= 1.0) {
      benefits.push(`Sharpe ratio of ${sharpe.toFixed(2)} is above 1.0 — preserve this efficiency when making changes`);
    }
    if (calmarRatio != null) {
      if (calmarRatio < 0.5 && calmarRatio >= 0) {
        issues.push(
          `Calmar ratio: ${calmarRatio.toFixed(2)} — return/drawdown efficiency is low. ` +
          `Capital is experiencing drawdown risk not proportionate to returns generated.`
        );
      } else if (calmarRatio > 1.5) {
        benefits.push(`Calmar ratio of ${calmarRatio.toFixed(2)} is strong — high return relative to drawdown depth`);
      }
    }
  }

  // ── 5. Volatility vs profile ceiling ─────────────────────────────────────
  if (metrics.volatility != null && vol > t.volatilityHigh) {
    const excess = ((vol - t.volatilityHigh) * 100).toFixed(0);
    issues.push(
      `Annualised portfolio volatility: ${(vol * 100).toFixed(0)}% — ` +
      `${excess}pp above the ${(t.volatilityHigh * 100).toFixed(0)}% ceiling for a ${profile} profile. ` +
      `At this vol level, a 1σ annual drawdown would represent ~£${Math.round(totalPortfolioValue * vol).toLocaleString("en-GB")}.`
    );

    if (profile === "conservative" && !bonds) {
      const addWt  = Math.min(Math.round(freedPP * 0.45), 12);
      const target = Math.max(addWt, 8);
      const bondMctr = mctr("IGLT", "bond");
      const volImpact = (target / 100 * bondMctr * 100).toFixed(1);
      recos.push({
        action:        "add",
        priority:      "high",
        assetClass:    "Investment Grade Bond ETF (e.g. IGLT, VGOV)",
        currentWeight: 0,
        targetWeight:  target,
        changePct:     target,
        amountGBP:     gbp(totalPortfolioValue, target),
        reason:
          `A conservative portfolio with 0% fixed income allocation is fully exposed to equity drawdowns. ` +
          `Bonds (σ ≈ 6%, ρ ≈ -0.15 with equity) provide negative covariance — they tend to appreciate ` +
          `when equities fall, acting as a variance dampener in stressed conditions.`,
        expectedImpact:
          `${target}% in bonds (MCTR = ${(bondMctr * 100).toFixed(1)}% per pp) reduces portfolio vol ` +
          `by an estimated ~${volImpact}pp. The negative correlation adds diversification benefit ` +
          `beyond the direct vol contribution.`,
      });
      benefits.push("Bond allocation introduces negative-correlation exposure, damping portfolio variance");
    } else {
      benefits.push("Reducing concentrated high-sigma positions is the primary lever to lower portfolio volatility");
    }
  }

  // ── 6. Crypto exposure ────────────────────────────────────────────────────
  if (crypto > t.cryptoMax) {
    const cryptoSigma = 0.80;
    issues.push(
      `Crypto allocation: ${Math.round(crypto * 100)}% — ` +
      `${Math.round((crypto - t.cryptoMax) * 100)}pp above the ${Math.round(t.cryptoMax * 100)}% limit. ` +
      `At σ ≈ 80% annualised, a ${Math.round(crypto * 100)}% crypto weight contributes ` +
      `~${(crypto * cryptoSigma * 100).toFixed(0)}pp of expected portfolio vol per unit of correlation.`
    );
    for (const h of sorted.filter(h => CRYPTO.has(h.ticker) || h.type === "crypto")) {
      const curr   = wt(h) * 100;
      const target = t.cryptoMax * 100;
      if (curr <= target) continue;
      const delta  = target - curr;
      freedPP     += Math.abs(delta);
      const volReducPp = Math.round(Math.abs(delta) / 100 * 0.15 * cryptoSigma * 100 * 10) / 10;
      recos.push({
        action:        "reduce",
        priority:      assignPriority("reduce", delta, curr),
        ticker:        h.ticker,
        assetClass:    "crypto",
        currentWeight: Math.round(curr),
        targetWeight:  Math.round(target),
        changePct:     Math.round(delta),
        amountGBP:     gbp(totalPortfolioValue, delta),
        pnlPct:        h.pnl_pct,
        reason:
          `${h.ticker} carries σ ≈ ${(cryptoSigma * 100).toFixed(0)}% annualised volatility. ` +
          `At ${curr.toFixed(0)}% weight, a 1σ move in ${h.ticker} shifts the portfolio ` +
          `by ~${(wt(h) * cryptoSigma / Math.sqrt(12) * 100).toFixed(1)}% in a single month. ` +
          `Crypto assets are not well-captured by standard risk models — tail risk is asymmetric.`,
        expectedImpact:
          `Reducing to ${target.toFixed(0)}% is estimated to lower annualised portfolio volatility ` +
          `by ~${volReducPp}pp and bring crypto risk contribution within ${profile} risk tolerance.`,
      });
    }
  }

  // ── 7. Drawdown severity ──────────────────────────────────────────────────
  if (metrics.max_drawdown != null && mdd > 0.25) {
    issues.push(
      `Maximum drawdown: ${(mdd * 100).toFixed(0)}% — a significant peak-to-trough loss. ` +
      `${calmarRatio != null ? `Calmar ratio of ${calmarRatio.toFixed(2)} (return/|MDD|) is ${calmarRatio < 0.5 ? "below the 0.5 minimum acceptable threshold" : "moderate"}.` : ""}` +
      ` Reducing concentrated high-sigma positions is the primary structural lever to narrow future drawdown depth.`
    );
    benefits.push("Improved diversification and lower concentration may reduce the depth and duration of future drawdowns");
  }

  // ── 8. Conservative: require bond allocation ──────────────────────────────
  if (profile === "conservative" && t.requireDefensive && !bonds && !recos.some(r => r.assetClass?.includes("Bond"))) {
    issues.push("No defensive fixed income allocation — portfolio is fully exposed to equity market variance");
    const target = 10;
    const bondMctr = mctr("IGLT", "bond");
    recos.push({
      action:        "add",
      priority:      "high",
      assetClass:    "Short-Duration Bond ETF (e.g. IGLS, VGOV)",
      currentWeight: 0,
      targetWeight:  target,
      changePct:     target,
      amountGBP:     gbp(totalPortfolioValue, target),
      reason:
        `Conservative mandates require a fixed income buffer. Bonds provide negative covariance ` +
        `with equities (ρ ≈ -0.15), meaning they act as a structural offset during risk-off events. ` +
        `Without bonds, the portfolio has no non-equity hedge.`,
      expectedImpact:
        `${target}% in short-duration bonds (MCTR = ${(bondMctr * 100).toFixed(1)}%) reduces vol contribution ` +
        `and introduces downside asymmetry. The negative correlation provides a diversification benefit ` +
        `that exceeds the direct vol calculation.`,
    });
    benefits.push("Bond allocation provides negative-correlation buffer during equity market stress");
  }

  // ── 9. Redistribute freed weight to existing diversifiers ────────────────
  const totalAllocated = recos.filter(r => r.action === "add" || r.action === "increase").reduce((s, r) => s + r.changePct, 0);
  const surplus = freedPP - totalAllocated;

  if (surplus >= 5) {
    const diversifiers = active.filter(h => {
      const tk = h.ticker.replace(".L", "");
      return (GLOBAL_ETFS.has(tk) || EM_ETFS.has(tk) || UK_ETFS.has(tk)) &&
        !recos.some(r => r.ticker === h.ticker);
    }).sort((a, b) => wt(a) - wt(b));

    if (diversifiers.length > 0) {
      const perDiv = Math.min(Math.round(surplus / diversifiers.length), 8);
      for (const h of diversifiers.slice(0, 2)) {
        const curr   = wt(h) * 100;
        const target = Math.min(25, curr + perDiv);
        if (target - curr < 2) continue;
        const p   = getAssetParams(h.ticker, h.type);
        const vol = metrics.volatility ?? 0.30;
        const rcBefore = vol > 0 ? (curr / 100 * p.rho * p.sigma / vol * 100).toFixed(1) : "—";
        const rcAfter  = vol > 0 ? (target / 100 * p.rho * p.sigma / vol * 100).toFixed(1) : "—";
        recos.push({
          action:        "increase",
          priority:      "low",
          ticker:        h.ticker,
          assetClass:    h.type,
          currentWeight: Math.round(curr),
          targetWeight:  Math.round(target),
          changePct:     Math.round(target - curr),
          amountGBP:     gbp(totalPortfolioValue, target - curr),
          reason:
            `Freed capital from position reductions can be redeployed into ${h.ticker}, which ` +
            `${holdingGeographyDescription(h.ticker)}. ` +
            `With MCTR = ${(p.rho * p.sigma * 100).toFixed(1)}%, this asset adds less marginal risk ` +
            `per pound of weight than the positions being reduced.`,
          expectedImpact:
            `Increasing ${h.ticker} to ${target.toFixed(0)}% raises its risk contribution from ` +
            `~${rcBefore}% to ~${rcAfter}% of portfolio vol — a controlled increase that ` +
            `improves geographic diversification without materially raising total portfolio variance.`,
        });
      }
    }
  }

  // ── Sort: priority, then magnitude ───────────────────────────────────────
  const PRIORITY_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
  recos.sort((a, b) =>
    PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
    Math.abs(b.changePct) - Math.abs(a.changePct)
  );

  // ── Guards ────────────────────────────────────────────────────────────────
  if (issues.length === 0) {
    issues.push(
      `Portfolio is structurally sound for a ${profile} profile. ` +
      `HHI = ${hhi.toFixed(3)} (Effective-N = ${effN.toFixed(1)}). ` +
      `Monitor allocation drift as prices move — rebalance when any position drifts >3pp from target weight.`
    );
  }
  if (benefits.length === 0) {
    benefits.push("Monitor HHI drift — rebalance when Effective-N falls below target");
    benefits.push("Review correlation assumptions quarterly as market regimes shift");
  }

  // ── Projection ───────────────────────────────────────────────────────────
  const projected = simulatePortfolioAfterChanges(active, recos, metrics);

  // ── Top action ───────────────────────────────────────────────────────────
  const top = recos[0];
  const topPriorityAction = top
    ? top.action === "add"
      ? `Add ${top.assetClass} — allocate £${top.amountGBP.toLocaleString("en-GB")} to improve diversification`
      : `${top.action === "reduce" ? "Reduce" : top.action === "trim" ? "Trim" : "Increase"} ${top.ticker ?? top.assetClass} by £${top.amountGBP.toLocaleString("en-GB")} (${top.currentWeight}% → ${top.targetWeight}%)`
    : "Portfolio is well-balanced — no immediate changes required";

  return {
    score,
    scoreLabel:       scoreLabel(score),
    scoreBreakdown,
    hhi:              Math.round(hhi * 1000) / 1000,
    effectiveN:       Math.round(effN * 10) / 10,
    calmarRatio,
    primaryIssues:    issues,
    recommendations:  recos,
    projectedMetrics: projected,
    topPriorityAction,
    summary:          buildSummary(profile, score, scoreBreakdown, issues, recos.length, sharpe, vol, hhi, effN),
    expectedBenefits: [...new Set(benefits)],
  };
}

// ── Summary prose ──────────────────────────────────────────────────────────────

function buildSummary(
  profile: RiskProfile,
  score: number,
  breakdown: ScoreBreakdown,
  issues: string[],
  recoCount: number,
  sharpe: number,
  vol: number,
  hhi: number,
  effN: number,
): string {
  const profileDesc: Record<RiskProfile, string> = {
    conservative: "a conservative, capital-preservation mandate",
    balanced:     "a balanced growth-and-stability mandate",
    growth:       "a growth-oriented mandate",
  };

  const hhiStr = `HHI = ${hhi.toFixed(3)}, Effective-N = ${effN.toFixed(1)}`;

  const weakest = (
    Object.entries(breakdown) as [keyof ScoreBreakdown, number][]
  ).sort((a, b) => {
    const maxes = { concentration: 30, riskAdjReturn: 25, drawdown: 20, diversification: 15, alignment: 10 };
    return (a[1] / maxes[a[0]]) - (b[1] / maxes[b[0]]);
  })[0][0];

  const weakestLabel: Record<keyof ScoreBreakdown, string> = {
    concentration:  "position concentration",
    riskAdjReturn:  "risk-adjusted return (Sharpe)",
    drawdown:       "drawdown control",
    diversification:"geographic diversification",
    alignment:      "profile alignment",
  };

  if (score >= 75) {
    return `Portfolio is well-structured for ${profileDesc[profile]}. ${hhiStr}. ` +
      `The primary monitoring concern is allocation drift — rebalance when HHI shifts by more than 0.03 ` +
      `or any position drifts beyond its target weight by 3pp. No immediate structural changes are required.`;
  }

  if (score >= 55) {
    return `Portfolio carries addressable inefficiencies against ${profileDesc[profile]}. ` +
      `${hhiStr}. The primary drag on the score is ${weakestLabel[weakest]}. ` +
      `The ${recoCount} recommended adjustment${recoCount > 1 ? "s" : ""} are targeted — implement the highest-priority action first and reassess before proceeding.`;
  }

  const volNote = vol > 0.28
    ? ` Annualised vol of ${(vol * 100).toFixed(0)}% is materially above profile tolerance.`
    : "";

  return `Portfolio has structural characteristics misaligned with ${profileDesc[profile]}. ` +
    `${hhiStr}.${volNote} ` +
    `The ${recoCount} recommended change${recoCount !== 1 ? "s" : ""} are ordered by estimated risk reduction impact. ` +
    `Implement the highest-priority action first — each change improves the input conditions for subsequent adjustments.`;
}
