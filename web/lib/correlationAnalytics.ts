/**
 * Deterministic correlation analytics.
 * All values derived directly from the pairwise correlation matrix.
 * No AI, no speculation, no external calls.
 */

import type { CorrelationCell } from "./api";

export type PairResult = {
  row: string;
  col: string;
  value: number;
  level: "high" | "moderate" | "low" | "inverse";
};

export type CorrelationAnalytics = {
  avgCorrelation: number;          // mean of all unique off-diagonal pairs
  diversificationScore: number;    // (1 - avgCorrelation) * 100, clamped 0–100
  concentrationFlag: boolean;      // true if avgCorrelation > 0.6
  mostCorrelated: PairResult[];    // top 3 highest off-diagonal pairs
  leastCorrelated: PairResult[];   // top 3 lowest off-diagonal pairs
  redundantAssets: string[];       // corr > 0.7 with 2+ other assets
  diversifiers: string[];          // avg corr vs all others < 0.3
  suggestedActions: string[];      // rule-based, deterministic
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
): CorrelationAnalytics {
  // Build O(1) lookup
  const lookup = new Map<string, number>();
  matrix.forEach(c => lookup.set(`${c.row}|${c.col}`, c.value));

  const get = (a: string, b: string): number => lookup.get(`${a}|${b}`) ?? 0;

  // ── Unique off-diagonal pairs (upper triangle only) ───────────────────────
  const pairs: PairResult[] = [];
  for (let i = 0; i < tickers.length; i++) {
    for (let j = i + 1; j < tickers.length; j++) {
      const v = get(tickers[i], tickers[j]);
      pairs.push({ row: tickers[i], col: tickers[j], value: v, level: classify(v) });
    }
  }

  if (pairs.length === 0) {
    return {
      avgCorrelation: 0,
      diversificationScore: 100,
      concentrationFlag: false,
      mostCorrelated: [],
      leastCorrelated: [],
      redundantAssets: [],
      diversifiers: [],
      suggestedActions: [],
    };
  }

  // ── Average correlation ───────────────────────────────────────────────────
  const avgCorrelation = pairs.reduce((s, p) => s + p.value, 0) / pairs.length;

  // ── Diversification score ─────────────────────────────────────────────────
  const diversificationScore = Math.round(Math.max(0, Math.min(100, (1 - avgCorrelation) * 100)));

  // ── Concentration flag ────────────────────────────────────────────────────
  const concentrationFlag = avgCorrelation > 0.6;

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

  if (avgCorrelation > 0.6) {
    suggestedActions.push("Portfolio moves are highly synchronised — assets tend to rise and fall together");
    suggestedActions.push("Adding lower-correlation assets would improve resilience during drawdowns");
  } else if (avgCorrelation > 0.4) {
    suggestedActions.push("Moderate correlation — portfolio has reasonable but improvable diversification");
  } else {
    suggestedActions.push("Low average correlation — holdings provide meaningful independent return streams");
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

  return {
    avgCorrelation,
    diversificationScore,
    concentrationFlag,
    mostCorrelated,
    leastCorrelated,
    redundantAssets,
    diversifiers,
    suggestedActions,
  };
}
