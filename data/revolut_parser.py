import os
import re
import pandas as pd


# ── Helpers ────────────────────────────────────────────────────────────────────

def _clean_price(raw):
    """
    Extract a float from price values like:
      'GBP 149.49', 'USD 12.34', '£149.49', '$12.34', '1,234.56', 149.49
    """
    if isinstance(raw, (int, float)):
        return float(raw)
    s = str(raw).strip()
    if s.lower() in ("nan", "none", "", "-"):
        raise ValueError(f"Empty price: {raw!r}")
    # Remove 3-letter currency code at the start (e.g. 'GBP ')
    s = re.sub(r'^[A-Z]{3}\s+', '', s)
    # Remove currency symbols and commas
    s = s.replace("£", "").replace("$", "").replace("€", "").replace(",", "").strip()
    return float(s)


def _clean_qty(raw):
    """Extract a float from a quantity field."""
    if isinstance(raw, (int, float)):
        return float(raw)
    s = str(raw).strip().replace(",", "")
    if s.lower() in ("nan", "none", ""):
        raise ValueError(f"Empty quantity: {raw!r}")
    return float(s)


def _clean_date(raw):
    """Return YYYY-MM-DD from ISO timestamps, datetime objects, or plain strings."""
    if hasattr(raw, "strftime"):           # pandas Timestamp / datetime
        return raw.strftime("%Y-%m-%d")
    s = str(raw).strip()
    return s[:10] if len(s) >= 10 else s


def _extract_currency_code(raw):
    """
    Extract the 3-letter currency code from a price string like 'GBP 149.49' or 'USD 12.34'.
    Returns None if no code found.
    """
    if isinstance(raw, (int, float)):
        return None
    s = str(raw).strip()
    m = re.match(r'^([A-Z]{3})\s', s)
    if m:
        return m.group(1)
    if s.startswith("£"):
        return "GBP"
    if s.startswith("$"):
        return "USD"
    if s.startswith("€"):
        return "EUR"
    return None


def _read_file(file_path):
    """Read CSV or Excel into a DataFrame, trying multiple strategies."""
    ext = os.path.splitext(file_path)[1].lower()

    if ext in (".xlsx", ".xls"):
        # Try each sheet until we find one with a 'ticker' column
        xl = pd.ExcelFile(file_path)
        for sheet in xl.sheet_names:
            df = xl.parse(sheet)
            df.columns = [str(c).strip().lower() for c in df.columns]
            if "ticker" in df.columns:
                return df
        # Fallback: first sheet
        df = xl.parse(xl.sheet_names[0])
        df.columns = [str(c).strip().lower() for c in df.columns]
        return df
    else:
        # Try comma, then tab, then auto-detect
        for sep in [",", "\t", None]:
            try:
                kwargs = {"sep": sep, "engine": "python"} if sep is None else {"sep": sep}
                df = pd.read_csv(file_path, **kwargs)
                df.columns = [str(c).strip().lower() for c in df.columns]
                if "ticker" in df.columns:
                    return df
            except Exception:
                continue
        raise ValueError("Could not read file. Try exporting as CSV instead.")


# ── Public API ─────────────────────────────────────────────────────────────────

def parse_revolut_csv(file_path):
    """
    Parse a Revolut trading statement (CSV or Excel).
    Returns holdings in transaction format: [{ticker, type, transactions: [...]}]
    Raises ValueError with a human-readable message on failure.
    """
    df = _read_file(file_path)

    if "ticker" in df.columns:
        result, diagnostics = _parse_stock_csv(df)
    elif "currency" in df.columns and "description" in df.columns:
        result, diagnostics = _parse_crypto_csv(df)
    else:
        cols = list(df.columns)
        raise ValueError(
            f"Unrecognised format.\nColumns found: {cols}\n"
            "Expected a Revolut trading statement with a 'Ticker' column."
        )

    if not result:
        raise ValueError(
            f"No holdings found after parsing.\n\nDiagnostics:\n{diagnostics}"
        )

    return result


# ── Stock parser ───────────────────────────────────────────────────────────────

