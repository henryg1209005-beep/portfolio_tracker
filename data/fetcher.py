import time
import requests
import yfinance as yf
import pandas as pd

BENCHMARK        = "^GSPC"
RISK_FREE_TICKER = "^IRX"   # 13-week T-bill
GBPUSD_TICKER    = "GBPUSD=X"
GBPEUR_TICKER    = "GBPEUR=X"

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
                aligned = gbpusd_series.reindex(close.index).ffill()
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
            fx_aligned = fx_close.reindex(sp_close.index).ffill()
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
