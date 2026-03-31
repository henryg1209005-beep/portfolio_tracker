/**
 * Deterministic correlation analytics.
 * All values derived directly from the pairwise correlation matrix.
 * No AI, no speculation, no external calls.
 *
 * Enhanced with:
 * - Weight-adjusted diversification ratio (DR)
 * - Statistical confidence indicators per pair
 * - Percentile-based redundancy detection
 */

import type { CorrelationCell } from "./api";

export type PairResult = {
  row: string;
  col: string;
  value: number;
  level: "high" | "moderate" | "low" | "inverse";
  overlap?: number;
  confident: boolean;
};

export type CorrelationAnalytics = {
  avgCorrelation: number;                // mean of all unique off-diagonal pairs
  weightedAvgCorrelation: number;        // weight-adjusted average correlation
  diversificationScore: number;          // (1 - avgCorrelation) * 100, clamped 0–100
  diversificationRatio: number | null;   // DR = weighted vol sum / portfolio vol
  concentrationFlag: boolean;            // true if avgCorrelation > 0.6
  mostCorrelated: PairResult[];          // top 3 highest off-diagonal pairs
  leastCorrelated: PairResult[];         // top 3 lowest off-diagonal pairs
  redundantAssets: string[];             // corr > 0.7 with 2+ other assets
  diversifiers: string[];                // avg corr vs all others < 0.3
  suggestedActions: string[];            // rule-based, deterministic
  method: "pearson" | "spearman";
  lowConfidencePairs: number;            // pairs with insufficient overlap
};

/** Classify a correlation coefficient */
function classify(v: number): PairResult["level"] {
  if (v < 0) return "inverse";
  if (v > 0.7) return "high";
  if (v > 0.3) return "moderate";
  return "low";
}

