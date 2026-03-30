"use client";
import { useState } from "react";
import { addHolding } from "@/lib/api";
import { inferAssetType } from "@/lib/csvImport";

type Props = { onClose: () => void; onAdded: () => void };

export default function AddHoldingModal({ onClose, onAdded }: Props) {
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

  function handleTickerChange(raw: string) {
    const ticker = raw.toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
    const detected = inferAssetType(ticker);
    setForm(f => ({ ...f, ticker, type: detected }));
    setTypeAutoDetected(ticker.length >= 2);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await addHolding({
        ticker: form.ticker,
        type: form.type,
        transaction: {
          date: form.date,
          shares: parseFloat(form.shares),
          price: parseFloat(form.price),
          type: form.txnType,
          price_currency: form.currency,
        },
      });
      onAdded();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setLoading(false);
    }
  }

  function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-muted uppercase tracking-wider">{label}</span>
        {children}
      </div>
    );
  }

  const inputCls = "rounded-lg px-3 py-2 text-sm focus:outline-none transition-colors font-mono"
    + " bg-[#080012] border border-[#2a0050] text-text focus:border-[#bf5af2]";
  const selectCls = `${inputCls} cursor-pointer`;

  const TYPE_LABELS = { stock: "Stock", etf: "ETF", crypto: "Crypto" };
  const TYPE_COLORS = { stock: "#00f5d4", etf: "#bf5af2", crypto: "#ff2d78" };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: "rgba(8,0,18,0.85)", backdropFilter: "blur(4px)" }}>
      <div className="rounded-2xl w-full max-w-md p-6 synth-card border-glow-purple" style={{ borderColor: "#bf5af244" }}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold text-lg">Add Holding</h2>
          <button onClick={onClose} className="text-muted hover:text-white transition-colors">✕</button>
        </div>
        <p className="text-[11px] mb-5 leading-relaxed" style={{ color: "#4a3a5e" }}>
          Use the ticker symbol (e.g. <span style={{ color: "#bf5af2" }}>AAPL</span>, <span style={{ color: "#bf5af2" }}>VUSA.L</span>, <span style={{ color: "#bf5af2" }}>BTC-USD</span>).
          Asset type is auto-detected — override if needed.
        </p>

        <form onSubmit={submit} className="flex flex-col gap-4">
          {/* Ticker + auto-detected type badge */}
          <Field label="Ticker">
            <div className="relative">
              <input
                className={inputCls + " w-full pr-24"}
                placeholder="e.g. AAPL, VUSA.L"
                value={form.ticker}
                onChange={e => handleTickerChange(e.target.value)}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                required
              />
              {typeAutoDetected && (
                <span
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono px-2 py-0.5 rounded"
                  style={{
                    background: `${TYPE_COLORS[form.type]}18`,
                    color: TYPE_COLORS[form.type],
                    border: `1px solid ${TYPE_COLORS[form.type]}44`,
                  }}
                >
                  {TYPE_LABELS[form.type]}
                </span>
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
            <input
              type="date"
              className={inputCls}
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              required
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Shares">
              <input
                type="number"
                step="any"
                min="0"
                className={inputCls}
                placeholder="10"
                value={form.shares}
                onChange={e => setForm(f => ({ ...f, shares: e.target.value }))}
                required
              />
            </Field>
            <Field label="Price per Share">
              <input
                type="number"
                step="any"
                min="0"
                className={inputCls}
                placeholder="149.49"
                value={form.price}
                onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                required
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Transaction">
              <select
                className={selectCls}
                value={form.txnType}
                onChange={e => setForm(f => ({ ...f, txnType: e.target.value as typeof f.txnType }))}
              >
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </select>
            </Field>
            <Field label="Currency">
              <select
                className={selectCls}
                value={form.currency}
                onChange={e => setForm(f => ({ ...f, currency: e.target.value as typeof f.currency }))}
              >
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
