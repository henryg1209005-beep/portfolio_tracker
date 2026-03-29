import requests
import yfinance as yf
import pandas as pd

BENCHMARK        = "^GSPC"
RISK_FREE_TICKER = "^IRX"   # 13-week T-bill
GBPUSD_TICKER    = "GBPUSD=X"
GBPEUR_TICKER    = "GBPEUR=X"

# Cache LSE ticker currencies so we only call yfinance once per session
_lse_currency_cache: dict = {}

# Known LSE-listed tickers that need a .L suffix on Yahoo Finance
_LSE_KNOWN = {
    # Vanguard / iShares / BlackRock ETFs
    "VFEM", "VUSA", "HUKX", "VWRL", "VEVE", "VUAG", "VHVG", "VUKE",
    "VGOV", "VVAL", "VMID", "VFEM", "VERX", "VAGP", "VAGS",
    "ISF",  "IUSA", "IWRD", "IEMA", "IUKD", "IUKP", "IGLT", "SLXX",
    "CSPX", "SWLD", "HMWO", "INRG", "CORP", "IGLS",
    # FTSE 100 blue chips
    "SHEL", "BP",   "HSBA", "LLOY", "BARC", "GSK",  "AZN",  "ULVR",
    "DGE",  "REL",  "NG",   "RIO",  "AAL",  "BHP",  "GLEN", "ANTO",
    "NWG",  "STAN", "LGEN", "PHNX", "AVV",  "PRU",  "HLMA", "IMB",
    "BATS", "BTI",  "VOD",  "BT",   "SKY",  "ITV",  "WPP",  "PUB",
    "EXPN", "RELX", "LSEG", "ICG",  "MNG",  "ABDN", "JUP",  "SCHO",
    "SGE",  "AUTO", "MKS",  "NEXT", "JD",   "FRAS", "SPX",  "KGF",
    "TSCO", "SBRY", "MRW",  "OCO",  "OCDO", "DCC",  "CRH",  "SMDS",
    "RKT",  "BDEV", "PSN",  "TW",   "BWY",  "BKG",  "CRDA", "ECM",
    "FRES", "HOC",  "CEY",  "SLP",  "POG",  "CAML",
    # FTSE 250 / popular mid-caps
    "SMT",  "FCSS", "RBTX", "PCT",  "ATT",  "MNKS", "EWI",  "BRIG",
    "THRG", "SSON", "ELM",  "HGT",  "IPAY", "AUGM", "BRWM",
    "III",  "MERI", "RCP",  "GRIO", "HICL", "INPP", "TRIG", "BSIF",
    "UKW",  "NESF", "GRID", "ORIT",
}


def resolve_ticker(ticker):
    """
    Return the Yahoo Finance symbol for a given ticker.
    Appends .L for known LSE tickers, or tries .L if the bare ticker fails.
    """
    if ticker.endswith(".L"):
        return ticker
    if ticker in _LSE_KNOWN:
        return ticker + ".L"
    return ticker


def _lse_get_currency(sym: str) -> str:
    """
    Return the currency code for a .L ticker: 'GBp' (pence) or 'GBP' (pounds).
    Uses fast_info for a lightweight check; caches the result per session.
    """
    if sym in _lse_currency_cache:
        return _lse_currency_cache[sym]
    cur = "GBp"  # safe default – most LSE tickers quote in pence
    try:
        fi = yf.Ticker(sym).fast_info
        # fast_info supports both attribute and dict access depending on version
        try:
            cur = fi["currency"]
        except (KeyError, TypeError):
            cur = getattr(fi, "currency", "GBp")
    except Exception:
        pass
    _lse_currency_cache[sym] = cur
    return cur


def _lse_price_to_gbp(sym: str, price: float) -> float:
    """
    Convert an LSE (.L) price to GBP.
    yfinance inconsistently reports currency as 'GBp' (pence) or 'GBP' (pounds).
    As a sanity check: if the raw price exceeds 500, it is almost certainly in
    pence regardless of what the currency field says — no common UK ETF or stock
    trades above £500 per share in real GBP terms.
    """
    cur = _lse_get_currency(sym)
    if cur == "GBp" or price > 500:
        return price / 100
    return price