export function computeCorrelationAnalytics(
  tickers: string[],
  matrix: CorrelationCell[],
  weights?: Record<string, number>,
  method: "pearson" | "spearman" = "pearson",
): CorrelationAnalytics {
  // Build O(1) lookup
  const lookup = new Map<string, number>();
  const overlapLookup = new Map<string, number>();
  matrix.forEach(c => {
    lookup.set(`${c.row}|${c.col}`, c.value);
    if (c.overlap !== undefined) overlapLookup.set(`${c.row}|${c.col}`, c.overlap);
  });

  const get = (a: string, b: string): number =>
    lookup.get(`${a}|${b}`) ?? lookup.get(`${b}|${a}`) ?? 0;
  const getOverlap = (a: string, b: string): number =>
    overlapLookup.get(`${a}|${b}`) ?? overlapLookup.get(`${b}|${a}`) ?? 0;

  // ── Unique off-diagonal pairs (upper triangle only) ───────────────────────
  const pairs: PairResult[] = [];
  let lowConfidencePairs = 0;
  for (let i = 0; i < tickers.length; i++) {
    for (let j = i + 1; j < tickers.length; j++) {
      const v = get(tickers[i], tickers[j]);
      const overlap = getOverlap(tickers[i], tickers[j]);
      // Statistical confidence: |ρ| > 2/√n is a rough significance threshold
      const confident = overlap > 0 ? Math.abs(v) > 2 / Math.sqrt(overlap) || overlap >= 60 : false;
      if (!confident) lowConfidencePairs++;
      pairs.push({
        row: tickers[i], col: tickers[j], value: v,
        level: classify(v), overlap, confident,
      });
    }
  }

  if (pairs.length === 0) {
    return {
      avgCorrelation: 0,
      weightedAvgCorrelation: 0,
      diversificationScore: 100,
      diversificationRatio: null,
      concentrationFlag: false,
      mostCorrelated: [],
      leastCorrelated: [],
      redundantAssets: [],
      diversifiers: [],
      suggestedActions: [],
      method,
      lowConfidencePairs: 0,
    };
  }

  // ── Average correlation ───────────────────────────────────────────────────
  const avgCorrelation = pairs.reduce((s, p) => s + p.value, 0) / pairs.length;

  // ── Weight-adjusted average correlation ───────────────────────────────────
  let weightedAvgCorrelation = avgCorrelation;
  if (weights && Object.keys(weights).length >= 2) {
    let wSum = 0;
    let wCorr = 0;
    for (const p of pairs) {
      const wa = weights[p.row] ?? 0;
      const wb = weights[p.col] ?? 0;
      const pairWeight = wa * wb;
      wCorr += pairWeight * p.value;
      wSum += pairWeight;
    }
    if (wSum > 0) {
      weightedAvgCorrelation = wCorr / wSum;
    }
  }

  // ── Diversification ratio ─────────────────────────────────────────────────
  // DR = (Σ wᵢ·σᵢ) / σ_portfolio  where σ_portfolio = √(w'Σw)
  // We approximate using correlation matrix (assume equal vol for relative DR)
  // DR > 1 = diversified; DR = 1 = single asset equivalent
  let diversificationRatio: number | null = null;
  if (weights && Object.keys(weights).length >= 2) {
    const w = tickers.map(t => weights[t] ?? 0);
    const totalW = w.reduce((a, b) => a + b, 0);
    if (totalW > 0) {
      const normW = w.map(v => v / totalW);
      // With equal-vol assumption (σᵢ = 1), numerator = Σwᵢ = 1
      // denominator = √(w'Cw) where C is correlation matrix
      let portfolioVar = 0;
      for (let i = 0; i < tickers.length; i++) {
        for (let j = 0; j < tickers.length; j++) {
          const corr = i === j ? 1 : get(tickers[i], tickers[j]);
          portfolioVar += normW[i] * normW[j] * corr;
        }
      }
      if (portfolioVar > 0) {
        diversificationRatio = Math.round((1 / Math.sqrt(portfolioVar)) * 100) / 100;
      }
    }
  }

  // ── Diversification score ─────────────────────────────────────────────────
  const diversificationScore = Math.round(Math.max(0, Math.min(100, (1 - weightedAvgCorrelation) * 100)));

  // ── Concentration flag ────────────────────────────────────────────────────
  const concentrationFlag = weightedAvgCorrelation > 0.6;

  // ── Most / least correlated pairs ─────────────────────────────────────────
  const sorted = [...pairs].sort((a, b) => b.value - a.value);
  const mostCorrelated  = sorted.slice(0, 3);
  const leastCorrelated = [...pairs].sort((a, b) => a.value - b.value).slice(0, 3);

  // ── Redundant assets (corr > 0.7 with ≥ 2 others) ────────────────────────
  const redundantAssets: string[] = [];
  for (const ticker of tickers) {
    const highCount = tickers.filter(
      other => other !== ticker && get(ticker, other) > 0.7
    ).length;
    if (highCount >= 2) redundantAssets.push(ticker);
  }

  // ── Diversifiers (avg corr vs all others < 0.3) ───────────────────────────
  const diversifiers: string[] = [];
  for (const ticker of tickers) {
    const others = tickers.filter(t => t !== ticker);
    if (others.length === 0) continue;
    const avgVsOthers = others.reduce((s, t) => s + Math.abs(get(ticker, t)), 0) / others.length;
    if (avgVsOthers < 0.3) diversifiers.push(ticker);
  }

  // ── Suggested actions (fully rule-based) ─────────────────────────────────
  const suggestedActions: string[] = [];

  if (weightedAvgCorrelation > 0.6) {
    suggestedActions.push("Portfolio moves are highly synchronised — assets tend to rise and fall together");
    suggestedActions.push("Adding lower-correlation assets would improve resilience during drawdowns");
  } else if (weightedAvgCorrelation > 0.4) {
    suggestedActions.push("Moderate correlation — portfolio has reasonable but improvable diversification");
  } else {
    suggestedActions.push("Low average correlation — holdings provide meaningful independent return streams");
  }

  if (diversificationRatio !== null) {
    if (diversificationRatio < 1.15) {
      suggestedActions.push(
        `Diversification ratio is ${diversificationRatio.toFixed(2)}x — portfolio behaves almost like a single asset`
      );
    } else if (diversificationRatio >= 1.5) {
      suggestedActions.push(
        `Diversification ratio of ${diversificationRatio.toFixed(2)}x — strong risk reduction from diversification`
      );
    }
  }

  if (redundantAssets.length > 0) {
    suggestedActions.push(
      `${redundantAssets.join(", ")} ${redundantAssets.length === 1 ? "shows" : "show"} high overlap with multiple other holdings`
    );
  }

  if (diversifiers.length > 0) {
    suggestedActions.push(
      `${diversifiers.join(", ")} ${diversifiers.length === 1 ? "acts" : "act"} as portfolio diversifiers with low cross-correlation`
    );
  }

  if (mostCorrelated[0]?.value > 0.85) {
    suggestedActions.push(
      `${mostCorrelated[0].row} and ${mostCorrelated[0].col} are highly correlated (${mostCorrelated[0].value.toFixed(2)}) — holding both adds limited diversification benefit`
    );
  }

  if (lowConfidencePairs > 0) {
    suggestedActions.push(
      `${lowConfidencePairs} pair${lowConfidencePairs === 1 ? "" : "s"} ha${lowConfidencePairs === 1 ? "s" : "ve"} limited data — consider using a longer period for more reliable estimates`
    );
  }

  return {
    avgCorrelation,
    weightedAvgCorrelation,
    diversificationScore,
    diversificationRatio,
    concentrationFlag,
    mostCorrelated,
    leastCorrelated,
    redundantAssets,
    diversifiers,
    suggestedActions,
    method,
    lowConfidencePairs,
  };
}
