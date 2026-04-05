export interface MetricFAQ {
  q: string;
  a: string;
}

export interface PortivexMetric {
  slug: string;
  name: string;
  shortName: string;
  tagline: string;
  metaDescription: string;
  category: "risk" | "return" | "benchmark" | "distribution";
  accent: string;
  formula: string;
  formulaDescription: string;
  whatItIs: string;
  howToInterpret: string;
  goodRange: { label: string; description: string }[];
  whatAffectsIt: string[];
  howPortivexUses: string;
  faqs: MetricFAQ[];
  related: string[];
}

export const METRICS: PortivexMetric[] = [
  {
    slug: "sharpe-ratio",
    name: "Sharpe Ratio",
    shortName: "Sharpe",
    tagline: "The most widely used measure of risk-adjusted return",
    metaDescription:
      "Learn what the Sharpe Ratio measures, how to interpret it, what counts as a good Sharpe Ratio for your portfolio, and how Portivex uses it.",
    category: "risk",
    accent: "#00f5d4",
    formula: "(Rp − Rf) / σp",
    formulaDescription:
      "where Rp is portfolio return, Rf is the risk-free rate, and σp is the standard deviation of portfolio returns.",
    whatItIs:
      "The Sharpe Ratio measures how much excess return you earn per unit of total risk (volatility). It was developed by Nobel laureate William F. Sharpe and remains the standard benchmark for evaluating whether a portfolio's returns justify the risk taken to achieve them. A higher Sharpe Ratio means you're being compensated better for the volatility you're absorbing.",
    howToInterpret:
      "A Sharpe Ratio above 1.0 is generally considered good — you're earning more than one unit of return for each unit of risk. Below 0 means the portfolio is underperforming the risk-free rate. Most retail portfolios fall between 0.3 and 1.2 over a full market cycle. The ratio is most meaningful when compared to a benchmark or peer group rather than viewed in isolation.",
    goodRange: [
      { label: "< 0", description: "Underperforming risk-free assets — returns don't justify the risk taken" },
      { label: "0 – 0.5", description: "Below average — consider whether concentration or timing is the cause" },
      { label: "0.5 – 1.0", description: "Acceptable — solid for a diversified equity portfolio" },
      { label: "1.0 – 2.0", description: "Good — strong risk-adjusted performance" },
      { label: "> 2.0", description: "Exceptional — rare outside managed funds; verify data quality" },
    ],
    whatAffectsIt: [
      "Asset allocation — highly volatile assets drag the ratio down",
      "Diversification — uncorrelated holdings reduce σp without reducing return",
      "Market regime — the ratio fluctuates significantly across bull and bear markets",
      "Time horizon — shorter windows produce noisier, less reliable readings",
      "Risk-free rate — rising interest rates reduce the numerator",
    ],
    howPortivexUses:
      "Portivex calculates your Sharpe Ratio using daily portfolio returns over your full holding history, benchmarked against the current 3-month gilt yield as the risk-free rate. The confidence tier (Low / Medium / High) reflects how many trading days of data your ratio is based on — readings under 60 days are flagged as Limited. Your investor profile (Conservative / Balanced / Growth) adjusts what counts as a 'Good' Sharpe so the signal is relevant to your actual strategy.",
    faqs: [
      {
        q: "What is a good Sharpe Ratio for a retail investor?",
        a: "Most financial advisors consider 1.0 or above to be good for a retail portfolio. However, context matters — a 0.7 Sharpe on a conservative, bond-heavy portfolio is more impressive than a 1.2 on a highly leveraged one. Always compare against your own benchmark and risk profile.",
      },
      {
        q: "Why does my Sharpe Ratio look different on different platforms?",
        a: "Different platforms use different annualisation methods, risk-free rates, and return calculation windows. Some use monthly returns; others use daily. Portivex uses daily returns with a dynamic risk-free rate, which is more accurate for short-to-medium holding periods.",
      },
      {
        q: "Can the Sharpe Ratio be negative?",
        a: "Yes. A negative Sharpe Ratio means your portfolio returned less than the risk-free rate during that period — you would have been better off in cash or gilts. This is common in bear markets and doesn't necessarily indicate a flawed strategy, but it should prompt a review.",
      },
    ],
    related: ["sortino-ratio", "volatility", "beta", "calmar-ratio"],
  },
  {
    slug: "sortino-ratio",
    name: "Sortino Ratio",
    shortName: "Sortino",
    tagline: "Risk-adjusted return that only penalises downside volatility",
    metaDescription:
      "Understand the Sortino Ratio, how it differs from the Sharpe Ratio, why downside deviation matters, and what a good Sortino Ratio looks like.",
    category: "risk",
    accent: "#bf5af2",
    formula: "(Rp − Rf) / σd",
    formulaDescription:
      "where Rp is portfolio return, Rf is the risk-free rate, and σd is the standard deviation of negative returns only (downside deviation).",
    whatItIs:
      "The Sortino Ratio is a refinement of the Sharpe Ratio that only penalises downside volatility — the bad kind of risk. Upward price swings, while volatile, are not a problem for investors; it's the downside moves that hurt. By using downside deviation in the denominator instead of total standard deviation, the Sortino Ratio gives a more accurate picture of risk for asymmetric return distributions.",
    howToInterpret:
      "The Sortino Ratio is always equal to or higher than the Sharpe Ratio for the same portfolio. A large gap between the two signals that most of your volatility is upside — a positive sign. A Sortino above 1.5 is generally considered strong for a diversified portfolio. Like the Sharpe, it's most useful in comparison — against a benchmark, across time periods, or between portfolio configurations.",
    goodRange: [
      { label: "< 0", description: "Downside returns exceed the risk-free rate — significant concern" },
      { label: "0 – 1.0", description: "Modest — downside risk is eating into your returns" },
      { label: "1.0 – 2.0", description: "Good — downside is well-compensated" },
      { label: "> 2.0", description: "Strong — most volatility is upside; asymmetric return profile" },
    ],
    whatAffectsIt: [
      "Frequency and magnitude of negative return days",
      "Tail protection — stop-losses or hedges directly improve Sortino",
      "Asset selection — some assets have naturally skewed return distributions",
      "Rebalancing frequency — regular rebalancing can cut drawdown events",
    ],
    howPortivexUses:
      "Portivex computes your Sortino Ratio alongside Sharpe so you can compare both in context. A gap between the two indicates asymmetric volatility — useful for diagnosing whether your risk is coming from a few bad days or persistent noise. The confidence tier and investor profile apply the same way as for Sharpe.",
    faqs: [
      {
        q: "When should I use Sortino over Sharpe?",
        a: "Use the Sortino Ratio when your portfolio has a positively skewed return distribution (e.g. growth stocks, momentum strategies) or when you care specifically about protecting against losses rather than smoothing all volatility. Sharpe penalises all volatility equally, which can make high-upside portfolios look worse than they are.",
      },
      {
        q: "Why is my Sortino always higher than my Sharpe?",
        a: "Because Sortino only measures downside deviation in the denominator. If your portfolio has any upside volatility, those moves lower total standard deviation (Sharpe denominator) but don't affect downside deviation (Sortino denominator) — so Sortino will always be ≥ Sharpe.",
      },
      {
        q: "What's the downside deviation threshold?",
        a: "Downside deviation typically uses a threshold (MAR) of the risk-free rate or zero. Portivex uses the risk-free rate as the threshold, meaning only days where your return fell below the risk-free return contribute to the downside deviation.",
      },
    ],
    related: ["sharpe-ratio", "volatility", "maximum-drawdown", "value-at-risk"],
  },
  {
    slug: "beta",
    name: "Beta",
    shortName: "Beta",
    tagline: "How much your portfolio moves relative to the market",
    metaDescription:
      "Learn what Beta measures in a portfolio, how to interpret high and low beta, what it means for your risk exposure, and how Portivex calculates it.",
    category: "benchmark",
    accent: "#ff2d78",
    formula: "Cov(Rp, Rm) / Var(Rm)",
    formulaDescription:
      "where Rp is portfolio return, Rm is market (benchmark) return, Cov is covariance, and Var is variance.",
    whatItIs:
      "Beta measures the sensitivity of your portfolio to market movements. A Beta of 1.0 means your portfolio moves in lockstep with the benchmark. Above 1.0 means you amplify market moves — bigger gains in bull markets, bigger losses in bear markets. Below 1.0 means you're less exposed to market swings. Beta is a cornerstone of the Capital Asset Pricing Model (CAPM) and is central to understanding systematic risk.",
    howToInterpret:
      "Beta tells you about systematic (market) risk, not total risk. A low-beta portfolio is not necessarily a low-risk portfolio — it could have high idiosyncratic risk from concentration. Beta is benchmark-dependent: the same portfolio will have a different Beta against the S&P 500 vs the FTSE All-World. Always check which benchmark is being used.",
    goodRange: [
      { label: "< 0", description: "Inverse correlation with the market — typical of hedged positions or gold" },
      { label: "0 – 0.5", description: "Defensive — moves little with the market; typical of bonds or utilities" },
      { label: "0.5 – 1.0", description: "Moderate — less volatile than the market overall" },
      { label: "1.0", description: "Market-neutral — tracks benchmark closely" },
      { label: "> 1.0", description: "Aggressive — amplifies market moves; higher risk/reward profile" },
    ],
    whatAffectsIt: [
      "Sector allocation — tech tends to be high-beta; utilities low-beta",
      "Geographic diversification — international assets may have lower beta to a UK or US benchmark",
      "Market cap — small caps typically have higher beta than large caps",
      "Leverage — borrowed capital increases beta directly",
      "Benchmark choice — Beta is only meaningful relative to its benchmark",
    ],
    howPortivexUses:
      "Portivex calculates Beta using your portfolio's daily returns against your selected benchmark (default: S&P 500). You can switch the benchmark in the metrics view to see how Beta changes across different reference points. Your investor profile sets the 'expected' Beta range — a Conservative profile flags a Beta above 0.8 as elevated, while Growth profiles expect Beta closer to 1.0.",
    faqs: [
      {
        q: "Is a lower Beta always better?",
        a: "Not necessarily. A lower Beta means less market exposure, but also less potential upside in bull markets. What matters is whether your Beta matches your risk tolerance and investment horizon. A 25-year-old accumulating wealth may want higher Beta than someone approaching retirement.",
      },
      {
        q: "Can Beta be negative?",
        a: "Yes. Assets like gold, certain bonds, or short positions can have negative Beta — they tend to rise when the market falls. A small allocation to negative-Beta assets can reduce overall portfolio Beta and act as a hedge.",
      },
      {
        q: "Why does my Beta change when I switch benchmarks?",
        a: "Beta is a relative measure — it only means something in relation to a specific benchmark. A UK equity portfolio will have a Beta close to 1.0 against the FTSE 100 but potentially much higher or lower against the S&P 500, depending on how correlated UK and US markets have been during your holding period.",
      },
    ],
    related: ["sharpe-ratio", "r-squared", "volatility", "maximum-drawdown"],
  },
  {
    slug: "value-at-risk",
    name: "Value at Risk (VaR)",
    shortName: "VaR 95",
    tagline: "The maximum daily loss you should expect 95% of the time",
    metaDescription:
      "Understand Value at Risk (VaR) — what it measures, how to interpret 95% VaR, its limitations, and how Portivex uses it to quantify your portfolio's downside.",
    category: "risk",
    accent: "#f5a623",
    formula: "μ − 1.645σ (parametric, 95% confidence)",
    formulaDescription:
      "where μ is mean daily return, σ is daily return standard deviation, and 1.645 is the z-score for the 95th percentile of the normal distribution.",
    whatItIs:
      "Value at Risk (VaR) answers a simple question: on a typical bad day, how much could I lose? Specifically, 95% VaR is the loss threshold you'd expect not to exceed on 95% of trading days. If your 95% VaR is −2.1%, there's roughly a 1-in-20 chance of losing more than 2.1% in a single day. VaR is a standard risk metric used by banks, hedge funds, and institutional investors to size positions and set risk limits.",
    howToInterpret:
      "VaR is expressed as a percentage loss (negative number). A 95% VaR of −3% is more concerning than −1% because it implies larger expected tail losses. The number should be read in context of your portfolio size — a −2% VaR on a £50,000 portfolio means a typical bad day could cost £1,000. VaR does not tell you how bad losses get in the extreme 5% — that's where Maximum Drawdown becomes important.",
    goodRange: [
      { label: "0% to −1%", description: "Low — very defensive portfolio; typically bonds or cash-heavy" },
      { label: "−1% to −2%", description: "Moderate — typical of a diversified balanced portfolio" },
      { label: "−2% to −3%", description: "Elevated — concentrated equity exposure or volatile assets" },
      { label: "< −3%", description: "High — significant single-day loss potential; consider diversification" },
    ],
    whatAffectsIt: [
      "Volatility — higher σ directly increases VaR",
      "Concentration — single-stock exposure amplifies tail risk",
      "Correlation — low-correlation holdings reduce portfolio VaR below the weighted average",
      "Leverage — magnifies both mean returns and standard deviation",
      "Fat tails — parametric VaR assumes normality; real returns often have heavier tails",
    ],
    howPortivexUses:
      "Portivex uses parametric (variance-covariance) VaR at the 95% confidence level. This is calculated daily using your full return history. The limitation of parametric VaR — it assumes normally distributed returns — is disclosed in the confidence strip on the metrics page. VaR is displayed as a daily figure so it's directly comparable across different portfolio sizes.",
    faqs: [
      {
        q: "What's the difference between 95% and 99% VaR?",
        a: "99% VaR represents a more extreme loss threshold — the amount you'd expect not to exceed on 99% of days. It's typically 1.4× to 1.8× the 95% VaR for normally distributed returns. Portivex uses 95% because it's more statistically stable with shorter return histories and more commonly used in retail risk management.",
      },
      {
        q: "Does VaR tell me the worst-case loss?",
        a: "No — this is a common misconception. VaR tells you the threshold loss at a given confidence level. Losses beyond that threshold (the tail) can be much larger. For worst-case scenarios, Maximum Drawdown gives you a better picture of how bad actual losses have been in your portfolio's history.",
      },
      {
        q: "Why does my VaR change even when I haven't changed my holdings?",
        a: "VaR is recalculated daily using your rolling return history. As new trading days are added and old ones drop out of the window, the standard deviation changes — so VaR moves even with static holdings. Periods of high market volatility will spike VaR; calm markets will lower it.",
      },
    ],
    related: ["maximum-drawdown", "volatility", "sortino-ratio", "sharpe-ratio"],
  },
  {
    slug: "maximum-drawdown",
    name: "Maximum Drawdown",
    shortName: "Max DD",
    tagline: "The largest peak-to-trough decline in your portfolio's history",
    metaDescription:
      "Learn what Maximum Drawdown (MDD) measures, why it matters for long-term investors, how to interpret your drawdown figure, and how Portivex tracks it.",
    category: "risk",
    accent: "#ff2d78",
    formula: "(Trough Value − Peak Value) / Peak Value",
    formulaDescription:
      "measured as the largest percentage decline from any historical peak to the subsequent lowest point before a new peak is reached.",
    whatItIs:
      "Maximum Drawdown (MDD) measures the worst peak-to-trough loss your portfolio has experienced over its full history. Unlike VaR, which is a statistical estimate, MDD is a historical fact — it actually happened. It captures the psychological and financial reality of holding through a downturn: if your portfolio fell 35% from peak to trough, you had to stomach that loss (on paper) while staying invested.",
    howToInterpret:
      "Maximum Drawdown is always negative (or zero). A smaller absolute value is better. The key question isn't just the magnitude but also the recovery time — how long did it take to return to the previous peak? A −15% drawdown recovered in 3 months is very different from one that took 3 years. MDD is most meaningful in comparison to a benchmark: if your portfolio drew down −20% while the market fell −30%, that's outperformance even though the number looks bad.",
    goodRange: [
      { label: "0% to −10%", description: "Excellent — very defensive or short history; limited downside captured" },
      { label: "−10% to −20%", description: "Good — typical of diversified portfolios through moderate corrections" },
      { label: "−20% to −35%", description: "Elevated — significant drawdown; review concentration and timing" },
      { label: "< −35%", description: "High — severe drawdown; assess whether recovery is realistic" },
    ],
    whatAffectsIt: [
      "Concentration — single holdings can catastrophically drag a portfolio",
      "Market timing — entering at a peak amplifies drawdown on paper",
      "Asset correlation — highly correlated holdings fall together in market stress",
      "Rebalancing — systematic rebalancing can cut the depth of drawdown events",
      "History length — longer holding periods capture more market cycles and tend to show larger MDD",
    ],
    howPortivexUses:
      "Portivex calculates MDD across your full portfolio return history, using daily NAV. The drawdown chart on the performance page shows you the drawdown curve over time — not just the worst point, but every recovery and decline. This helps you see whether drawdowns were isolated events or part of a pattern. Your investor profile determines the threshold at which Portivex flags your MDD as elevated.",
    faqs: [
      {
        q: "Is Maximum Drawdown the same as my biggest loss?",
        a: "Not exactly. MDD measures the largest continuous decline from a peak — it accounts for the full sequence of losses, not a single day. If your portfolio fell 10%, recovered 5%, then fell another 15%, the MDD is not 15% — it depends on whether the second fall brought the total below the first trough.",
      },
      {
        q: "How does MDD relate to risk-adjusted return?",
        a: "MDD feeds into the Calmar Ratio — annual return divided by Maximum Drawdown — which is a popular risk-adjusted metric for trend-following and momentum strategies. A portfolio with high returns but a catastrophic drawdown is far less appealing than one with slightly lower returns and a controlled drawdown.",
      },
      {
        q: "Should I be worried about a large MDD if I'm a long-term investor?",
        a: "It depends on your time horizon and psychology. Long-term investors can mathematically recover from large drawdowns, but the real risk is behavioural — selling at the trough. If your MDD is causing you to consider exiting positions, that's a signal your portfolio's risk level may be above your true tolerance.",
      },
    ],
    related: ["value-at-risk", "calmar-ratio", "volatility", "sortino-ratio"],
  },
  {
    slug: "volatility",
    name: "Portfolio Volatility",
    shortName: "Volatility",
    tagline: "The statistical spread of your portfolio's daily returns",
    metaDescription:
      "Understand portfolio volatility — what annualised standard deviation means, how it differs from risk, why it matters, and how to interpret it for your holdings.",
    category: "risk",
    accent: "#00f5d4",
    formula: "σ × √252",
    formulaDescription:
      "annualised standard deviation of daily portfolio returns, where 252 is the standard number of trading days per year.",
    whatItIs:
      "Volatility — formally the annualised standard deviation of returns — measures how spread out your daily returns are around their average. A highly volatile portfolio has returns that swing dramatically day to day; a low-volatility portfolio moves in a tighter band. Volatility is not the same as risk, but it's a key component: high volatility amplifies both gains and losses and makes planning harder.",
    howToInterpret:
      "Annualised volatility is expressed as a percentage. The FTSE All-World typically runs around 14–16% annualised volatility. Individual equities can be 25–50%. A well-diversified balanced portfolio should sit in the 8–15% range. Volatility above 20% suggests concentrated equity risk or exposure to highly speculative assets. Below 5% typically implies heavy bond/cash allocation.",
    goodRange: [
      { label: "< 5%", description: "Very low — cash-heavy or bond-heavy; limited growth potential" },
      { label: "5% – 10%", description: "Conservative — typical of a balanced fund or defensive equity allocation" },
      { label: "10% – 20%", description: "Moderate — standard for diversified equity portfolios" },
      { label: "20% – 35%", description: "High — concentrated or growth-tilted; high upside and downside" },
      { label: "> 35%", description: "Very high — speculative exposure; review diversification urgently" },
    ],
    whatAffectsIt: [
      "Asset class mix — equities are more volatile than bonds; alternatives vary widely",
      "Sector concentration — tech, biotech, and energy tend to be high-volatility sectors",
      "Geographic diversification — emerging markets add volatility; developed markets dampen it",
      "Number of holdings — beyond 20–25 holdings, additional diversification reduces volatility slowly",
      "Market regime — volatility is itself volatile; it clusters and spikes during crises",
    ],
    howPortivexUses:
      "Portivex displays annualised volatility (σ × √252) computed from your daily return history. It appears in the MetricsGrid alongside Sharpe and Sortino so you can see the risk-return tradeoff at a glance. Volatility is also an input into the VaR calculation — rising volatility will increase your VaR figure in real time. The confidence tier flags when your volatility estimate is based on fewer than 60 trading days of data.",
    faqs: [
      {
        q: "Is high volatility always bad?",
        a: "No. Volatility is symmetric — it captures upside swings as well as downside ones. A growth investor with a long time horizon may be comfortable with 25% annualised volatility if it's associated with strong expected returns. The Sharpe and Sortino Ratios put volatility in the context of return, which is more useful for evaluating whether it's 'worth it'.",
      },
      {
        q: "What's the difference between realised and implied volatility?",
        a: "Portivex calculates realised (historical) volatility — the actual spread of past returns. Implied volatility is derived from options prices and represents the market's expectation of future volatility. Realised volatility is backward-looking; implied is forward-looking. Both are useful, but Portivex focuses on historical realised volatility as it's directly based on your actual holdings.",
      },
      {
        q: "Does adding more holdings always reduce volatility?",
        a: "Up to a point. Diversification reduces idiosyncratic (stock-specific) risk, but systematic (market) risk remains. Beyond roughly 20–30 holdings, additional diversification has diminishing returns on volatility — unless those holdings are truly uncorrelated. Adding more of the same sector or geography does little to reduce portfolio volatility.",
      },
    ],
    related: ["sharpe-ratio", "sortino-ratio", "value-at-risk", "beta"],
  },
  {
    slug: "calmar-ratio",
    name: "Calmar Ratio",
    shortName: "Calmar",
    tagline: "Annual return relative to the worst drawdown you've experienced",
    metaDescription:
      "Learn about the Calmar Ratio — how it measures return per unit of drawdown risk, when to use it, and what it reveals about the quality of your portfolio returns.",
    category: "risk",
    accent: "#bf5af2",
    formula: "CAGR / |Maximum Drawdown|",
    formulaDescription:
      "compound annual growth rate divided by the absolute value of maximum drawdown over the same period.",
    whatItIs:
      "The Calmar Ratio (named after California Managed Accounts Reports) measures how much annualised return you earn per unit of maximum drawdown risk. It answers: is the return worth the worst loss you've had to endure? Unlike the Sharpe Ratio, which uses standard deviation, the Calmar uses maximum drawdown — making it particularly relevant for investors who are sensitive to large, sustained losses rather than day-to-day volatility.",
    howToInterpret:
      "A higher Calmar is better. A ratio above 0.5 is considered reasonable; above 1.0 is strong. The Calmar is especially popular for evaluating hedge funds, managed futures, and trend-following strategies where drawdown control is a core objective. For buy-and-hold equity investors, the Calmar will naturally be lower — equity indices typically show a Calmar of 0.2–0.5 over a full market cycle.",
    goodRange: [
      { label: "< 0.2", description: "Weak — returns poorly compensate for historical drawdown severity" },
      { label: "0.2 – 0.5", description: "Moderate — typical of long-only equity strategies" },
      { label: "0.5 – 1.0", description: "Good — strong return relative to worst observed drawdown" },
      { label: "> 1.0", description: "Excellent — exceptional drawdown-adjusted performance" },
    ],
    whatAffectsIt: [
      "Maximum drawdown depth — a single severe drawdown event permanently lowers the Calmar",
      "Return consistency — steady compounding improves CAGR without increasing MDD",
      "Time horizon — longer histories tend to capture worse drawdowns, suppressing the ratio",
      "Stop-loss discipline — cutting losses early preserves the denominator",
    ],
    howPortivexUses:
      "Portivex shows the Calmar Ratio in the advanced metrics section. Because it depends on Maximum Drawdown, which requires a meaningful return history to be reliable, Portivex flags Calmar readings based on fewer than 90 days as low-confidence. The metric is most useful when comparing two portfolio configurations with similar return targets.",
    faqs: [
      {
        q: "How is the Calmar Ratio different from the Sharpe Ratio?",
        a: "The key difference is the risk denominator. Sharpe uses standard deviation — a measure of typical daily volatility. Calmar uses maximum drawdown — the worst sustained loss you've actually experienced. Calmar is better for investors who can tolerate volatility but not large sustained losses, while Sharpe is more appropriate for those who dislike day-to-day fluctuations.",
      },
      {
        q: "Does a higher Calmar mean I should be taking more risk?",
        a: "Not necessarily. A high Calmar Ratio means your returns have been well-compensated relative to your worst historical drawdown. It doesn't imply you should increase leverage or concentration. It's a quality signal for the risk you've already taken, not a directive to take more.",
      },
      {
        q: "Why is the Calmar Ratio lower for longer holding periods?",
        a: "Because longer holding periods tend to capture larger market cycles and therefore larger maximum drawdowns. A portfolio held through 2020's COVID crash or the 2022 rate shock will show a much larger MDD than one held only through 2023–2024. The CAGR may also be lower, compounding the effect.",
      },
    ],
    related: ["maximum-drawdown", "sharpe-ratio", "sortino-ratio", "volatility"],
  },
  {
    slug: "r-squared",
    name: "R-Squared",
    shortName: "R²",
    tagline: "How much of your portfolio's movement is explained by the benchmark",
    metaDescription:
      "Understand R-Squared in portfolio analysis — what it measures, how to read it alongside Beta, and what it tells you about diversification and benchmark alignment.",
    category: "benchmark",
    accent: "#00f5d4",
    formula: "Corr(Rp, Rm)²",
    formulaDescription:
      "the square of the Pearson correlation coefficient between portfolio returns and benchmark returns.",
    whatItIs:
      "R-Squared measures the percentage of your portfolio's return variability that can be explained by movements in the benchmark. An R² of 0.85 means 85% of your portfolio's day-to-day movement is attributable to the market benchmark. The remaining 15% comes from stock-specific factors. R² ranges from 0 to 1 (or 0% to 100%) and is essential for interpreting Beta correctly.",
    howToInterpret:
      "R² is a context metric — it validates whether other metrics like Beta are meaningful. A Beta of 1.2 with an R² of 0.9 is highly informative: 90% of your returns are benchmark-driven, so Beta is a reliable predictor. A Beta of 1.2 with an R² of 0.3 is nearly meaningless: only 30% of your returns track the benchmark, so Beta doesn't tell you much about your actual risk exposure.",
    goodRange: [
      { label: "0 – 0.3", description: "Low — portfolio is largely independent of the benchmark" },
      { label: "0.3 – 0.7", description: "Moderate — partial benchmark tracking; significant idiosyncratic exposure" },
      { label: "0.7 – 0.9", description: "High — portfolio closely mirrors the benchmark" },
      { label: "> 0.9", description: "Very high — near-index tracking; limited active management value" },
    ],
    whatAffectsIt: [
      "Number of holdings — more holdings increases correlation to the broad market",
      "Benchmark selection — R² changes dramatically with benchmark choice",
      "Sector/geographic concentration — concentration reduces R²",
      "Active vs passive strategy — index funds will approach R² = 1.0",
    ],
    howPortivexUses:
      "Portivex shows R² alongside Beta so you can assess whether your Beta figure is statistically meaningful. It's also used to determine benchmark overlap days — a key input in the confidence tier calculation. When R² is below 0.5, Portivex surfaces a note that Beta should be interpreted with caution.",
    faqs: [
      {
        q: "What does a low R-Squared mean for my portfolio?",
        a: "A low R² means your portfolio returns are largely driven by factors other than the benchmark — specific stocks, sectors, or alternative assets. This can be intentional (active stock-picking) or unintentional (concentrated bet on one sector). It also means your Beta figure is less reliable as a measure of market risk.",
      },
      {
        q: "Is a high R-Squared good or bad?",
        a: "Neither inherently. A high R² means your portfolio closely tracks the benchmark. This is great for passive investors who want market exposure with low tracking error. For active managers, a high R² might suggest you're paying for active management while getting near-passive results — so-called 'closet indexing'.",
      },
      {
        q: "How is R-Squared related to Alpha?",
        a: "Alpha measures excess return above what Beta and R² would predict. For Alpha to be meaningful, R² must be high enough that the model (Beta × market return) is actually explaining most of your return variation. With a low R², the 'Alpha' figure absorbs too much unexplained variance to be trusted.",
      },
    ],
    related: ["beta", "sharpe-ratio", "volatility", "maximum-drawdown"],
  },
  {
    slug: "alpha",
    name: "Alpha",
    shortName: "Alpha",
    tagline: "Return generated above and beyond what the market explains",
    metaDescription:
      "Learn what Alpha means in portfolio management, how Jensen's Alpha is calculated, whether your Alpha is statistically meaningful, and how to improve it.",
    category: "benchmark",
    accent: "#f5a623",
    formula: "Rp − [Rf + β(Rm − Rf)]",
    formulaDescription:
      "portfolio return minus the expected return predicted by CAPM — i.e., the risk-free rate plus Beta times the market risk premium.",
    whatItIs:
      "Alpha (Jensen's Alpha) measures the excess return your portfolio generates above what the Capital Asset Pricing Model (CAPM) would predict given its level of market risk (Beta). A positive Alpha means you're outperforming on a risk-adjusted basis — your stock selection or timing has added value above and beyond what market exposure alone would explain. Negative Alpha means you're underperforming the risk-adjusted benchmark.",
    howToInterpret:
      "Alpha is expressed as a percentage return. An Alpha of +3% means your portfolio returned 3% more per year than CAPM would predict given its Beta. This sounds attractive, but statistical significance requires a long track record — a few months of positive Alpha may be luck. Alpha is most meaningful over 3–5 years with high R². A high-Alpha, high-R² portfolio is genuinely adding value above market exposure.",
    goodRange: [
      { label: "< −2%", description: "Significant underperformance — fees, poor timing, or selection are hurting returns" },
      { label: "−2% to 0%", description: "Slightly below benchmark on a risk-adjusted basis" },
      { label: "0% to 2%", description: "Marginal outperformance — could be skill or short-term luck" },
      { label: "> 2%", description: "Meaningful outperformance — significant if sustained over 2+ years with high R²" },
    ],
    whatAffectsIt: [
      "Stock selection — picking assets that outperform their risk-adjusted expectation",
      "Market timing — entering and exiting positions well",
      "Fees and costs — transaction costs directly erode Alpha",
      "Beta accuracy — a poorly calibrated Beta distorts the Alpha calculation",
      "Benchmark choice — changing the benchmark changes Alpha significantly",
    ],
    howPortivexUses:
      "Portivex surfaces Alpha as part of the advanced benchmark metrics alongside R² and Beta. Because Alpha requires sufficient R² to be meaningful, Portivex flags Alpha when R² is below 0.5 — indicating the CAPM model isn't fitting your portfolio well enough for Alpha to be reliable. Like all metrics, confidence tiers apply.",
    faqs: [
      {
        q: "Can retail investors consistently generate positive Alpha?",
        a: "Academic research suggests it's extremely difficult over the long run. Most actively managed funds fail to beat their benchmark after fees. Retail investors face additional headwinds: higher per-trade costs, less access to information, and behavioural biases. Positive Alpha over 1–2 years is likely noise; over 5+ years with high R², it's worth paying attention to.",
      },
      {
        q: "Why does my Alpha change when I change the benchmark?",
        a: "Because Alpha is defined as the return above what the chosen benchmark-and-Beta model predicts. A portfolio that looks like +5% Alpha against a UK small-cap benchmark might show −2% Alpha against the MSCI World. Always specify the benchmark when quoting Alpha.",
      },
      {
        q: "Is Alpha the same as outperformance?",
        a: "Not exactly. Simple outperformance is just 'my portfolio returned more than the index'. Alpha is risk-adjusted outperformance — it strips out the contribution of market Beta. A portfolio that returned 20% in a year when the market returned 18% looks like 2% outperformance. But if that portfolio had a Beta of 1.3 and the market was up 18%, CAPM would expect it to return 23.4% — meaning the Alpha is actually negative.",
      },
    ],
    related: ["beta", "sharpe-ratio", "r-squared", "sortino-ratio"],
  },
];

export function getMetric(slug: string): PortivexMetric | undefined {
  return METRICS.find((m) => m.slug === slug);
}

export function getRelatedMetrics(metric: PortivexMetric): PortivexMetric[] {
  return metric.related
    .map((slug) => METRICS.find((m) => m.slug === slug))
    .filter((m): m is PortivexMetric => m !== undefined);
}
