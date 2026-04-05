export interface ComparisonFaq {
  q: string;
  a: string;
}

export interface MetricComparison {
  slug: string;
  title: string;
  shortTitle: string;
  metaDescription: string;
  primaryMetricSlug: string;
  secondaryMetricSlug: string;
  summary: string;
  whenToUsePrimary: string;
  whenToUseSecondary: string;
  keyDifferences: Array<{ label: string; primary: string; secondary: string }>;
  pitfalls: string[];
  decisionRule: string;
  faqs: ComparisonFaq[];
}

export const METRIC_COMPARISONS: MetricComparison[] = [
  {
    slug: "sharpe-vs-sortino",
    title: "Sharpe Ratio vs Sortino Ratio",
    shortTitle: "Sharpe vs Sortino",
    metaDescription:
      "Understand Sharpe Ratio vs Sortino Ratio, key differences, when to use each, and how to interpret them together in a portfolio.",
    primaryMetricSlug: "sharpe-ratio",
    secondaryMetricSlug: "sortino-ratio",
    summary:
      "Sharpe measures return per unit of total volatility, while Sortino only penalizes downside volatility. Use both together to see whether volatility is mostly harmful or mostly upside noise.",
    whenToUsePrimary:
      "Use Sharpe when you want a broad, standard benchmark for risk-adjusted return that is comparable across portfolios and funds.",
    whenToUseSecondary:
      "Use Sortino when your strategy has asymmetric returns and you care more about downside protection than total variance.",
    keyDifferences: [
      {
        label: "Risk denominator",
        primary: "Total standard deviation of returns",
        secondary: "Downside deviation only",
      },
      {
        label: "Penalty",
        primary: "Penalizes upside and downside volatility",
        secondary: "Penalizes downside volatility only",
      },
      {
        label: "Best for",
        primary: "General benchmarking and comparability",
        secondary: "Loss-sensitive analysis and asymmetric strategies",
      },
    ],
    pitfalls: [
      "Comparing readings from different time windows can mislead interpretation.",
      "A higher Sortino alone does not prove low risk if max drawdown is still severe.",
      "Very short histories make both ratios unstable.",
    ],
    decisionRule:
      "If Sharpe is mediocre but Sortino is strong, your volatility may be mostly upside. If both are weak, the return quality is likely poor.",
    faqs: [
      {
        q: "Can Sortino be lower than Sharpe?",
        a: "In normal definitions, Sortino is typically equal to or higher than Sharpe because it excludes upside volatility from the risk denominator.",
      },
      {
        q: "Which one should I optimize for?",
        a: "Use Sharpe for broad comparability, then use Sortino to check downside quality. Optimizing only one can hide risk structure.",
      },
    ],
  },
  {
    slug: "var-vs-maximum-drawdown",
    title: "Value at Risk vs Maximum Drawdown",
    shortTitle: "VaR vs Max Drawdown",
    metaDescription:
      "Learn the difference between Value at Risk (VaR) and Maximum Drawdown, when each is useful, and how to use both to assess downside risk.",
    primaryMetricSlug: "value-at-risk",
    secondaryMetricSlug: "maximum-drawdown",
    summary:
      "VaR is a probabilistic daily loss estimate, while Maximum Drawdown is the worst historical peak-to-trough decline. VaR helps with expected bad-day sizing; drawdown reflects lived pain.",
    whenToUsePrimary:
      "Use VaR for day-to-day risk budgeting and understanding typical tail risk at a selected confidence level.",
    whenToUseSecondary:
      "Use Maximum Drawdown to evaluate survivability, stress endurance, and recovery burden over full history.",
    keyDifferences: [
      {
        label: "Type",
        primary: "Model-based estimate",
        secondary: "Historical realized outcome",
      },
      {
        label: "Time focus",
        primary: "Usually one-day horizon",
        secondary: "Full-period peak-to-trough event",
      },
      {
        label: "What it answers",
        primary: "How bad can a typical extreme day be?",
        secondary: "How deep was the worst cumulative decline?",
      },
    ],
    pitfalls: [
      "VaR can understate true tail losses when returns are non-normal.",
      "Maximum Drawdown is path-dependent and may worsen with longer history.",
      "Using either metric alone hides important context.",
    ],
    decisionRule:
      "Use VaR for active sizing and operational risk limits, and Max Drawdown for strategic durability and behavior risk.",
    faqs: [
      {
        q: "Does VaR tell me the worst possible loss?",
        a: "No. VaR gives a threshold at a confidence level, not the worst-case loss beyond that threshold.",
      },
      {
        q: "Can I have low VaR but high drawdown?",
        a: "Yes. A portfolio can look calm daily but still experience a large cumulative decline over a prolonged regime shift.",
      },
    ],
  },
  {
    slug: "beta-vs-correlation",
    title: "Beta vs Correlation",
    shortTitle: "Beta vs Correlation",
    metaDescription:
      "Compare Beta and Correlation in portfolio analysis: what each metric measures, where they differ, and how to use them together.",
    primaryMetricSlug: "beta",
    secondaryMetricSlug: "correlation",
    summary:
      "Correlation measures direction and co-movement strength between assets. Beta measures sensitivity to a benchmark's magnitude of moves. They are related but not interchangeable.",
    whenToUsePrimary:
      "Use Beta when assessing benchmark-relative sensitivity and market exposure level.",
    whenToUseSecondary:
      "Use Correlation when evaluating diversification between holdings and concentration of common risk drivers.",
    keyDifferences: [
      {
        label: "Reference",
        primary: "Relative to a benchmark",
        secondary: "Pairwise relationship between two return series",
      },
      {
        label: "Scale sensitivity",
        primary: "Includes magnitude sensitivity",
        secondary: "Scale-free co-movement measure",
      },
      {
        label: "Main use",
        primary: "Systematic risk and CAPM context",
        secondary: "Diversification and overlap diagnosis",
      },
    ],
    pitfalls: [
      "A low Beta does not guarantee low total risk.",
      "High Correlation across holdings can hide inside a multi-position portfolio.",
      "Benchmark choice can distort Beta interpretation.",
    ],
    decisionRule:
      "Use Correlation to build diversification, then check Beta to ensure market sensitivity matches your risk profile.",
    faqs: [
      {
        q: "Can two assets have high correlation but different betas?",
        a: "Yes. They can move together directionally while one moves with larger amplitude relative to the benchmark.",
      },
      {
        q: "Which metric matters more for portfolio construction?",
        a: "Both. Correlation helps choose combinations; Beta helps control aggregate market exposure.",
      },
    ],
  },
];

export function getMetricComparison(slug: string): MetricComparison | undefined {
  return METRIC_COMPARISONS.find((item) => item.slug === slug);
}
