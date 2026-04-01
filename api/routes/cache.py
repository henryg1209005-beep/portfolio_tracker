"""
In-memory cache for market refresh and performance data.
Keyed by token; invalidated on any portfolio write.
Single-instance Railway deployment means in-memory is sufficient.
"""
import time
import threading

_lock = threading.Lock()
_refresh: dict = {}          # (token, benchmark) -> (data, timestamp)
_perf: dict    = {}          # (token, period) -> data
_corr: dict    = {}          # (token, period, method) -> data
_suggestions: dict = {}      # (token, period) -> data
_rolling: dict = {}          # (token, period, window) -> data

_REFRESH_TTL = 300           # 5 minutes — prices auto-expire


def get_cached_refresh(token: str, benchmark: str = "sp500"):
    with _lock:
        entry = _refresh.get((token, benchmark))
        if entry is None:
            return None
        data, ts = entry
        if time.time() - ts > _REFRESH_TTL:
            del _refresh[(token, benchmark)]
            return None
        return data


def set_cached_refresh(token: str, data: dict, benchmark: str = "sp500"):
    with _lock:
        _refresh[(token, benchmark)] = (data, time.time())


def invalidate_refresh_only(token: str, benchmark: str = "sp500"):
    """Invalidate just the refresh cache for a token — used by force-refresh."""
    with _lock:
        _refresh.pop((token, benchmark), None)


def get_cached_performance(token: str, period: str):
    with _lock:
        return _perf.get((token, period))


def set_cached_performance(token: str, period: str, data: dict):
    with _lock:
        _perf[(token, period)] = data


def get_cached_correlation(token: str, period: str, method: str = "pearson"):
    with _lock:
        return _corr.get((token, period, method))


def set_cached_correlation(token: str, period: str, data: dict, method: str = "pearson"):
    with _lock:
        _corr[(token, period, method)] = data


def get_cached_suggestions(token: str, period: str):
    with _lock:
        return _suggestions.get((token, period))


def set_cached_suggestions(token: str, period: str, data: dict):
    with _lock:
        _suggestions[(token, period)] = data


def get_cached_rolling(token: str, period: str, window: int):
    with _lock:
        return _rolling.get((token, period, window))


def set_cached_rolling(token: str, period: str, window: int, data: dict):
    with _lock:
        _rolling[(token, period, window)] = data


def invalidate_refresh_cache(token: str):
    with _lock:
        for key in [k for k in _refresh if k[0] == token]:
            del _refresh[key]
        for key in [k for k in _perf if k[0] == token]:
            del _perf[key]
        for key in [k for k in _corr if k[0] == token]:
            del _corr[key]
        for key in [k for k in _suggestions if k[0] == token]:
            del _suggestions[key]
        for key in [k for k in _rolling if k[0] == token]:
            del _rolling[key]
