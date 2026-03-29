// ── Types ─────────────────────────────────────────────────────────────────────

export type ParsedRow = Record<string, string>;
export type BrokerFormat = "revolut" | "trading212" | "freetrade" | "hl" | "generic";
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

export const BROKER_LABELS: Record<BrokerFormat, string> = {
  revolut:    "Revolut Investing",
  trading212: "Trading 212",
  freetrade:  "Freetrade",
  hl:         "Hargreaves Lansdown",
  generic:    "Generic CSV",
};

export function detectBroker(headers: string[]): BrokerFormat {
  const h = new Set(headers.map(x => x.toLowerCase().trim()));

  // Trading 212: has "price / share" and "no. of shares"
  if (h.has("price / share") || (h.has("no. of shares") && h.has("action"))) return "trading212";

  // Freetrade: has "buy / sell" and "share price"
  if (h.has("buy / sell") || (h.has("share price") && h.has("shares"))) return "freetrade";

  // Hargreaves Lansdown: has "unit cost (p)" — prices in pence
  if (h.has("unit cost (p)") || (h.has("description") && h.has("quantity") && h.has("value (£)"))) return "hl";

  // Revolut: has "price per share" or symbol+side
  if (h.has("price per share")) return "revolut";
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
  const ukSlash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ukSlash) return `${ukSlash[3]}-${ukSlash[2].padStart(2, "0")}-${ukSlash[1].padStart(2, "0")}`;
  // UK date with dashes: "10-11-2025"
  const ukDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ukDash) return `${ukDash[3]}-${ukDash[2].padStart(2, "0")}-${ukDash[1].padStart(2, "0")}`;
  // DD-Mon-YYYY: "15-Jan-2024"
  const monMatch = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (monMatch) {
    const months: Record<string, string> = { jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12" };
    const m = months[monMatch[2].toLowerCase()];
    if (m) return `${monMatch[3]}-${m}-${monMatch[1].padStart(2, "0")}`;
  }
  return s;
}

function normaliseCurrency(raw: string): Currency {
  const c = raw.trim().toUpperCase();
  if (c === "USD" || c === "EUR") return c;
  return "GBP";
}

function normaliseAction(raw: string): "buy" | "sell" | null {
  const s = raw.trim().toLowerCase();
  if (s.includes("buy") || s === "purchase" || s === "b") return "buy";
  if (s.includes("sell") || s === "s")                     return "sell";
  return null;
}

function stripNum(s: string): number {
  return parseFloat(s.replace(/[^0-9.\-]/g, "") || "0");
}

// ── Revolut parser ────────────────────────────────────────────────────────────

export function parseRevolut(rows: ParsedRow[]): MappedTransaction[] {
  const getTicker = (r: ParsedRow) => r["Ticker"] ?? r["Symbol"] ?? "";
  const getShares = (r: ParsedRow) => r["Quantity"] ?? r["Shares"] ?? r["No. of shares"] ?? "";
  const getPrice  = (r: ParsedRow) => r["Price per share"] ?? r["Price Per Share"] ?? r["Price"] ?? "";
  const getCurr   = (r: ParsedRow) => r["Currency"] ?? "";
  const getAction = (r: ParsedRow) => r["Type"] ?? r["Side"] ?? r["Action"] ?? "";
  const getDate   = (r: ParsedRow) => r["Date"] ?? r["Time"] ?? r["Transaction date"] ?? "";

  const result: MappedTransaction[] = [];
  for (const row of rows) {
    const actionRaw = getAction(row);
    const action    = normaliseAction(actionRaw);
    if (!action) continue;

    const ticker  = getTicker(row).trim().toUpperCase();
    const date    = parseDate(getDate(row));
    const priceRaw = getPrice(row).trim();
    const prefixMatch = priceRaw.match(/^([A-Z]{3})\s+/i);
    const stripCurrencyPrefix = (s: string) => s.replace(/^[A-Z]{3}\s+/i, "").replace(/,/g, "");
    const shares  = parseFloat(stripCurrencyPrefix(getShares(row)) || "0");
    const price   = parseFloat(stripCurrencyPrefix(priceRaw) || "0");
    const currency = prefixMatch ? normaliseCurrency(prefixMatch[1]) : normaliseCurrency(getCurr(row));

    const errors: string[] = [];
    if (!ticker)                      errors.push("missing ticker");
    if (!date)                        errors.push("missing date");
    if (isNaN(shares) || shares <= 0) errors.push("invalid quantity");
    if (isNaN(price)  || price  <= 0) errors.push("invalid price");

    result.push({ ticker, date, shares: isNaN(shares) ? 0 : shares, price: isNaN(price) ? 0 : price, price_currency: currency, type: action, ...(errors.length ? { error: errors.join(", ") } : {}) });
  }
  return result;
}

// ── Trading 212 parser ────────────────────────────────────────────────────────
// Columns: Action, Time, ISIN, Ticker, Name, No. of shares, Price / share,
//          Currency (Price / share), Exchange rate, Result (GBP), Total (GBP), ...

export function parseTrading212(rows: ParsedRow[]): MappedTransaction[] {
  const result: MappedTransaction[] = [];
  for (const row of rows) {
    const actionRaw = (row["Action"] ?? "").trim();
    const action    = normaliseAction(actionRaw);
    if (!action) continue; // skip dividends, deposits, interest, etc.

    const ticker   = (row["Ticker"] ?? row["Symbol"] ?? "").trim().toUpperCase();
    const date     = parseDate(row["Time"] ?? row["Date"] ?? "");
    const shares   = stripNum(row["No. of shares"] ?? row["Quantity"] ?? "");
    const price    = stripNum(row["Price / share"] ?? row["Price"] ?? "");
    const currency = normaliseCurrency(row["Currency (Price / share)"] ?? row["Currency"] ?? "GBP");

    const errors: string[] = [];
    if (!ticker)                      errors.push("missing ticker");
    if (!date)                        errors.push("missing date");
    if (isNaN(shares) || shares <= 0) errors.push("invalid quantity");
    if (isNaN(price)  || price  <= 0) errors.push("invalid price");

    result.push({ ticker, date, shares, price, price_currency: currency, type: action, ...(errors.length ? { error: errors.join(", ") } : {}) });
  }
  return result;
}

