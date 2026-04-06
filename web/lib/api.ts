import { trackEvent } from "@/lib/analytics";
const BASE = "/api";

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    if (data?.detail && typeof data.detail === "string") return data.detail;
    if (data?.message && typeof data.message === "string") return data.message;
  } catch {}
  return `${fallback} (${res.status})`;
}

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
  if (!res.ok) throw new Error(await readErrorMessage(res, "Failed to initialize session"));
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
  gbpeur: number;
};

export type Metrics = {
  sharpe_ratio: number | null;
  sortino_ratio: number | null;
  actual_return: number | null;
  volatility: number | null;
  beta: number | null;
  capm_expected_return: number | null;
  alpha: number | null;
  var_95: number | null;
  var_95_cf: number | null;
  max_drawdown: number | null;
  drawdown_recovery_days: number | null;
  rf_annual: number | null;
  benchmark_used: string | null;
  risk_model?: "current_holdings_cost_weighted" | string | null;
  sample_days?: number | null;
  benchmark_overlap_days?: number | null;
  window_years_equivalent?: number | null;
  error?: string;
};

export type RefreshData = {
  holdings: Holding[];
  summary: Summary;
  metrics: Metrics | null;
  refreshed_at?: number;
};

// ── API calls ─────────────────────────────────────────────────────────────────

