"""
In-memory cache for market refresh and performance data.
Keyed by token; invalidated on any portfolio write.
Single-instance Railway deployment means in-memory is sufficient.
"""
import threading

_lock = threading.Lock()
_refresh: dict = {}          # (token, benchmark) -> data
_perf: dict    = {}          # (token, period) -> data


def get_cached_refresh(token: str, benchmark: str = "sp500"):
    with _lock:
        return _refresh.get((token, benchmark))


def set_cached_refresh(token: str, data: dict, benchmark: str = "sp500"):
    with _lock:
        _refresh[(token, benchmark)] = data


def get_cached_performance(token: str, period: str):
    with _lock:
        return _perf.get((token, period))


def set_cached_performance(token: str, period: str, data: dict):
    with _lock:
        _perf[(token, period)] = data


def invalidate_refresh_cache(token: str):
    with _lock:
        for key in [k for k in _refresh if k[0] == token]:
            del _refresh[key]
        for key in [k for k in _perf if k[0] == token]:
            del _perf[key]
