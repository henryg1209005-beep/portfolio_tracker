"use client";
import { useState, useEffect, useRef } from "react";
import { addHolding, searchTickers } from "@/lib/api";
import { inferAssetType } from "@/lib/csvImport";

type AddHoldingPayload = {
  ticker: string;
  type: "stock" | "etf" | "crypto";
  transaction: {
    date: string;
    shares: number;
    price: number;
    type: "buy" | "sell";
    price_currency: "GBP" | "USD" | "EUR";
  };
};

type Props = {
  onClose: () => void;
  onAdded: () => void | Promise<void>;
  onSubmit?: (payload: AddHoldingPayload) => void | Promise<void>;
};
type SearchResult = { ticker: string; name: string; exchange: string };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted uppercase tracking-wider">{label}</span>
      {children}
    </div>
  );
}

export default function AddHoldingModal({ onClose, onAdded, onSubmit }: Props) {
  const [form, setForm] = useState({
    ticker: "",
    type: "stock" as "stock" | "etf" | "crypto",
    date: new Date().toISOString().slice(0, 10),
    shares: "",
    price: "",
    txnType: "buy" as "buy" | "sell",
    currency: "GBP" as "GBP" | "USD" | "EUR",
  });
  const [typeAutoDetected, setTypeAutoDetected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleTickerChange(raw: string) {
    const ticker = raw.toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
    const detected = inferAssetType(ticker);
    setForm(f => ({ ...f, ticker, type: detected }));
    setTypeAutoDetected(ticker.length >= 2);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (ticker.length < 1) { setSuggestions([]); setShowSuggestions(false); return; }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const results = await searchTickers(ticker);
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
      setSearching(false);
    }, 300);
  }

  function selectSuggestion(result: SearchResult) {
    const detected = inferAssetType(result.ticker);
    setForm(f => ({ ...f, ticker: result.ticker, type: detected }));
    setTypeAutoDetected(true);
    setSuggestions([]);
    setShowSuggestions(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload: AddHoldingPayload = {
        ticker: form.ticker,
        type: form.type,
        transaction: {
          date: form.date,
          shares: parseFloat(form.shares),
          price: parseFloat(form.price),
          type: form.txnType,
          price_currency: form.currency,
        },
      };
      if (onSubmit) await onSubmit(payload);
      else await addHolding(payload);
      onAdded();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setLoading(false);
    }
  }

  const inputCls = "rounded-lg px-3 py-2 text-sm focus:outline-none transition-colors font-mono"
    + " bg-[#080012] border border-[#2a0050] text-text focus:border-[#bf5af2]";
  const selectCls = `${inputCls} cursor-pointer`;

  const TYPE_LABELS = { stock: "Stock", etf: "ETF", crypto: "Crypto" };
  const TYPE_COLORS = { stock: "#00f5d4", etf: "#bf5af2", crypto: "#ff2d78" };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: "rgba(8,0,18,0.85)", backdropFilter: "blur(4px)" }}>
      <div className="rounded-2xl w-full max-w-md p-6 synth-card border-glow-purple"
        style={{ borderColor: "#bf5af244" }}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold text-lg">Add Holding</h2>
          <button onClick={onClose} className="text-muted hover:text-white transition-colors">✕</button>
        </div>
        <p className="text-[11px] mb-5 leading-relaxed" style={{ color: "#4a3a5e" }}>
          Search by name or ticker — asset type is auto-detected.
        </p>

        <form onSubmit={submit} className="flex flex-col gap-4">

          {/* Ticker search */}
          <Field label="Ticker">
            <div className="relative" ref={wrapperRef}>
              <div className="relative">
                <input
                  className={inputCls + " w-full pr-24"}
                  placeholder="Search: Apple, NVDA, VUSA…"
                  value={form.ticker}
                  onChange={e => handleTickerChange(e.target.value)}
                  onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                />
                {/* Badge or spinner */}
                <span className="absolute right-2 top-1/2 -translate-y-1/2">
                  {searching ? (
                    <span className="w-3 h-3 rounded-full border-2 border-t-transparent animate-spin inline-block"
                      style={{ borderColor: "#bf5af266", borderTopColor: "transparent" }} />
                  ) : typeAutoDetected ? (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded"
                      style={{
                        background: `${TYPE_COLORS[form.type]}18`,
                        color: TYPE_COLORS[form.type],
                        border: `1px solid ${TYPE_COLORS[form.type]}44`,
                      }}>
                      {TYPE_LABELS[form.type]}
                    </span>
                  ) : null}
                </span>
              </div>

              {/* Suggestions dropdown */}
              {showSuggestions && (
                <div className="absolute top-full left-0 right-0 mt-1 rounded-xl overflow-hidden z-50"
                  style={{ background: "#0d0020", border: "1px solid #2a0050", boxShadow: "0 8px 32px #00000066" }}>
                  {suggestions.map((r, i) => (
                    <button
                      key={i}
                      type="button"
                      onMouseDown={() => selectSuggestion(r)}
                      className="w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors"
                      style={{ borderTop: i > 0 ? "1px solid #1a0030" : undefined }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#bf5af210")}
                      onMouseLeave={e => (e.currentTarget.style.background = "")}
                    >
                      <div>
                        <span className="text-sm font-bold font-mono" style={{ color: "#e2d9f3" }}>{r.ticker}</span>
                        <span className="text-xs text-muted ml-2 truncate max-w-48 inline-block align-middle">{r.name}</span>
                      </div>
                      <span className="text-[10px] font-mono shrink-0 ml-2" style={{ color: "#3a2a50" }}>{r.exchange}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Field>

          {/* Type override */}
          <Field label="Asset Type">
            <div className="flex gap-2">
              {(["stock", "etf", "crypto"] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setForm(f => ({ ...f, type: t })); setTypeAutoDetected(true); }}
                  className="flex-1 py-2 text-xs font-mono rounded-lg transition-all"
                  style={
                    form.type === t
                      ? { background: `${TYPE_COLORS[t]}22`, color: TYPE_COLORS[t], border: `1px solid ${TYPE_COLORS[t]}66` }
                      : { background: "#080012", color: "#4a3a5e", border: "1px solid #2a0050" }
                  }
                >
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Date">
            <input type="date" className={inputCls} value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Shares">
              <input type="number" step="any" min="0" className={inputCls} placeholder="10"
                value={form.shares} onChange={e => setForm(f => ({ ...f, shares: e.target.value }))} required />
            </Field>
            <Field label="Price per Share">
              <input type="number" step="any" min="0" className={inputCls} placeholder="149.49"
                value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} required />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Transaction">
              <select className={selectCls} value={form.txnType}
                onChange={e => setForm(f => ({ ...f, txnType: e.target.value as typeof f.txnType }))}>
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </select>
            </Field>
            <Field label="Currency">
              <select className={selectCls} value={form.currency}
                onChange={e => setForm(f => ({ ...f, currency: e.target.value as typeof f.currency }))}>
                <option value="GBP">GBP £</option>
                <option value="USD">USD $</option>
                <option value="EUR">EUR €</option>
              </select>
            </Field>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading || !form.ticker}
            className="mt-2 font-bold py-2.5 rounded-lg transition-all disabled:opacity-50"
            style={{ background: "linear-gradient(90deg, #bf5af2, #ff2d78)", color: "#fff" }}
          >
            {loading ? "Adding..." : "Add Holding"}
          </button>
        </form>
      </div>
    </div>
  );
}