def _extract_close(data, ticker=None):
    """Safely extract Close prices from a yfinance DataFrame."""
    if data is None or data.empty:
        return pd.Series(dtype=float)
    try:
        if isinstance(data.columns, pd.MultiIndex):
            if ticker and ("Close", ticker) in data.columns:
                return data[("Close", ticker)].dropna()
            close_cols = [c for c in data.columns if c[0] == "Close"]
            if close_cols:
                return data[close_cols[0]].dropna()
        else:
            if "Close" in data.columns:
                return data["Close"].dropna()
    except Exception:
        pass
    return pd.Series(dtype=float)


def fetch_gbp_usd_rate():
    """Fetch current GBP/USD exchange rate."""
    # Method 1: yf.Ticker (more reliable for FX)
    try:
        hist = yf.Ticker(GBPUSD_TICKER).history(period="5d")
        if not hist.empty:
            rate = float(hist["Close"].iloc[-1])
            if 1.0 < rate < 2.0:   # sanity check
                return rate
    except Exception:
        pass

    # Method 2: yf.download fallback
    try:
        data  = yf.download(GBPUSD_TICKER, period="5d", auto_adjust=True, progress=False)
        close = _extract_close(data, GBPUSD_TICKER)
        if not close.empty:
            rate = float(close.iloc[-1])
            if 1.0 < rate < 2.0:
                return rate
    except Exception:
        pass

    # Method 3: try alternative ticker
    try:
        hist = yf.Ticker("GBP=X").history(period="5d")
        if not hist.empty:
            rate = float(hist["Close"].iloc[-1])
            if 1.0 < rate < 2.0:
                return rate
    except Exception:
        pass

    return 1.34  # Updated fallback (approx Mar 2026)


def fetch_gbp_eur_rate():
    """Fetch current GBP/EUR exchange rate."""
    try:
        hist = yf.Ticker(GBPEUR_TICKER).history(period="5d")
        if not hist.empty:
            rate = float(hist["Close"].iloc[-1])
            if 1.0 < rate < 1.5:   # sanity check
                return rate
    except Exception:
        pass
    try:
        data  = yf.download(GBPEUR_TICKER, period="5d", auto_adjust=True, progress=False)
        close = _extract_close(data, GBPEUR_TICKER)
        if not close.empty:
            rate = float(close.iloc[-1])
            if 1.0 < rate < 1.5:
                return rate
    except Exception:
        pass
    return 1.17  # fallback (approx Mar 2026)


def search_tickers(query):
    """Search Yahoo Finance for tickers matching the query."""
    if not query:
        return []
    try:
        url = "https://query1.finance.yahoo.com/v1/finance/search"
        params = {"q": query, "quotesCount": 8, "newsCount": 0, "enableFuzzyQuery": True}
        headers = {"User-Agent": "Mozilla/5.0"}
        r = requests.get(url, params=params, headers=headers, timeout=5)
        results = []
        for q in r.json().get("quotes", []):
            symbol = q.get("symbol", "")
            name   = q.get("longname") or q.get("shortname") or ""
            qtype  = q.get("quoteType", "")
            if symbol:
                results.append({"symbol": symbol, "name": name, "type": qtype})
        return results
    except Exception:
        return []


def validate_ticker(ticker):
    """Return True if the ticker exists and has price data."""
    sym = resolve_ticker(ticker)
    try:
        data = yf.download(sym, period="5d", auto_adjust=True, progress=False)
        return not _extract_close(data, sym).empty
    except Exception:
        return False


def fetch_current_prices(tickers, gbpusd=None):
    """
    Fetch current prices in GBP.
    USD-denominated prices are converted using the live GBP/USD rate.
    Prices already in GBP pence (LSE .L tickers) are divided by 100.
    """
    if gbpusd is None:
        gbpusd = fetch_gbp_usd_rate()

    prices = {}
    for ticker in tickers:
        sym = resolve_ticker(ticker)
        try:
            data  = yf.download(sym, period="2d", auto_adjust=True, progress=False)
            close = _extract_close(data, sym)
            if close.empty:
                prices[ticker] = None
                continue

            price = float(close.iloc[-1])

            # Sanity check: flag if raw price moves >50% in one session
            # (catches unit-change bugs like pence↔GBP switching)
            if len(close) >= 2:
                prev = float(close.iloc[-2])
                if prev > 0:
                    ratio = price / prev
                    if ratio < 0.5 or ratio > 2.0:
                        print(
                            f"PRICE WARNING [{sym}]: raw price moved "
                            f"{(ratio-1):+.0%} in one session "
                            f"({prev:.4f} → {price:.4f}). "
                            "Check for unit change in yfinance data."
                        )

            if sym.endswith(".L"):
                price = _lse_price_to_gbp(sym, price)
            else:
                # Assume USD → convert to GBP
                price = price / gbpusd

            prices[ticker] = price
        except Exception:
            prices[ticker] = None

    return prices


