"""
Central database module — PostgreSQL via psycopg2.
All routes import from here instead of reading/writing JSON files.
"""
import os
from contextlib import contextmanager
from datetime import date

from psycopg2.pool import ThreadedConnectionPool
from psycopg2.extras import Json

_pool: ThreadedConnectionPool | None = None


def _get_pool() -> ThreadedConnectionPool:
    global _pool
    if _pool is None:
        url = os.environ.get("DATABASE_URL", "")
        if not url:
            raise RuntimeError("DATABASE_URL environment variable is not set")
        # Railway uses postgres:// — psycopg2 needs postgresql://
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql://", 1)
        _pool = ThreadedConnectionPool(1, 10, dsn=url)
    return _pool


@contextmanager
def _conn():
    pool = _get_pool()
    conn = pool.getconn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        pool.putconn(conn)


# ── Schema ────────────────────────────────────────────────────────────────────

def init_db():
    """Create all tables on startup (idempotent)."""
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS holdings (
                    id          SERIAL PRIMARY KEY,
                    token       TEXT NOT NULL,
                    ticker      TEXT NOT NULL,
                    asset_type  TEXT NOT NULL DEFAULT 'stock',
                    UNIQUE (token, ticker)
                );

                CREATE TABLE IF NOT EXISTS txns (
                    id              SERIAL PRIMARY KEY,
                    holding_id      INTEGER NOT NULL REFERENCES holdings(id) ON DELETE CASCADE,
                    date            TEXT NOT NULL,
                    shares          DOUBLE PRECISION NOT NULL,
                    price           DOUBLE PRECISION NOT NULL,
                    price_currency  TEXT NOT NULL DEFAULT 'GBP',
                    tx_type         TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS dividends (
                    id          SERIAL PRIMARY KEY,
                    holding_id  INTEGER NOT NULL REFERENCES holdings(id) ON DELETE CASCADE,
                    amount      DOUBLE PRECISION NOT NULL
                );

                CREATE TABLE IF NOT EXISTS profiles (
                    token           TEXT PRIMARY KEY,
                    risk_appetite   TEXT NOT NULL,
                    goal            TEXT NOT NULL,
                    time_horizon    TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS ai_usage (
                    token       TEXT NOT NULL,
                    usage_date  TEXT NOT NULL,
                    count       INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY (token, usage_date)
                );

                CREATE TABLE IF NOT EXISTS feedback (
                    id          SERIAL PRIMARY KEY,
                    message     TEXT NOT NULL,
                    rating      INTEGER,
                    token       TEXT,
                    created_at  TIMESTAMPTZ DEFAULT NOW()
                );

                CREATE TABLE IF NOT EXISTS ai_reports (
                    id          SERIAL PRIMARY KEY,
                    token       TEXT NOT NULL,
                    report_text TEXT NOT NULL,
                    created_at  TIMESTAMPTZ DEFAULT NOW()
                );

                CREATE TABLE IF NOT EXISTS analytics_events (
                    id          SERIAL PRIMARY KEY,
                    token       TEXT,
                    event_name  TEXT NOT NULL,
                    properties  JSONB NOT NULL DEFAULT '{}'::jsonb,
                    created_at  TIMESTAMPTZ DEFAULT NOW()
                );
            """)
            # Profile enums as DB-level guardrails (NOT VALID avoids legacy-row migration risk).
            cur.execute("""
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conname = 'profiles_risk_appetite_check'
                    ) THEN
                        ALTER TABLE profiles
                        ADD CONSTRAINT profiles_risk_appetite_check
                        CHECK (risk_appetite IN ('conservative', 'balanced', 'growth')) NOT VALID;
                    END IF;
                END $$;
            """)
            cur.execute("""
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conname = 'profiles_goal_check'
                    ) THEN
                        ALTER TABLE profiles
                        ADD CONSTRAINT profiles_goal_check
                        CHECK (goal IN ('long_term_growth', 'income', 'preservation')) NOT VALID;
                    END IF;
                END $$;
            """)
            cur.execute("""
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conname = 'profiles_time_horizon_check'
                    ) THEN
                        ALTER TABLE profiles
                        ADD CONSTRAINT profiles_time_horizon_check
                        CHECK (time_horizon IN ('<2', '2-5', '5-10', '10+')) NOT VALID;
                    END IF;
                END $$;
            """)


# ── Portfolio ─────────────────────────────────────────────────────────────────

def load_portfolio(token: str) -> dict:
    """Return portfolio in the same dict structure the routes expect."""
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, ticker, asset_type FROM holdings WHERE token = %s ORDER BY id",
                (token,),
            )
            holding_rows = cur.fetchall()

            holdings = []
            for hid, ticker, asset_type in holding_rows:
                cur.execute(
                    "SELECT date, shares, price, price_currency, tx_type"
                    " FROM txns WHERE holding_id = %s ORDER BY id",
                    (hid,),
                )
                transactions = [
                    {"date": r[0], "shares": r[1], "price": r[2],
                     "price_currency": r[3], "type": r[4]}
                    for r in cur.fetchall()
                ]
                cur.execute(
                    "SELECT amount FROM dividends WHERE holding_id = %s ORDER BY id",
                    (hid,),
                )
                dividends = [{"amount": r[0]} for r in cur.fetchall()]

                holdings.append({
                    "ticker":       ticker,
                    "type":         asset_type,
                    "transactions": transactions,
                    "dividends":    dividends,
                })

    return {"holdings": holdings}


def _get_or_create_holding(cur, token: str, ticker: str, asset_type: str) -> int:
    cur.execute(
        "SELECT id FROM holdings WHERE token = %s AND ticker = %s",
        (token, ticker),
    )
    row = cur.fetchone()
    if row:
        return row[0]
    cur.execute(
        "INSERT INTO holdings (token, ticker, asset_type) VALUES (%s, %s, %s) RETURNING id",
        (token, ticker, asset_type),
    )
    return cur.fetchone()[0]


def add_transaction(token: str, ticker: str, asset_type: str, txn: dict) -> str:
    """Add one transaction; returns 'holding_created' or 'transaction_added'."""
    with _conn() as conn:
        with conn.cursor() as cur:
            exists_before = cur.execute(
                "SELECT id FROM holdings WHERE token = %s AND ticker = %s",
                (token, ticker),
            ) or cur.fetchone()
            hid = _get_or_create_holding(cur, token, ticker, asset_type)
            cur.execute(
                "INSERT INTO txns (holding_id, date, shares, price, price_currency, tx_type)"
                " VALUES (%s, %s, %s, %s, %s, %s)",
                (hid, txn["date"], txn["shares"], txn["price"],
                 txn.get("price_currency", "GBP"), txn["type"]),
            )
            # Re-check if it already existed
            action = "transaction_added" if exists_before else "holding_created"
    return action


def import_transactions(token: str, transactions: list) -> dict:
    imported = 0
    skipped = 0
    with _conn() as conn:
        with conn.cursor() as cur:
            for txn in transactions:
                ticker = txn["ticker"].upper()
                hid = _get_or_create_holding(cur, token, ticker, txn.get("asset_type", "stock"))

                cur.execute(
                    """SELECT id FROM txns
                       WHERE holding_id = %s AND date = %s AND tx_type = %s
                         AND ABS(shares - %s) < 0.001 AND ABS(price - %s) < 0.01""",
                    (hid, txn["date"][:10], txn["type"], txn["shares"], txn["price"]),
                )
                if cur.fetchone():
                    skipped += 1
                    continue

                cur.execute(
                    "INSERT INTO txns (holding_id, date, shares, price, price_currency, tx_type)"
                    " VALUES (%s, %s, %s, %s, %s, %s)",
                    (hid, txn["date"][:10], txn["shares"], txn["price"],
                     txn.get("price_currency", "GBP"), txn["type"]),
                )
                imported += 1

    return {"imported": imported, "skipped": skipped}


def clear_holdings(token: str):
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM holdings WHERE token = %s", (token,))


def remove_holding(token: str, ticker: str) -> bool:
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM holdings WHERE token = %s AND ticker = %s RETURNING id",
                (token, ticker.upper()),
            )
            return cur.fetchone() is not None


# ── Profile ───────────────────────────────────────────────────────────────────

def load_profile(token: str) -> dict | None:
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT risk_appetite, goal, time_horizon FROM profiles WHERE token = %s",
                (token,),
            )
            row = cur.fetchone()
    if row is None:
        return None
    return {"risk_appetite": row[0], "goal": row[1], "time_horizon": row[2]}


def save_profile(token: str, risk_appetite: str, goal: str, time_horizon: str):
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO profiles (token, risk_appetite, goal, time_horizon)
                   VALUES (%s, %s, %s, %s)
                   ON CONFLICT (token) DO UPDATE
                       SET risk_appetite = EXCLUDED.risk_appetite,
                           goal          = EXCLUDED.goal,
                           time_horizon  = EXCLUDED.time_horizon""",
                (token, risk_appetite, goal, time_horizon),
            )


