const BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

// ── Token helpers ─────────────────────────────────────────────────────────────

export function getToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("portivex_token") ?? "";
}

export function setToken(token: string) {
  localStorage.setItem("portivex_token", token);
}

export async function ensureToken(): Promise<string> {
  const existing = getToken();
  if (existing) return existing;
  const res = await fetch(`${BASE}/auth/token`, { method: "POST" });
  const { token } = await res.json();
  setToken(token);
  return token;
}

function authHeader(): HeadersInit {
  const t = getToken();
  return t ? { "X-Portfolio-Token": t } : {};
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type Holding = {
  ticker: string;
  type: "stock" | "etf" | "crypto";
  net_shares: number;
  avg_cost: number;
  current_price: number | null;
  market_value: number | null;
  cost_basis: number;
  pnl: number | null;
  pnl_pct: number | null;
  total_dividends: number;
  weight: number | null;
  transaction_count: number;
};

export type Summary = {
  total_value: number;
  total_cost: number;
  total_pnl: number;
  total_pnl_pct: number;
  total_dividends: number;
  holding_count: number;
  gbpusd: number;
};

export type Metrics = {
  sharpe_ratio: number | null;
  actual_return: number | null;
  volatility: number | null;
  beta: number | null;
  capm_expected_return: number | null;
  alpha: number | null;
  var_95: number | null;
  max_drawdown: number | null;
  error?: string;
};

export type RefreshData = {
  holdings: Holding[];
  summary: Summary;
  metrics: Metrics | null;
};

// ── API calls ─────────────────────────────────────────────────────────────────

export async function fetchRefresh(): Promise<RefreshData> {
  const res = await fetch(`${BASE}/market/refresh`, { headers: authHeader() });
  if (!res.ok) throw new Error("Failed to fetch market data");
  return res.json();
}

export async function addHolding(payload: {
  ticker: string;
  type: "stock" | "etf" | "crypto";
  transaction: {
    date: string;
    shares: number;
    price: number;
    type: "buy" | "sell";
    price_currency: "GBP" | "USD" | "EUR";
  };
}) {
  const res = await fetch(`${BASE}/portfolio/holdings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to add holding");
  return res.json();
}

export async function importTransactions(transactions: {
  ticker: string;
  type: "buy" | "sell";
  date: string;
  shares: number;
  price: number;
  price_currency: "GBP" | "USD" | "EUR";
  asset_type: "stock" | "etf" | "crypto";
}[]): Promise<{ imported: number; skipped: number }> {
  const res = await fetch(`${BASE}/portfolio/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify({ transactions }),
  });
  if (!res.ok) throw new Error("Import failed");
  return res.json();
}

export async function clearAllHoldings() {
  const res = await fetch(`${BASE}/portfolio/holdings`, {
    method: "DELETE",
    headers: authHeader(),
  });
  if (!res.ok) throw new Error("Failed to clear holdings");
  return res.json();
}

export async function removeHolding(ticker: string) {
  const res = await fetch(`${BASE}/portfolio/holdings/${ticker}`, {
    method: "DELETE",
    headers: authHeader(),
  });
  if (!res.ok) throw new Error("Failed to remove holding");
  return res.json();
}

export type CorrelationCell = { row: string; col: string; value: number };
export type CorrelationData = { tickers: string[]; matrix: CorrelationCell[] };

export async function fetchCorrelation(period = "1Y"): Promise<CorrelationData> {
  const res = await fetch(`${BASE}/market/correlation?period=${period}`, { headers: authHeader() });
  if (!res.ok) throw new Error("Failed to fetch correlation data");
  return res.json();
}

export type PerformanceData = { dates: string[]; portfolio: number[]; benchmark: number[] };

export async function fetchPerformance(period = "1Y"): Promise<PerformanceData> {
  const res = await fetch(`${BASE}/market/performance?period=${period}`, {
    headers: authHeader(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to fetch performance data");
  return res.json();
}

export async function submitWaitlist(email: string): Promise<{ status: string; position?: number }> {
  const res = await fetch(`${BASE}/waitlist/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error("Failed to join waitlist");
  return res.json();
}

/** Stream AI analysis via SSE. Token passed as query param (EventSource has no header support). */
export function streamAnalysis(
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (msg: string) => void
): () => void {
  const token = getToken();
  const es = new EventSource(`${BASE}/ai/analysis?token=${encodeURIComponent(token)}`);
  es.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.text) onChunk(data.text);
    if (data.done) { onDone(); es.close(); }
    if (data.error) { onError(data.error); es.close(); }
  };
  es.onerror = () => { onError("Connection lost"); es.close(); };
  return () => es.close();
}