def fetch_gbpusd_history(period: str = "1y") -> pd.Series:
    """Fetch historical GBP/USD daily closing rates as a Series (indexed by date)."""
    try:
        data  = yf.download(GBPUSD_TICKER, period=period, auto_adjust=True, progress=False)
        close = _extract_close(data, GBPUSD_TICKER)
        if not close.empty:
            if getattr(close.index, "tz", None) is not None:
                close.index = close.index.tz_localize(None)
            return close
    except Exception:
        pass
    return pd.Series(dtype=float)


def fetch_historical_data(tickers, period="1y", start=None, gbpusd_series=None):
    """
    Fetch historical closing prices normalised to GBP.

    Pass start (a date string "YYYY-MM-DD") to fetch from a specific date instead
    of using the period shorthand — used to align metrics with the user's actual
    holding period rather than an arbitrary trailing window.

    Pass gbpusd_series (a pd.Series of daily GBP/USD rates) to correctly
    convert USD-denominated tickers to GBP using the rate on each day.
    """
    frames = {}
    for ticker in tickers:
        sym = resolve_ticker(ticker)
        try:
            if start:
                data = yf.download(sym, start=start, auto_adjust=True, progress=False)
            else:
                data = yf.download(sym, period=period, auto_adjust=True, progress=False)
            close = _extract_close(data, sym)
            if close.empty:
                continue

            if sym.endswith(".L"):
                # Use same heuristic as spot prices: price > 500 = pence
                cur = _lse_get_currency(sym)
                if cur == "GBp" or (close.max() > 500):
                    close = close / 100      # pence → GBP
                # else: already in GBP
            elif gbpusd_series is not None and not gbpusd_series.empty:
                aligned = gbpusd_series.reindex(close.index, method="ffill")
                close   = close / aligned    # USD → GBP (historical rate)
            else:
                gbpusd = fetch_gbp_usd_rate()
                close  = close / gbpusd      # USD → GBP (spot rate fallback)

            frames[ticker] = close
        except Exception:
            pass

    if not frames:
        return pd.DataFrame()
    return pd.DataFrame(frames).dropna(how="all")


def fetch_benchmark_data(period="1y", start=None):
    """Fetch S&P 500 in GBP terms."""
    try:
        if start:
            sp_data = yf.download(BENCHMARK,     start=start, auto_adjust=True, progress=False)
            fx_data = yf.download(GBPUSD_TICKER, start=start, auto_adjust=True, progress=False)
        else:
            sp_data = yf.download(BENCHMARK,     period=period, auto_adjust=True, progress=False)
            fx_data = yf.download(GBPUSD_TICKER, period=period, auto_adjust=True, progress=False)

        sp_close = _extract_close(sp_data, BENCHMARK)
        fx_close = _extract_close(fx_data, GBPUSD_TICKER)

        if sp_close.empty:
            return pd.Series(dtype=float)

        if not fx_close.empty:
            fx_aligned = fx_close.reindex(sp_close.index, method="ffill")
            return (sp_close / fx_aligned).dropna()

        return (sp_close / fetch_gbp_usd_rate()).dropna()
    except Exception as e:
        print(f"Error fetching benchmark: {e}")
        return pd.Series(dtype=float)


def fetch_risk_free_rate():
    """
    Fetch annualised risk-free rate for a GBP portfolio.
    Tries UK 10-year Gilt yield first, falls back to UK base rate.
    """
    # UK 10-year Gilt (most liquid UK government bond benchmark)
    for ticker in ("^GUKG10", "GBGB10YR=RR"):
        try:
            hist = yf.Ticker(ticker).history(period="5d")
            if not hist.empty:
                rate = float(hist["Close"].iloc[-1]) / 100
                if 0.01 < rate < 0.15:   # sanity check: 1%–15%
                    return rate
        except Exception:
            continue
    return 0.0425  # Fallback: approx UK base rate as of early 2026