export async function fetchRefresh(benchmark = "sp500", force = false): Promise<RefreshData> {
  const params = new URLSearchParams({ benchmark });
  if (force) params.set("force", "true");
  const res = await fetch(`${BASE}/market/refresh?${params}`, { headers: authHeader() });
  if (!res.ok) throw new Error(await readErrorMessage(res, "Failed to fetch market data"));
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
  const data = await res.json();
  void trackEvent("holdings_added", {
    ticker: payload.ticker,
    asset_type: payload.type,
    tx_type: payload.transaction.type,
    shares: payload.transaction.shares,
    currency: payload.transaction.price_currency,
  });
  return data;
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
  const data = await res.json();
  void trackEvent("csv_import_completed", {
    rows_submitted: transactions.length,
    rows_imported: data.imported,
    rows_skipped: data.skipped,
  });
  return data;
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

export type CorrelationCell = { row: string; col: string; value: number; overlap?: number };
export type CorrelationData = {
  tickers: string[];
  matrix: CorrelationCell[];
  weights: Record<string, number>;
  method: "pearson" | "spearman";
};

export async function fetchCorrelation(period = "1Y", method = "pearson"): Promise<CorrelationData> {
  const res = await fetch(`${BASE}/market/correlation?period=${period}&method=${method}`, { headers: authHeader() });
  if (!res.ok) throw new Error("Failed to fetch correlation data");
  return res.json();
}

export type DiversifierSuggestion = {
  ticker: string;
  name: string;
  asset_class: string;
  avg_corr_vs_portfolio: number;
  estimated_new_avg: number;
  correlation_reduction: number;
};

export type SuggestionsData = {
  current_avg_correlation: number;
  suggestions: DiversifierSuggestion[];
};

export async function fetchCorrelationSuggestions(period = "1Y"): Promise<SuggestionsData> {
  const res = await fetch(`${BASE}/market/correlation/suggestions?period=${period}`, { headers: authHeader() });
  if (!res.ok) throw new Error("Failed to fetch suggestions");
  return res.json();
}

export type RollingPair = {
  pair: string;
  ticker_a: string;
  ticker_b: string;
  static_correlation: number;
  values: number[];
  dates: string[];
};

export type RollingCorrelationData = {
  pairs: RollingPair[];
  window: number;
};

export async function fetchRollingCorrelation(period = "1Y", window = 60): Promise<RollingCorrelationData> {
  const res = await fetch(`${BASE}/market/correlation/rolling?period=${period}&window=${window}`, { headers: authHeader() });
  if (!res.ok) throw new Error("Failed to fetch rolling correlation");
  return res.json();
}

export type PerformanceData = {
  dates: string[];
  portfolio: number[];
  benchmark: number[];
  benchmark_used?: "sp500" | "ftse100" | "msci_world";
  benchmark_name?: string;
};

export type AnalyticsSummary = {
  window_days: number;
  totals: { events: number; unique_tokens: number };
  funnel: Array<Record<string, string | number>>;
  events: Array<{ event_name: string; count: number }>;
  campaigns: Array<{
    campaign: string;
    visits: number;
    signups: number;
    reviews: number;
    signup_rate_from_visit: number;
    review_rate_from_signup: number;
  }>;
  cohorts: Array<{
    cohort_week: string;
    users: number;
    activated_7d: number;
    activation_rate_7d: number;
    review_7d: number;
    review_rate_7d: number;
    high_intent_7d: number;
    high_intent_rate_7d: number;
  }>;
};

export async function fetchPerformance(
  period = "1Y",
  benchmark: "sp500" | "ftse100" | "msci_world" = "sp500"
): Promise<PerformanceData> {
  const params = new URLSearchParams({ period, benchmark });
  const res = await fetch(`${BASE}/market/performance?${params}`, {
    headers: authHeader(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, "Failed to fetch performance data"));
  return res.json();
}

export async function fetchAdminAnalytics(days = 14): Promise<AnalyticsSummary> {
  const params = new URLSearchParams({ days: String(days) });
  const res = await fetch(`${BASE}/admin/analytics?${params}`, {
    headers: authHeader(),
    cache: "no-store",
  });
  if (!res.ok) {
    let msg = `Failed to fetch analytics summary (${res.status})`;
    try {
      const body = await res.json();
      if (body?.detail) msg = `${msg}. ${body.detail}`;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export async function bootstrapAdmin(): Promise<{ claimed: boolean; is_admin: boolean }> {
  const res = await fetch(`${BASE}/admin/bootstrap`, {
    method: "POST",
    headers: authHeader(),
  });
  if (!res.ok) {
    throw new Error(`Failed to bootstrap admin (${res.status})`);
  }
  return res.json();
}

export async function fetchAdminMe(): Promise<{ is_admin: boolean }> {
  const res = await fetch(`${BASE}/admin/me`, {
    headers: authHeader(),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch admin status (${res.status})`);
  }
  return res.json();
}

export async function registerDemoEmail(email: string): Promise<{ status: string }> {
  const res = await fetch(`${BASE}/demo/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.detail ?? "Invalid email address");
  }
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

export type InvestorProfile = {
  risk_appetite: "conservative" | "balanced" | "growth";
  goal: "long_term_growth" | "income" | "preservation";
  time_horizon: "<2" | "2-5" | "5-10" | "10+";
};

export async function getProfile(): Promise<{ exists: boolean } & Partial<InvestorProfile>> {
  const res = await fetch(`${BASE}/profile`, { headers: authHeader() });
  if (!res.ok) throw new Error("Failed to fetch profile");
  return res.json();
}

export async function saveProfile(profile: InvestorProfile): Promise<{ status: string }> {
  const res = await fetch(`${BASE}/profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify(profile),
  });
  if (!res.ok) throw new Error("Failed to save profile");
  return res.json();
}

export async function submitFeedback(message: string, rating: number | null): Promise<{ status: string }> {
  const res = await fetch(`${BASE}/feedback/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify({ message, rating, token: getToken() }),
  });
  if (!res.ok) throw new Error("Failed to submit feedback");
  return res.json();
}

export async function searchTickers(q: string): Promise<{ ticker: string; name: string; exchange: string }[]> {
  if (!q || q.length < 1) return [];
  const res = await fetch(`${BASE}/market/search?q=${encodeURIComponent(q)}`, { headers: authHeader() });
  if (!res.ok) return [];
  const data = await res.json();
  return data.results ?? [];
}

export async function fetchAIUsage(): Promise<{ used: number; limit: number; remaining: number }> {
  const res = await fetch(`${BASE}/ai/usage`, { headers: authHeader() });
  if (!res.ok) throw new Error("Failed to fetch AI usage");
  return res.json();
}

/** Stream AI analysis via SSE over fetch streaming (header-authenticated). */
export function streamAnalysis(
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (msg: string) => void
): () => void {
  const controller = new AbortController();
  let finished = false;
  let fallbackStarted = false;

  async function runFallbackOnce() {
    if (fallbackStarted || finished) return;
    fallbackStarted = true;
    try {
      const res = await fetch(`${BASE}/ai/analysis_once`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        cache: "no-store",
        signal: controller.signal,
      });
      if (!res.ok) {
        let msg = "Failed to start analysis";
        try {
          const data = await res.json();
          msg = data?.detail ?? msg;
        } catch {}
        if (!finished) onError(msg);
        return;
      }
      const data = await res.json();
      if (data?.text) onChunk(data.text);
      if (!finished) {
        finished = true;
        onDone();
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      if (!finished) onError("Connection lost");
    }
  }

  (async () => {
    try {
      const res = await fetch(`${BASE}/ai/analysis`, {
        method: "POST",
        headers: { Accept: "text/event-stream", ...authHeader() },
        cache: "no-store",
        signal: controller.signal,
      });

      if (!res.ok) {
        let msg = "Failed to start analysis";
        try {
          const data = await res.json();
          msg = data?.detail ?? msg;
        } catch {}
        if (!finished) onError(msg);
        return;
      }

      if (!res.body) {
        if (!finished) onError("Empty analysis stream");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let idx = buffer.search(/\r?\n\r?\n/);
        while (idx !== -1) {
          const event = buffer.slice(0, idx);
          const sepLen = buffer[idx] === "\r" ? 4 : 2;
          buffer = buffer.slice(idx + sepLen);

          for (const line of event.split(/\r?\n/)) {
            if (!line.startsWith("data:")) continue;
            const raw = line.slice(5).trim();
            if (!raw) continue;
            let data: any;
            try {
              data = JSON.parse(raw);
            } catch {
              continue;
            }
            if (data.text) onChunk(data.text);
            if (data.done) {
              finished = true;
              onDone();
              controller.abort();
              return;
            }
            if (data.error || data.message) {
              finished = true;
              onError(data.error ?? data.message);
              controller.abort();
              return;
            }
          }

          idx = buffer.search(/\r?\n\r?\n/);
        }
      }

      if (!finished) {
        finished = true;
        onDone();
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      if (!finished) {
        await runFallbackOnce();
      }
    }
  })();

  return () => {
    finished = true;
    controller.abort();
  };
}

// ── Saved AI Reports ──────────────────────────────────────────────────────────

export type AiReport = {
  id: number;
  created_at: string;
  text: string;
};

export async function listAiReports(): Promise<AiReport[]> {
  const res = await fetch(`${BASE}/ai/reports`, { headers: authHeader() });
  if (!res.ok) throw new Error("Failed to fetch reports");
  const data = await res.json();
  return data.reports;
}

export async function saveAiReport(text: string): Promise<{ id: number }> {
  const res = await fetch(`${BASE}/ai/reports`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error("Failed to save report");
  return res.json();
}

export async function deleteAiReport(id: number): Promise<void> {
  const res = await fetch(`${BASE}/ai/reports/${id}`, {
    method: "DELETE",
    headers: authHeader(),
  });
  if (!res.ok) throw new Error("Failed to delete report");
}
