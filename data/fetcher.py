import time
import requests
import yfinance as yf
import pandas as pd

GBPUSD_TICKER    = "GBPUSD=X"
GBPEUR_TICKER    = "GBPEUR=X"

# Benchmarks — user-selectable
BENCHMARKS = {
    "sp500": "^GSPC",
    "ftse100": "^FTSE",
    "msci_world": "URTH",
}
DEFAULT_BENCHMARK = "sp500"

# ── Price cache ───────────────────────────────────────────────────────────────
# Stores (price_in_gbp, fetched_at_timestamp) per resolved symbol.
# Prices are reused for PRICE_CACHE_TTL seconds before re-fetching.
# This prevents hammering yfinance on every refresh and reduces the chance
# of a transient bad response affecting the user's session.

PRICE_CACHE_TTL: int = 300  # 5 minutes
_price_cache: dict[str, tuple[float, float]] = {}  # sym → (price, timestamp)

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
    Not cached — caching caused wrong values to persist for the entire Railway
    process lifetime, producing intermittent 100x price overstatement.
    """
    cur = "GBp"  # safe default – most LSE tickers quote in pence
    try:
        fi = yf.Ticker(sym).fast_info
        try:
            cur = fi["currency"]
        except (KeyError, TypeError):
            cur = getattr(fi, "currency", "GBp")
    except Exception:
        pass
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
    - LSE (.L) tickers: use fast_info for BOTH price and currency so they are
      always internally consistent — eliminates the mismatch between yf.download()
      and a separate fast_info currency call that caused intermittent 100x overstatement.
    - USD-denominated prices are converted using the live GBP/USD rate.
    """
    if gbpusd is None:
        gbpusd = fetch_gbp_usd_rate()

    now = time.time()
    prices = {}
    for ticker in tickers:
        sym = resolve_ticker(ticker)

        # Return cached price if still fresh
        cached = _price_cache.get(sym)
        if cached is not None:
            cached_price, fetched_at = cached
            if now - fetched_at < PRICE_CACHE_TTL:
                prices[ticker] = cached_price
                continue

        try:
            if sym.endswith(".L"):
                # fast_info gives price + currency from the same API call → always consistent
                fi = yf.Ticker(sym).fast_info
                try:
                    raw_price = fi["last_price"]
                    currency  = fi["currency"]
                except (KeyError, TypeError):
                    raw_price = getattr(fi, "last_price", None)
                    currency  = getattr(fi, "currency", "GBp")

                if raw_price is None or float(raw_price) <= 0:
                    prices[ticker] = None
                    continue

                price = float(raw_price)
                # Convert pence → GBP; keep > 500 heuristic as a safety net
                if currency == "GBp" or price > 500:
                    price = price / 100

            else:
                # Use fast_info for price + currency together — prevents yfinance
                # returning a home-exchange price (e.g. TWD for TSM, BRL for PBR)
                # while we assume USD, which causes gross overstatement.
                fi = yf.Ticker(sym).fast_info
                try:
                    raw_price = fi["last_price"]
                    currency  = fi["currency"]
                except (KeyError, TypeError):
                    raw_price = getattr(fi, "last_price", None)
                    currency  = getattr(fi, "currency", "USD")

                if raw_price is None or float(raw_price) <= 0:
                    prices[ticker] = None
                    continue

                price = float(raw_price)

                if currency == "USD":
                    price = price / gbpusd
                elif currency == "EUR":
                    price = price / gbpeur
                elif currency in ("GBP", "GBp"):
                    if currency == "GBp" or price > 500:
                        price = price / 100
                else:
                    # Unknown currency — assume USD as safest fallback,
                    # log so we can add proper handling later
                    print(f"PRICE WARNING [{sym}]: unexpected currency '{currency}', assuming USD")
                    price = price / gbpusd

            _price_cache[sym] = (price, now)
            prices[ticker] = price
        except Exception:
            # On error, serve stale cache rather than returning None
            if cached is not None:
                prices[ticker] = cached[0]
            else:
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

    Uses batch yf.download() for all tickers in a single HTTP call, falling back
    to per-ticker downloads only for tickers that fail in the batch.

    Pass start (a date string "YYYY-MM-DD") to fetch from a specific date instead
    of using the period shorthand — used to align metrics with the user's actual
    holding period rather than an arbitrary trailing window.

    Pass gbpusd_series (a pd.Series of daily GBP/USD rates) to correctly
    convert USD-denominated tickers to GBP using the rate on each day.
    """
    resolved = {t: resolve_ticker(t) for t in tickers}
    syms = list(set(resolved.values()))

    # ── Batch download all tickers in one call ───────────────────────────────
    batch_data = pd.DataFrame()
    try:
        if start:
            batch_data = yf.download(syms, start=start, auto_adjust=True, progress=False, group_by="ticker", threads=True)
        else:
            batch_data = yf.download(syms, period=period, auto_adjust=True, progress=False, group_by="ticker", threads=True)
    except Exception:
        batch_data = pd.DataFrame()

    frames = {}
    fallback_tickers = []

    for ticker in tickers:
        sym = resolved[ticker]
        close = pd.Series(dtype=float)

        # Try extracting from batch result
        if not batch_data.empty:
            try:
                if isinstance(batch_data.columns, pd.MultiIndex) and len(syms) > 1:
                    if sym in batch_data.columns.get_level_values(0):
                        close = batch_data[sym]["Close"].dropna()
                else:
                    # Single ticker batch — columns are just Price fields
                    close = _extract_close(batch_data, sym)
            except Exception:
                close = pd.Series(dtype=float)

        if close.empty:
            fallback_tickers.append(ticker)
            continue

        close = _normalise_close_to_gbp(close, sym, gbpusd_series)
        if not close.empty:
            frames[ticker] = close

    # ── Per-ticker fallback for anything the batch missed ────────────────────
    for ticker in fallback_tickers:
        sym = resolved[ticker]
        try:
            if start:
                data = yf.download(sym, start=start, auto_adjust=True, progress=False)
            else:
                data = yf.download(sym, period=period, auto_adjust=True, progress=False)
            close = _extract_close(data, sym)
            if close.empty:
                continue
            close = _normalise_close_to_gbp(close, sym, gbpusd_series)
            if not close.empty:
                frames[ticker] = close
        except Exception:
            pass

    if not frames:
        return pd.DataFrame()
    return pd.DataFrame(frames).dropna(how="all")


def _normalise_close_to_gbp(close, sym, gbpusd_series=None):
    """Convert a close-price Series to GBP."""
    if sym.endswith(".L"):
        return close / 100
    elif gbpusd_series is not None and not gbpusd_series.empty:
        aligned = gbpusd_series.reindex(close.index).ffill()
        return close / aligned
    else:
        gbpusd = fetch_gbp_usd_rate()
        return close / gbpusd


def fetch_benchmark_data(period="1y", start=None, benchmark="sp500"):
    """Fetch benchmark index in GBP terms."""
    bench_ticker = BENCHMARKS.get(benchmark, BENCHMARKS[DEFAULT_BENCHMARK])
    try:
        if start:
            sp_data = yf.download(bench_ticker,  start=start, auto_adjust=True, progress=False)
            fx_data = yf.download(GBPUSD_TICKER, start=start, auto_adjust=True, progress=False)
        else:
            sp_data = yf.download(bench_ticker,  period=period, auto_adjust=True, progress=False)
            fx_data = yf.download(GBPUSD_TICKER, period=period, auto_adjust=True, progress=False)

        sp_close = _extract_close(sp_data, bench_ticker)
        fx_close = _extract_close(fx_data, GBPUSD_TICKER)

        if sp_close.empty:
            return pd.Series(dtype=float)

        # FTSE 100 is already in GBP — no FX conversion needed
        if benchmark == "ftse100":
            if getattr(sp_close.index, "tz", None) is not None:
                sp_close.index = sp_close.tz_localize(None)
            return sp_close.dropna()

        if not fx_close.empty:
            fx_aligned = fx_close.reindex(sp_close.index).ffill()
            return (sp_close / fx_aligned).dropna()

        return (sp_close / fetch_gbp_usd_rate()).dropna()
    except Exception as e:
        print(f"Error fetching benchmark: {e}")
        return pd.Series(dtype=float)


_rf_cache: tuple[float, float] | None = None  # (rate, fetched_at)
_RF_CACHE_TTL = 86_400  # 24 hours — rate shouldn't jump between normal refreshes


def fetch_risk_free_rate():
    """
    Fetch annualised short-term risk-free rate for a GBP portfolio.

    Uses UK 3-month Gilt / SONIA (short-duration) — correct for Sharpe ratio
    and daily VaR, which measure risk over short horizons.  The 10-year Gilt
    is the wrong maturity for these metrics.

    Cached for 24 hours — prevents the rf jumping between the primary and
    fallback ticker on consecutive cache misses, which would cause Sharpe spikes.
    """
    global _rf_cache
    now = time.time()
    if _rf_cache is not None and now - _rf_cache[1] < _RF_CACHE_TTL:
        return _rf_cache[0]

    # UK 3-month / short-term instruments
    for ticker in ("^IRX", "GB3M=RR"):
        try:
            hist = yf.Ticker(ticker).history(period="5d")
            if not hist.empty:
                rate = float(hist["Close"].iloc[-1]) / 100
                if 0.005 < rate < 0.15:
                    _rf_cache = (rate, now)
                    return rate
        except Exception:
            continue
    # Fallback to UK 10-year Gilt (better than nothing)
    for ticker in ("^GUKG10", "GBGB10YR=RR"):
        try:
            hist = yf.Ticker(ticker).history(period="5d")
            if not hist.empty:
                rate = float(hist["Close"].iloc[-1]) / 100
                if 0.01 < rate < 0.15:
                    _rf_cache = (rate, now)
                    return rate
        except Exception:
            continue
    rate = 0.0425  # Fallback: approx UK base rate
    _rf_cache = (rate, now)
    return rate
