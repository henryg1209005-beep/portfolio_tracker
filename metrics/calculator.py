import numpy as np
import pandas as pd

TRADING_DAYS = 252
MIN_BENCHMARK_OVERLAP_DAYS = 15


def _strip_tz_index(series: pd.Series) -> pd.Series:
    """
    Normalise DatetimeIndex timezone handling before joins.

    yfinance can return tz-aware or tz-naive indices depending on ticker and
    endpoint. Mixing them causes concat/join alignment to silently fail,
    collapsing benchmark-overlap days and making beta unavailable.
    """
    if isinstance(series.index, pd.DatetimeIndex) and series.index.tz is not None:
        series = series.copy()
        series.index = series.index.tz_localize(None)
    return series


def _portfolio_returns(prices_df, weights, first_buy_dates=None):
    """
    Compute weighted daily portfolio returns with dynamic per-day weights.

    first_buy_dates: dict {ticker: "YYYY-MM-DD"} — returns before a ticker's
    first buy date are set to NaN (position didn't exist yet). Weights are
    re-normalised each day across only the tickers that were held, so recently
    added positions don't dilute metrics with phantom zero-return days.
    """
    returns = prices_df.pct_change()

    # Mark pre-buy returns as NaN (not 0) — they should not participate at all
    if first_buy_dates:
        for ticker in returns.columns:
            if ticker in first_buy_dates:
                buy_date = pd.Timestamp(first_buy_dates[ticker])
                returns.loc[returns.index < buy_date, ticker] = np.nan

    tickers = [t for t in weights if t in returns.columns]
    if not tickers:
        return pd.Series(dtype=float)

    w_raw = np.array([weights[t] for t in tickers], dtype=float)
    ret_sub = returns[tickers]

    # Dynamic weighting: on each day, re-normalise weights across only
    # the tickers that have valid (non-NaN) returns.
    # Days where NO ticker has a valid return are skipped entirely —
    # inserting 0.0 would create phantom zero-return days that lower
    # return std and artificially inflate Sharpe on some fetches.
    port_vals = []
    port_idx  = []
    for i in range(len(ret_sub)):
        row  = ret_sub.iloc[i].values
        mask = ~np.isnan(row)
        if not mask.any():
            continue
        w_day = w_raw[mask]
        w_day = w_day / w_day.sum()
        port_vals.append(np.nansum(row[mask] * w_day))
        port_idx.append(ret_sub.index[i])

    return pd.Series(port_vals, index=port_idx)


def sharpe_ratio(port_returns, rf_annual):
    daily_rf = rf_annual / TRADING_DAYS
    excess = port_returns - daily_rf
    std = excess.std()
    if std == 0:
        return 0.0
    return float(excess.mean() / std * np.sqrt(TRADING_DAYS))


def sortino_ratio(port_returns, rf_annual):
    """Sortino ratio — like Sharpe but only penalises downside volatility."""
    daily_rf = rf_annual / TRADING_DAYS
    excess = port_returns - daily_rf
    downside = excess[excess < 0]
    if len(downside) == 0:
        return float("inf") if excess.mean() > 0 else 0.0
    downside_std = np.sqrt((downside ** 2).mean())
    if downside_std == 0:
        return 0.0
    return float(excess.mean() / downside_std * np.sqrt(TRADING_DAYS))


def beta(port_returns, bench_returns):
    aligned = pd.concat([port_returns, bench_returns], axis=1)
    aligned = aligned.replace([np.inf, -np.inf], np.nan).dropna()
    if len(aligned) < MIN_BENCHMARK_OVERLAP_DAYS:
        return None
    p = aligned.iloc[:, 0].astype(float).to_numpy()
    b = aligned.iloc[:, 1].astype(float).to_numpy()
    var_b = float(np.var(b, ddof=1))
    if not np.isfinite(var_b) or var_b <= 1e-12:
        return 0.0
    cov_pb = float(np.cov(p, b, ddof=1)[0, 1])
    beta_val = cov_pb / var_b
    return float(beta_val) if np.isfinite(beta_val) else None


def _annualised_geometric(daily_returns: pd.Series) -> float:
    """Compound (geometric) annualised return from a series of daily returns."""
    n = len(daily_returns)
    if n == 0:
        return 0.0
    return float((1 + daily_returns).prod() ** (TRADING_DAYS / n) - 1)


def capm_return(beta_val, rf_annual, bench_returns_daily):
    market_ret = _annualised_geometric(bench_returns_daily)
    return rf_annual + beta_val * (market_ret - rf_annual)


def volatility(port_returns):
    return float(port_returns.std() * np.sqrt(TRADING_DAYS))


def value_at_risk(port_returns, confidence=0.95):
    """Historical VaR — raw percentile of observed daily returns."""
    return float(np.percentile(port_returns, (1 - confidence) * 100))


def cornish_fisher_var(port_returns, confidence=0.95):
    """
    Parametric VaR adjusted for skewness and kurtosis (Cornish-Fisher expansion).
    More accurate than Gaussian VaR when returns have fat tails.
    """
    z = -1.6449  # 5th percentile of standard normal
    mu = float(port_returns.mean())
    sigma = float(port_returns.std())
    if sigma == 0:
        return 0.0

    s = float(port_returns.skew())        # skewness
    k = float(port_returns.kurtosis())    # excess kurtosis

    # Cornish-Fisher adjusted z-score
    z_cf = (z
            + (z**2 - 1) * s / 6
            + (z**3 - 3*z) * k / 24
            - (2*z**3 - 5*z) * s**2 / 36)

    return float(mu + z_cf * sigma)


