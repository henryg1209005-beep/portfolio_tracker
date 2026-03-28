// ── Types ─────────────────────────────────────────────────────────────────────

export type ParsedRow = Record<string, string>;
export type BrokerFormat = "revolut" | "generic";
export type Currency = "GBP" | "USD" | "EUR";

export type MappedTransaction = {
  ticker: string;
  date: string;           // YYYY-MM-DD
  shares: number;
  price: number;
  price_currency: Currency;
  type: "buy" | "sell";
  error?: string;
};

export type ColumnMapping = {
  date: string;
  ticker: string;
  shares: string;
  price: string;
  currency: string;       // column name, or "" to use defaultCurrency
  action: string;
};

// ── CSV parser ────────────────────────────────────────────────────────────────

function splitLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && !inQuotes) {
      inQuotes = true;
    } else if (ch === '"' && inQuotes) {
      if (line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = false;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseCSV(raw: string): { headers: string[]; rows: ParsedRow[] } {
  // Strip BOM
  const text = raw.replace(/^\uFEFF/, "").trim();
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };

  const headers = splitLine(lines[0]).map(h => h.replace(/^"|"$/g, "").trim());
  const rows: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = splitLine(lines[i]);
    if (vals.every(v => !v)) continue; // skip blank rows
    const row: ParsedRow = {};
    headers.forEach((h, j) => { row[h] = (vals[j] ?? "").replace(/^"|"$/g, "").trim(); });
    rows.push(row);
  }

  return { headers, rows };
}

// ── Broker detection ──────────────────────────────────────────────────────────

export function detectBroker(headers: string[]): BrokerFormat {
  const h = new Set(headers.map(x => x.toLowerCase().trim()));
  // Revolut Investing exports typically contain "price per share"
  if (h.has("price per share")) return "revolut";
  // Some Revolut variants use "symbol" + "side"
  if (h.has("symbol") && h.has("side") && (h.has("quantity") || h.has("shares"))) return "revolut";
  return "generic";
}

// ── Date normalisation ────────────────────────────────────────────────────────

function parseDate(raw: string): string {
  const s = raw.trim();
  // ISO with time: "2025-11-10 14:30:00" or "2025-11-10T14:30:00Z"
  const isoMatch = s.match(/^(\d{4}-\d{2}-\d{2})[T\s]/);
  if (isoMatch) return isoMatch[1];
  // Plain ISO: "2025-11-10"
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // UK date: "10/11/2025"
  const ukMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ukMatch) return `${ukMatch[3]}-${ukMatch[2].padStart(2, "0")}-${ukMatch[1].padStart(2, "0")}`;
  // US date: "11/10/2025" — ambiguous, treat as MM/DD/YYYY
  const usMatch = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (usMatch) return `${usMatch[3]}-${usMatch[1].padStart(2, "0")}-${usMatch[2].padStart(2, "0")}`;
  return s;
}

function normaliseCurrency(raw: string): Currency {
  const c = raw.trim().toUpperCase();
  if (c === "USD" || c === "EUR") return c;
  return "GBP";
}

function normaliseAction(raw: string): "buy" | "sell" | null {
  const s = raw.trim().toLowerCase();
  if (s.includes("buy") || s === "purchase") return "buy";
  if (s.includes("sell"))                    return "sell";
  return null;
}

// ── Revolut parser ────────────────────────────────────────────────────────────

