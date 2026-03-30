import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api import db
from api.routes import portfolio, market, ai, waitlist, auth, feedback, profile


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
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
    return {"status": "ok"}


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
