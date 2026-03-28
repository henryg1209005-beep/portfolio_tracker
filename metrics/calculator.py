import numpy as np
import pandas as pd

TRADING_DAYS = 252


def _portfolio_returns(prices_df, weights, first_buy_dates=None):
    """
    Compute weighted daily portfolio returns.

    first_buy_dates: dict {ticker: "YYYY-MM-DD"} — returns before a ticker's
    first buy date are set to 0 (position didn't exist yet).
    """
    returns = prices_df.pct_change()

    # Zero out returns before each ticker's first purchase date (fix phantom history)
    if first_buy_dates:
        for ticker in returns.columns:
            if ticker in first_buy_dates:
                buy_date = pd.Timestamp(first_buy_dates[ticker])
                returns.loc[returns.index < buy_date, ticker] = 0.0

    # Fill any remaining NaN (e.g. first row after pct_change, missing data) with 0
    returns = returns.fillna(0)

    tickers = [t for t in weights if t in returns.columns]
    if not tickers:
        return pd.Series(dtype=float)

    w = np.array([weights[t] for t in tickers], dtype=float)
    w /= w.sum()

    port = returns[tickers].values @ w
    return pd.Series(port, index=returns.index)


def sharpe_ratio(port_returns, rf_annual):
    daily_rf = rf_annual / TRADING_DAYS
    excess = port_returns - daily_rf
    std = excess.std()
    if std == 0:
        return 0.0
    return float(excess.mean() / std * np.sqrt(TRADING_DAYS))


def beta(port_returns, bench_returns):
    aligned = pd.concat([port_returns, bench_returns], axis=1).dropna()
    if len(aligned) < 30:
        return None
    aligned.columns = ["p", "b"]
    cov = aligned.cov()
    var_b = cov.loc["b", "b"]
    return float(cov.loc["p", "b"] / var_b) if var_b != 0 else None


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
    return float(np.percentile(port_returns, (1 - confidence) * 100))


def max_drawdown(port_returns):
    cumulative = (1 + port_returns).cumprod()
    rolling_max = cumulative.cummax()
    drawdown = (cumulative - rolling_max) / rolling_max
    return float(drawdown.min())


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
    port_ret = _portfolio_returns(prices_df, weights, first_buy_dates)
    if port_ret.empty or len(port_ret) < 30:
        return None

    bench_ret = benchmark_series.pct_change().dropna()

    # Align on common dates
    bench_ret = bench_ret.reindex(port_ret.index).fillna(0)
    port_ret  = port_ret.reindex(bench_ret.index)

    if len(port_ret) < 30:
        return None

    # Geometric annualised return (compound, not arithmetic)
    actual_ret = _annualised_geometric(port_ret)
    vol    = volatility(port_ret)
    sharpe = sharpe_ratio(port_ret, rf_annual)
    b      = beta(port_ret, bench_ret)
    capm_ret = capm_return(b, rf_annual, bench_ret) if b is not None else None
    alpha  = (actual_ret - capm_ret) if capm_ret is not None else None
    var    = value_at_risk(port_ret)
    mdd    = max_drawdown(port_ret)

    port_cum  = (1 + port_ret).cumprod() - 1
    bench_cum = (1 + bench_ret).cumprod() - 1

    return {
        "actual_return":          actual_ret,
        "volatility":             vol,
        "sharpe_ratio":           sharpe,
        "beta":                   b,
        "capm_expected_return":   capm_ret,
        "alpha":                  alpha,
        "var_95":                 var,
        "max_drawdown":           mdd,
        "portfolio_cumulative":   port_cum,
        "benchmark_cumulative":   bench_cum,
    }