def _parse_stock_csv(df):
    diag_lines = [f"Rows in file: {len(df)}"]

    col_map = {}
    for col in df.columns:
        cl = col.lower()
        if cl in ("ticker", "symbol"):
            col_map["ticker"] = col
        elif cl in ("type", "transaction type"):
            col_map["type"] = col
        elif "quantity" in cl or "qty" in cl or cl == "shares":
            col_map["quantity"] = col
        elif ("price" in cl and "share" in cl) or cl == "price":
            col_map["price"] = col
        elif "date" in cl and "time" not in cl:
            col_map["date"] = col
        elif "date" in cl:
            col_map.setdefault("date", col)
        elif cl == "currency":
            col_map["currency"] = col
        elif "total" in cl and ("amount" in cl or "value" in cl):
            col_map["total_amount"] = col

    diag_lines.append(f"Column mapping: {col_map}")

    required = ["ticker", "type", "quantity", "price"]
    missing = [k for k in required if k not in col_map]
    if missing:
        raise ValueError(
            f"Missing required columns: {missing}\n"
            f"Columns in file: {list(df.columns)}"
        )

    # {ticker: {"transactions": [...], "dividends": [...]}}
    holdings = {}
    skipped_no_ticker = 0
    skipped_not_trade = 0
    skipped_parse_err = 0
    accepted_trades   = 0
    accepted_divs     = 0

    for _, row in df.iterrows():
        raw_ticker = row[col_map["ticker"]]
        raw_type   = row[col_map["type"]]

        if pd.isna(raw_ticker) or str(raw_ticker).strip() in ("", "nan", "NaN"):
            skipped_no_ticker += 1
            continue

        ticker  = str(raw_ticker).strip().upper()
        tx_type = str(raw_type).strip().upper() if not pd.isna(raw_type) else ""

        is_buy  = "BUY"      in tx_type
        is_sell = "SELL"     in tx_type
        is_div  = "DIVIDEND" in tx_type or (
            not is_buy and not is_sell and "DIV" in tx_type
        )

        if not (is_buy or is_sell or is_div):
            skipped_not_trade += 1
            continue

        date = _clean_date(row[col_map["date"]]) if "date" in col_map else "imported"

        # Revolut converts all prices to GBP before writing the statement,
        # so price_currency is always GBP regardless of the stock's native currency.
        # The "Currency" column shows the trade currency (e.g. USD for US stocks)
        # but that applies to the raw trade, not the GBP-converted price we store.
        tx_currency = "GBP"

        if ticker not in holdings:
            holdings[ticker] = {"transactions": [], "dividends": []}

        if is_div:
            try:
                if "total_amount" in col_map:
                    amount = abs(_clean_price(row[col_map["total_amount"]]))
                else:
                    qty   = _clean_qty(row[col_map["quantity"]])
                    price = _clean_price(row[col_map["price"]])
                    amount = qty * price
                if amount > 0:
                    holdings[ticker]["dividends"].append({
                        "date":     date,
                        "amount":   round(amount, 6),
                        "currency": tx_currency,
                    })
                    accepted_divs += 1
            except (ValueError, TypeError):
                pass
            continue

        # Buy / Sell
        try:
            quantity = _clean_qty(row[col_map["quantity"]])
            price    = _clean_price(row[col_map["price"]])
        except (ValueError, TypeError) as e:
            skipped_parse_err += 1
            continue

        if quantity <= 0 or price <= 0:
            skipped_parse_err += 1
            continue

        holdings[ticker]["transactions"].append({
            "date":           date,
            "shares":         round(quantity, 8),
            "price":          round(price, 6),
            "price_currency": tx_currency,
            "type":           "buy" if is_buy else "sell",
        })
        accepted_trades += 1

    diag_lines.append(
        f"Trades accepted: {accepted_trades} | "
        f"Dividends: {accepted_divs} | "
        f"skipped (no ticker): {skipped_no_ticker} | "
        f"skipped (non-trade): {skipped_not_trade} | "
        f"skipped (parse error): {skipped_parse_err}"
    )

    result = []
    for ticker, data in holdings.items():
        txs  = data["transactions"]
        divs = data["dividends"]
        net  = sum(t["shares"] if t["type"] == "buy" else -t["shares"] for t in txs)
        diag_lines.append(f"  {ticker}: net={net:.4f}, dividends={len(divs)}")
        result.append({
            "ticker":       ticker,
            "type":         "stock",
            "transactions": txs,
            "dividends":    divs,
        })

    return result, "\n".join(diag_lines)


# ── Crypto parser ──────────────────────────────────────────────────────────────

def _parse_crypto_csv(df):
    diag_lines = [f"Rows in file: {len(df)}"]
    holdings = {}
    accepted = 0

    for _, row in df.iterrows():
        desc    = str(row.get("description", "")).upper()
        is_buy  = "BOUGHT" in desc or "BUY" in desc
        is_sell = "SOLD"   in desc or "SELL" in desc
        if not (is_buy or is_sell):
            continue

        try:
            currency    = str(row.get("currency", "")).strip().upper()
            amount      = _clean_qty(row.get("amount", 0))
            base_amount = _clean_price(row.get("base amount", 0))
        except (ValueError, TypeError):
            continue

        if not currency or amount <= 0 or base_amount <= 0:
            continue

        ticker = f"{currency}-USD"
        price  = base_amount / amount
        date   = _clean_date(row.get("date", "imported"))

        if ticker not in holdings:
            holdings[ticker] = []

        holdings[ticker].append({
            "date":   date,
            "shares": round(amount, 8),
            "price":  round(price, 6),
            "type":   "buy" if is_buy else "sell",
        })
        accepted += 1

    diag_lines.append(f"Rows accepted: {accepted}")

    result = []
    for ticker, txs in holdings.items():
        net = sum(t["shares"] if t["type"] == "buy" else -t["shares"] for t in txs)
        diag_lines.append(f"  {ticker}: net={net:.4f}")
        if net > 1e-8:
            result.append({
                "ticker":       ticker,
                "type":         "crypto",
                "transactions": txs,
            })

    return result, "\n".join(diag_lines)
