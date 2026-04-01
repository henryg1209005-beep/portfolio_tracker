import sys
import time
import threading
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api import db
from api.routes import portfolio, market, ai, waitlist, auth, feedback, profile
from api.routes import cache as _cache


def _run_cache_warmer():
    """
    Background daemon that pre-warms the refresh cache 60s before TTL expiry.
    Prevents the first user after a cache miss from always triggering a slow
    live yfinance fetch. Runs every 4 minutes.
    """
    time.sleep(60)  # Let the server fully start before first run
    while True:
        try:
            now = time.time()
            to_warm = []
            with _cache._lock:
                for (token, benchmark), (_, ts) in list(_cache._refresh.items()):
                    if now - ts > (_cache._REFRESH_TTL - 60):  # within 60s of expiry
                        to_warm.append((token, benchmark))
            for token, benchmark in to_warm:
                try:
                    market._refresh_data(token, benchmark=benchmark)
                except Exception:
                    pass
        except Exception:
            pass
        time.sleep(240)  # check every 4 minutes


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    warmer = threading.Thread(target=_run_cache_warmer, daemon=True)
    warmer.start()
    yield


app = FastAPI(title="Portfolio Tracker API", version="1.0.0", lifespan=lifespan)

ALLOWED_ORIGINS = [
    "https://portivex.co.uk",
    "https://www.portivex.co.uk",
    "http://localhost:3000",  # local dev
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-Portfolio-Token"],
)

app.include_router(portfolio.router, prefix="/api")
app.include_router(market.router, prefix="/api")
app.include_router(ai.router, prefix="/api")
app.include_router(waitlist.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(feedback.router, prefix="/api")
app.include_router(profile.router, prefix="/api")


@app.get("/api/health")
def health():
    db_ok = False
    try:
        with db._conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
        db_ok = True
    except Exception:
        pass
    with _cache._lock:
        cached_tokens = len({k[0] for k in _cache._refresh})
    return {
        "status": "ok" if db_ok else "degraded",
        "db": db_ok,
        "cached_tokens": cached_tokens,
    }


@app.get("/api/admin/feedback")
def admin_feedback(key: str):
    import os
    admin_key = os.environ.get("ADMIN_KEY", "")
    if not admin_key or key != admin_key:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Forbidden")
    with db._conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, message, rating, token, created_at FROM feedback ORDER BY created_at DESC"
            )
            rows = cur.fetchall()
    return [
        {"id": r[0], "message": r[1], "rating": r[2], "token": r[3], "created_at": str(r[4])}
        for r in rows
    ]