export function parseRevolut(rows: ParsedRow[]): MappedTransaction[] {
  // Support both column-name variants
  const getTicker = (r: ParsedRow) => r["Ticker"] ?? r["Symbol"] ?? "";
  const getShares = (r: ParsedRow) => r["Quantity"] ?? r["Shares"] ?? r["No. of shares"] ?? "";
  const getPrice  = (r: ParsedRow) => r["Price per share"] ?? r["Price Per Share"] ?? r["Price"] ?? "";
  const getCurr   = (r: ParsedRow) => r["Currency"] ?? "";
  const getAction = (r: ParsedRow) => r["Type"] ?? r["Side"] ?? r["Action"] ?? "";
  const getDate   = (r: ParsedRow) => r["Date"] ?? r["Time"] ?? r["Transaction date"] ?? "";

  const result: MappedTransaction[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const actionRaw = getAction(row);
    const action    = normaliseAction(actionRaw);

    // Skip non-trade rows (dividends, deposits, etc.)
    if (!action) continue;

    const ticker  = getTicker(row).trim().toUpperCase();
    const dateRaw = getDate(row);
    const date    = parseDate(dateRaw);
    const stripCurrencyPrefix = (s: string) => s.replace(/^[A-Z]{3}\s+/i, "").replace(/,/g, "");
    const shares  = parseFloat(stripCurrencyPrefix(getShares(row)) || "0");
    const priceRaw = getPrice(row).trim();
    const price   = parseFloat(stripCurrencyPrefix(priceRaw) || "0");
    // Prefer currency embedded in price value (e.g. "GBP 149.49") over dedicated column
    const prefixMatch = priceRaw.match(/^([A-Z]{3})\s+/i);
    const currency = prefixMatch
      ? normaliseCurrency(prefixMatch[1])
      : normaliseCurrency(getCurr(row));

    const errors: string[] = [];
    if (!ticker)          errors.push("missing ticker");
    if (!date)            errors.push("missing date");
    if (isNaN(shares) || shares <= 0) errors.push("invalid quantity");
    if (isNaN(price)  || price  <= 0) errors.push("invalid price");

    result.push({
      ticker,
      date,
      shares: isNaN(shares) ? 0 : shares,
      price:  isNaN(price)  ? 0 : price,
      price_currency: currency,
      type: action,
      ...(errors.length ? { error: errors.join(", ") } : {}),
    });
  }

  return result;
}

// ── Generic parser (uses column mapping) ──────────────────────────────────────

export function parseWithMapping(
  rows: ParsedRow[],
  mapping: ColumnMapping,
  defaultCurrency: Currency,
): MappedTransaction[] {
  return rows.map(row => {
    const actionRaw  = row[mapping.action] ?? "";
    const action     = normaliseAction(actionRaw);
    if (!action) return null; // skip non-buy/sell rows silently

    const ticker   = (row[mapping.ticker] ?? "").trim().toUpperCase();
    const date     = parseDate(row[mapping.date] ?? "");
    const shares   = parseFloat((row[mapping.shares] ?? "").replace(/,/g, ""));
    const price    = parseFloat((row[mapping.price]  ?? "").replace(/,/g, ""));
    const currency = mapping.currency
      ? normaliseCurrency(row[mapping.currency] ?? defaultCurrency)
      : defaultCurrency;

    const errors: string[] = [];
    if (!ticker)                      errors.push("missing ticker");
    if (!date)                        errors.push("missing date");
    if (isNaN(shares) || shares <= 0) errors.push("invalid quantity");
    if (isNaN(price)  || price  <= 0) errors.push("invalid price");

    return {
      ticker,
      date,
      shares: isNaN(shares) ? 0 : shares,
      price:  isNaN(price)  ? 0 : price,
      price_currency: currency,
      type: action,
      ...(errors.length ? { error: errors.join(", ") } : {}),
    };
  }).filter(Boolean) as MappedTransaction[];
}

// ── Asset type inference ──────────────────────────────────────────────────────

const KNOWN_ETFS = new Set([
  "VUSA","VWRL","SWLD","HMWO","VEVE","VUAG","VHVG","HUKX","ISF","VFEM",
  "CSPX","IWRD","ACWI","VOO","SPY","QQQ","IVV","VTI","EEM","VWO","EIMI",
  "IGLT","VGOV","IGLS","AGG","BND","TLT",
]);
const CRYPTO_SUFFIX = /-(USD|GBP|EUR|USDT)$/i;

export function inferAssetType(ticker: string): "stock" | "etf" | "crypto" {
  const t = ticker.replace(".L", "").toUpperCase();
  if (CRYPTO_SUFFIX.test(ticker)) return "crypto";
  if (KNOWN_ETFS.has(t))         return "etf";
  return "stock";
}
