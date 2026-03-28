import hashlib
import json
from pathlib import Path

PORTFOLIOS_DIR = Path(__file__).parent.parent.parent / "portfolios"


def _paths(token: str) -> dict:
    d = PORTFOLIOS_DIR / token
    d.mkdir(parents=True, exist_ok=True)
    return {
        "portfolio":     d / "portfolio.json",
        "metrics_cache": d / "metrics_cache.json",
        "perf_cache":    d / "perf_cache.json",
    }


def _portfolio_hash(token: str) -> str:
    p = _paths(token)["portfolio"]
    if not p.exists():
        return ""
    with open(p, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


# ── Refresh cache ─────────────────────────────────────────────────────────────

def get_cached_refresh(token: str):
    p = _paths(token)["metrics_cache"]
    if not p.exists():
        return None
    try:
        with open(p, "r", encoding="utf-8") as f:
            cached = json.load(f)
        if cached.get("hash") == _portfolio_hash(token):
            return cached.get("data")
    except Exception:
        pass
    return None


def set_cached_refresh(token: str, data: dict):
    try:
        p = _paths(token)["metrics_cache"]
        with open(p, "w", encoding="utf-8") as f:
            json.dump({"hash": _portfolio_hash(token), "data": data}, f)
    except Exception:
        pass


# ── Performance cache ─────────────────────────────────────────────────────────

def get_cached_performance(token: str, period: str):
    p = _paths(token)["perf_cache"]
    if not p.exists():
        return None
    try:
        with open(p, "r", encoding="utf-8") as f:
            cached = json.load(f)
        entry = cached.get(period)
        if entry and entry.get("hash") == _portfolio_hash(token):
            return entry.get("data")
    except Exception:
        pass
    return None


def set_cached_performance(token: str, period: str, data: dict):
    try:
        p = _paths(token)["perf_cache"]
        existing = {}
        if p.exists():
            with open(p, "r", encoding="utf-8") as f:
                existing = json.load(f)
        existing[period] = {"hash": _portfolio_hash(token), "data": data}
        with open(p, "w", encoding="utf-8") as f:
            json.dump(existing, f)
    except Exception:
        pass


# ── Invalidate ────────────────────────────────────────────────────────────────

def invalidate_refresh_cache(token: str):
    paths = _paths(token)
    for key in ("metrics_cache", "perf_cache"):
        p = paths[key]
        if p.exists():
            try:
                p.unlink()
            except Exception:
                pass
