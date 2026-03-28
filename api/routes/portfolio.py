import json
from pathlib import Path
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Literal, Annotated
from api.routes.cache import invalidate_refresh_cache, _paths

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


# ── Token dependency ──────────────────────────────────────────────────────────

def _token(x_portfolio_token: Annotated[str, Header()]) -> str:
    return x_portfolio_token


# ── Helpers ───────────────────────────────────────────────────────────────────

def _load(token: str) -> dict:
    p = _paths(token)["portfolio"]
    if not p.exists():
        return {"holdings": []}
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)


def _save(token: str, data: dict):
    p = _paths(token)["portfolio"]
    with open(p, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def _compute_stats(holding: dict) -> dict:
    transactions = holding.get("transactions", [])
    buys  = [t for t in transactions if t.get("type") == "buy"]
    sells = [t for t in transactions if t.get("type") == "sell"]
    total_bought = sum(t["shares"] for t in buys)
    total_sold   = sum(t["shares"] for t in sells)
    net_shares   = total_bought - total_sold
    avg_cost = (
        sum(t["shares"] * t["price"] for t in buys) / total_bought
        if total_bought > 0 else 0.0
    )
    total_dividends = sum(d.get("amount", 0) for d in holding.get("dividends", []))
    return {
        "net_shares":        net_shares,
        "avg_cost":          avg_cost,
        "total_dividends":   total_dividends,
        "transaction_count": len(transactions),
    }


# ── Models ────────────────────────────────────────────────────────────────────

class Transaction(BaseModel):
    date: str
    shares: float
    price: float
    type: Literal["buy", "sell"]
    price_currency: Literal["GBP", "USD", "EUR"] = "GBP"


class ImportTransaction(BaseModel):
    ticker: str
    type: Literal["buy", "sell"]
    date: str
    shares: float
    price: float
    price_currency: Literal["GBP", "USD", "EUR"] = "GBP"
    asset_type: Literal["stock", "etf", "crypto"] = "stock"


class ImportRequest(BaseModel):
    transactions: list[ImportTransaction]


class AddHoldingRequest(BaseModel):
    ticker: str
    type: Literal["stock", "etf", "crypto"]
    transaction: Transaction


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("")
def get_portfolio(x_portfolio_token: Annotated[str, Header()]):
    token = x_portfolio_token
    data = _load(token)
    holdings = []
    for h in data.get("holdings", []):
        stats = _compute_stats(h)
        holdings.append({
            "ticker":       h["ticker"],
            "type":         h.get("type", "stock"),
            "transactions": h.get("transactions", []),
            "dividends":    h.get("dividends", []),
            **stats,
        })
    return {"holdings": holdings}


@router.post("/holdings")
def add_holding(req: AddHoldingRequest, x_portfolio_token: Annotated[str, Header()]):
    token = x_portfolio_token
    data  = _load(token)
    ticker = req.ticker.upper()

    for h in data["holdings"]:
        if h["ticker"] == ticker:
            h["transactions"].append(req.transaction.model_dump())
            _save(token, data)
            invalidate_refresh_cache(token)
            return {"ok": True, "action": "transaction_added"}

    data["holdings"].append({
        "ticker":       ticker,
        "type":         req.type,
        "transactions": [req.transaction.model_dump()],
        "dividends":    [],
    })
    _save(token, data)
    invalidate_refresh_cache(token)
    return {"ok": True, "action": "holding_created"}


@router.post("/import")
def import_holdings(req: ImportRequest, x_portfolio_token: Annotated[str, Header()]):
    token = x_portfolio_token
    data  = _load(token)
    imported = 0
    skipped  = 0

    for txn in req.transactions:
        ticker  = txn.ticker.upper()
        holding = next((h for h in data["holdings"] if h["ticker"] == ticker), None)

        if holding is None:
            holding = {"ticker": ticker, "type": txn.asset_type, "transactions": [], "dividends": []}
            data["holdings"].append(holding)

        t_date = txn.date[:10]

        duplicate = any(
            t.get("date", "")[:10] == t_date
            and t.get("type") == txn.type
            and abs(t.get("shares", 0) - txn.shares) < 0.001
            and abs(t.get("price",  0) - txn.price)  < 0.01
            for t in holding["transactions"]
        )

        if duplicate:
            skipped += 1
            continue

        holding["transactions"].append({
            "date":           t_date,
            "shares":         txn.shares,
            "price":          txn.price,
            "price_currency": txn.price_currency,
            "type":           txn.type,
        })
        imported += 1

    _save(token, data)
    invalidate_refresh_cache(token)
    return {"imported": imported, "skipped": skipped}


@router.delete("/holdings")
def clear_all_holdings(x_portfolio_token: Annotated[str, Header()]):
    token = x_portfolio_token
    data  = _load(token)
    data["holdings"] = []
    _save(token, data)
    invalidate_refresh_cache(token)
    return {"ok": True}


@router.delete("/holdings/{ticker}")
def remove_holding(ticker: str, x_portfolio_token: Annotated[str, Header()]):
    token = x_portfolio_token
    data  = _load(token)
    original = len(data["holdings"])
    data["holdings"] = [h for h in data["holdings"] if h["ticker"] != ticker.upper()]
    if len(data["holdings"]) == original:
        raise HTTPException(status_code=404, detail=f"{ticker} not found")
    _save(token, data)
    invalidate_refresh_cache(token)
    return {"ok": True}