# ── AI usage ──────────────────────────────────────────────────────────────────

def check_and_increment_usage(token: str, daily_limit: int) -> tuple[bool, int]:
    today = date.today().isoformat()
    with _conn() as conn:
        with conn.cursor() as cur:
            # Atomic upsert — only increments while count < daily_limit
            cur.execute(
                """INSERT INTO ai_usage (token, usage_date, count) VALUES (%s, %s, 1)
                   ON CONFLICT (token, usage_date) DO UPDATE
                       SET count = ai_usage.count + 1
                       WHERE ai_usage.count < %s
                   RETURNING count""",
                (token, today, daily_limit),
            )
            row = cur.fetchone()
    if row is None:
        return False, 0
    return True, max(0, daily_limit - row[0])


def get_usage(token: str, daily_limit: int) -> dict:
    today = date.today().isoformat()
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT count FROM ai_usage WHERE token = %s AND usage_date = %s",
                (token, today),
            )
            row = cur.fetchone()
    used = row[0] if row else 0
    return {"used": used, "limit": daily_limit, "remaining": max(0, daily_limit - used)}


def refund_usage_increment(token: str):
    """
    Refund one AI analysis usage unit for today.
    Used when analysis fails before producing a complete response.
    """
    today = date.today().isoformat()
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE ai_usage
                   SET count = GREATEST(count - 1, 0)
                   WHERE token = %s AND usage_date = %s""",
                (token, today),
            )


# ── AI Reports ────────────────────────────────────────────────────────────────

def save_ai_report(token: str, text: str) -> int:
    """Save an AI report and enforce a maximum of 10 per token (oldest pruned)."""
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO ai_reports (token, report_text) VALUES (%s, %s) RETURNING id",
                (token, text),
            )
            new_id = cur.fetchone()[0]
            # Prune any reports beyond the 10 most recent
            cur.execute("""
                DELETE FROM ai_reports
                WHERE token = %s AND id NOT IN (
                    SELECT id FROM ai_reports
                    WHERE token = %s
                    ORDER BY created_at DESC
                    LIMIT 10
                )
            """, (token, token))
    return new_id


def list_ai_reports(token: str) -> list:
    """Return all saved reports for a token, newest first."""
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, created_at, report_text FROM ai_reports WHERE token = %s ORDER BY created_at DESC LIMIT 10",
                (token,),
            )
            rows = cur.fetchall()
    return [{"id": r[0], "created_at": r[1].isoformat(), "text": r[2]} for r in rows]


def delete_ai_report(token: str, report_id: int) -> bool:
    """Delete a report by id, scoped to token. Returns True if deleted."""
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM ai_reports WHERE id = %s AND token = %s RETURNING id",
                (report_id, token),
            )
            return cur.fetchone() is not None


# ── Feedback ──────────────────────────────────────────────────────────────────

def save_feedback(message: str, rating: int | None, token: str | None):
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO feedback (message, rating, token) VALUES (%s, %s, %s)",
                (message, rating, token),
            )


# ── Analytics ────────────────────────────────────────────────────────────────

def save_analytics_event(token: str | None, event_name: str, properties: dict | None):
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO analytics_events (token, event_name, properties) VALUES (%s, %s, %s)",
                (token, event_name, Json(properties or {})),
            )