def max_drawdown(port_returns):
    cumulative = (1 + port_returns).cumprod()
    rolling_max = cumulative.cummax()
    drawdown = (cumulative - rolling_max) / rolling_max
    return float(drawdown.min())


def drawdown_recovery_days(port_returns):
    """
    Return the number of trading days from the max-drawdown trough back to
    the previous peak. Returns None if still in drawdown (hasn't recovered).
    """
    cumulative = (1 + port_returns).cumprod()
    rolling_max = cumulative.cummax()
    drawdown = (cumulative - rolling_max) / rolling_max

    trough_idx = drawdown.idxmin()
    trough_pos = cumulative.index.get_loc(trough_idx)

    # Look forward from trough for recovery (cumulative >= rolling_max at trough)
    peak_before = rolling_max.iloc[trough_pos]
    after_trough = cumulative.iloc[trough_pos:]
    recovered = after_trough[after_trough >= peak_before]

    if recovered.empty:
        # Still in drawdown — return negative days since trough
        return -(len(cumulative) - 1 - trough_pos)

    recovery_idx = recovered.index[0]
    recovery_pos = cumulative.index.get_loc(recovery_idx)
    return int(recovery_pos - trough_pos)


def calculate_all_metrics(prices_df, weights, benchmark_series, rf_annual,
                          first_buy_dates=None):
    """
    Calculate all portfolio metrics.

    Parameters
    ----------
    prices_df        : DataFrame, historical closing prices (columns = tickers)
    weights          : dict {ticker: cost-basis value} — normalised internally
    benchmark_series : Series, historical S&P 500 closing prices
    rf_annual        : float, annualised risk-free rate (e.g. 0.045)
    first_buy_dates  : dict {ticker: "YYYY-MM-DD"} — masks phantom history

    Returns dict or None if insufficient data.
    """
    port_ret_full = _portfolio_returns(prices_df, weights, first_buy_dates)
    if port_ret_full.empty or len(port_ret_full) < 30:
        return None
    port_ret_full = _strip_tz_index(port_ret_full)
    # Institutional convention: compute absolute risk metrics on a fixed
    # trailing 1Y window (252 trading days) to avoid age-dependent noise.
    port_ret_1y = port_ret_full.iloc[-TRADING_DAYS:]

    # Winsorise at ±5 standard deviations to neutralise bad yfinance price
    # ticks that create phantom outlier return days. Genuine market moves
    # rarely exceed 4-5 sigma; data feed errors frequently do.
    _mean, _std = port_ret_1y.mean(), port_ret_1y.std()
    if _std > 0:
        port_ret_1y = port_ret_1y.clip(
            lower=_mean - 5 * _std,
            upper=_mean + 5 * _std,
        )

    bench_ret_full = benchmark_series.pct_change().dropna()
    bench_ret_full = _strip_tz_index(bench_ret_full)

    # Strict overlap is used for benchmark-relative metrics only (beta/alpha/CAPM).
    aligned = pd.concat([port_ret_full, bench_ret_full], axis=1, join="inner").dropna()
    aligned.columns = ["p", "b"]
    port_ret_overlap = aligned["p"]
    bench_ret_overlap = aligned["b"]

    # Geometric annualised return (compound, not arithmetic)
    # Full-history return shown to user as their actual P&L since inception.
    # A separate 1Y window return is used for alpha so both sides of the
    # calculation share the same horizon.
    actual_ret    = _annualised_geometric(port_ret_full)
    actual_ret_1y = _annualised_geometric(port_ret_1y)
    vol    = volatility(port_ret_1y)
    sharpe = sharpe_ratio(port_ret_1y, rf_annual)
    sortino = sortino_ratio(port_ret_1y, rf_annual)

    b = None
    capm_ret = None
    if len(aligned) >= MIN_BENCHMARK_OVERLAP_DAYS:
        b = beta(port_ret_overlap, bench_ret_overlap)
        capm_ret = capm_return(b, rf_annual, bench_ret_overlap) if b is not None else None

    alpha  = (actual_ret_1y - capm_ret) if capm_ret is not None else None
    var    = value_at_risk(port_ret_1y)
    cf_var = cornish_fisher_var(port_ret_1y)
    mdd    = max_drawdown(port_ret_1y)
    dd_recovery = drawdown_recovery_days(port_ret_1y)

    port_cum  = (1 + port_ret_full).cumprod() - 1
    bench_cum = (1 + bench_ret_overlap).cumprod() - 1 if len(aligned) > 0 else pd.Series(dtype=float)

    return {
        "actual_return":          actual_ret,
        "volatility":             vol,
        "sharpe_ratio":           sharpe,
        "sortino_ratio":          sortino,
        "beta":                   b,
        "capm_expected_return":   capm_ret,
        "alpha":                  alpha,
        "var_95":                 var,
        "var_95_cf":              cf_var,
        "max_drawdown":           mdd,
        "drawdown_recovery_days": dd_recovery,
        "sample_days":            int(len(port_ret_full)),
        "benchmark_overlap_days": int(len(aligned)),
        "window_years_equivalent": float(len(port_ret_full) / TRADING_DAYS),
        "portfolio_cumulative":   port_cum,
        "benchmark_cumulative":   bench_cum,
    }
