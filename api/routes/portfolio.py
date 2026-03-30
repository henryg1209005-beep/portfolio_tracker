from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Literal, Annotated

from api import db
from api.routes.cache import invalidate_refresh_cache

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


# ── Kept for market.py which imports these directly ───────────────────────────

def _load(token: str) -> dict:
    return db.load_portfolio(token)


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
    data = db.load_portfolio(x_portfolio_token)
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
    token  = x_portfolio_token
    ticker = req.ticker.upper()
    action = db.add_transaction(token, ticker, req.type, req.transaction.model_dump())
    invalidate_refresh_cache(token)
    return {"ok": True, "action": action}


@router.post("/import")
def import_holdings(req: ImportRequest, x_portfolio_token: Annotated[str, Header()]):
    token = x_portfolio_token
    result = db.import_transactions(
        token,
        [t.model_dump() for t in req.transactions],
    )
    invalidate_refresh_cache(token)
    return result


@router.delete("/holdings")
def clear_all_holdings(x_portfolio_token: Annotated[str, Header()]):
    token = x_portfolio_token
    db.clear_holdings(token)
    invalidate_refresh_cache(token)
    return {"ok": True}


@router.delete("/holdings/{ticker}")
def remove_holding(ticker: str, x_portfolio_token: Annotated[str, Header()]):
    token = x_portfolio_token
    found = db.remove_holding(token, ticker)
    if not found:
        raise HTTPException(status_code=404, detail=f"{ticker} not found")
    invalidate_refresh_cache(token)
    return {"ok": True}