// ── Freetrade parser ──────────────────────────────────────────────────────────
// Columns: Title, Type, Timestamp, Account Currency, Total Amount,
//          Buy / Sell, Ticker, ISIN, Share Price, Shares, Direction, FX Rate

export function parseFreetrade(rows: ParsedRow[]): MappedTransaction[] {
  const result: MappedTransaction[] = [];
  for (const row of rows) {
    // Only process ORDER rows — skip DIVIDEND, INTEREST, etc.
    const type = (row["Type"] ?? "").trim().toUpperCase();
    if (type && type !== "ORDER" && type !== "BUY" && type !== "SELL") continue;

    const actionRaw = row["Buy / Sell"] ?? row["Direction"] ?? row["Type"] ?? "";
    const action    = normaliseAction(actionRaw);
    if (!action) continue;

    const ticker   = (row["Ticker"] ?? row["Symbol"] ?? "").trim().toUpperCase();
    const date     = parseDate(row["Timestamp"] ?? row["Date"] ?? "");
    const shares   = stripNum(row["Shares"] ?? row["Quantity"] ?? "");
    const price    = stripNum(row["Share Price"] ?? row["Price"] ?? "");
    // Freetrade prices are in account currency (usually GBP for UK users)
    const currency = normaliseCurrency(row["Account Currency"] ?? row["Currency"] ?? "GBP");

    const errors: string[] = [];
    if (!ticker)                      errors.push("missing ticker");
    if (!date)                        errors.push("missing date");
    if (isNaN(shares) || shares <= 0) errors.push("invalid quantity");
    if (isNaN(price)  || price  <= 0) errors.push("invalid price");

    result.push({ ticker, date, shares, price, price_currency: currency, type: action, ...(errors.length ? { error: errors.join(", ") } : {}) });
  }
  return result;
}

// ── Hargreaves Lansdown parser ────────────────────────────────────────────────
// Columns: Date, Ref, Description, Unit cost (p), Quantity, Value (£)
// Note: prices are in PENCE — must divide by 100

export function parseHL(rows: ParsedRow[]): MappedTransaction[] {
  // Extract ticker from description like "Bought Vanguard S&P 500 UCITS ETF (VUSA)"
  function extractTicker(desc: string): string {
    const parens = desc.match(/\(([A-Z0-9.]{1,10})\)\s*$/);
    if (parens) return parens[1];
    // Try "Sold AAPL" or "Bought AAPL"
    const words = desc.trim().split(/\s+/);
    if (words.length >= 2) {
      const candidate = words[words.length - 1].replace(/[^A-Z0-9.]/gi, "").toUpperCase();
      if (candidate.length >= 2 && candidate.length <= 10) return candidate;
    }
    return "";
  }

  const result: MappedTransaction[] = [];
  for (const row of rows) {
    const desc = row["Description"] ?? "";
    const action = normaliseAction(desc.split(" ")[0] ?? "");
    if (!action) continue; // skip non-trade rows

    const ticker  = extractTicker(desc);
    const date    = parseDate(row["Date"] ?? "");
    const shares  = stripNum(row["Quantity"] ?? "");
    // HL unit costs are in pence — divide by 100 to get GBP
    const priceRaw = stripNum(row["Unit cost (p)"] ?? row["Price (p)"] ?? "");
    const price    = priceRaw / 100;

    const errors: string[] = [];
    if (!ticker)                      errors.push("missing ticker — check description format");
    if (!date)                        errors.push("missing date");
    if (isNaN(shares) || shares <= 0) errors.push("invalid quantity");
    if (isNaN(price)  || price  <= 0) errors.push("invalid price");

    result.push({ ticker, date, shares, price, price_currency: "GBP", type: action, ...(errors.length ? { error: errors.join(", ") } : {}) });
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
    if (!action) return null;

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

    return { ticker, date, shares: isNaN(shares) ? 0 : shares, price: isNaN(price) ? 0 : price, price_currency: currency, type: action, ...(errors.length ? { error: errors.join(", ") } : {}) };
  }).filter(Boolean) as MappedTransaction[];
}

// ── Asset type inference ──────────────────────────────────────────────────────

const KNOWN_ETFS = new Set([
  "VUSA","VWRL","SWLD","HMWO","VEVE","VUAG","VHVG","HUKX","ISF","VFEM",
  "CSPX","IWRD","ACWI","VOO","SPY","QQQ","IVV","VTI","EEM","VWO","EIMI",
  "IGLT","VGOV","IGLS","AGG","BND","TLT","VUKE","VERX","IEMA","IUKD",
  "SLXX","CORP","IUSA","INRG","SMT","PCT","FCSS",
]);
const CRYPTO_SUFFIX = /-(USD|GBP|EUR|USDT)$/i;

export function inferAssetType(ticker: string): "stock" | "etf" | "crypto" {
  const t = ticker.replace(".L", "").toUpperCase();
  if (CRYPTO_SUFFIX.test(ticker)) return "crypto";
  if (KNOWN_ETFS.has(t))         return "etf";
  return "stock";
}
