"use client";
import { useCallback, useRef, useState } from "react";
import {
  parseCSV, detectBroker, parseRevolut, parseWithMapping, inferAssetType,
  type BrokerFormat, type ColumnMapping, type Currency, type MappedTransaction,
} from "@/lib/csvImport";
import { importTransactions } from "@/lib/api";

// ── Step types ────────────────────────────────────────────────────────────────

type Step = "upload" | "map" | "preview" | "done";

// ── Sub-components ────────────────────────────────────────────────────────────

function StepDot({ active, done }: { active: boolean; done: boolean }) {
  return (
    <span
      className="w-2 h-2 rounded-full"
      style={{ background: done ? "#00f5d4" : active ? "#bf5af2" : "#2a0050" }}
    />
  );
}

function ErrorBadge({ msg }: { msg: string }) {
  return (
    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "#ff2d7822", color: "#ff2d78" }}>
      {msg}
    </span>
  );
}

// ── Column mapping form ───────────────────────────────────────────────────────

function MapStep({
  headers,
  previewRows,
  mapping,
  setMapping,
  defaultCurrency,
  setDefaultCurrency,
  onPreview,
}: {
  headers: string[];
  previewRows: Record<string, string>[];
  mapping: ColumnMapping;
  setMapping: (m: ColumnMapping) => void;
  defaultCurrency: Currency;
  setDefaultCurrency: (c: Currency) => void;
  onPreview: () => void;
}) {
  const REQUIRED: (keyof ColumnMapping)[] = ["date", "ticker", "shares", "price", "action"];
  const LABELS: Record<keyof ColumnMapping, string> = {
    date:     "Date",
    ticker:   "Ticker / Symbol",
    shares:   "Quantity / Shares",
    price:    "Price per share",
    currency: "Currency (optional)",
    action:   "Action (Buy / Sell)",
  };

  const allMapped = REQUIRED.every(k => mapping[k]);
  const opts = ["", ...headers];

  return (
    <div className="flex flex-col gap-5">
      <div className="text-sm text-muted leading-relaxed">
        We couldn't auto-detect the broker format. Map your CSV columns to the required fields below.
      </div>

      {/* Column mapping selects */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(Object.keys(LABELS) as (keyof ColumnMapping)[]).map(field => (
          <div key={field} className="flex flex-col gap-1">
            <label className="text-[11px] font-mono text-muted uppercase tracking-wider">
              {LABELS[field]}
              {!REQUIRED.includes(field) && <span className="ml-1 opacity-50">(optional)</span>}
            </label>
            <select
              value={mapping[field]}
              onChange={e => setMapping({ ...mapping, [field]: e.target.value })}
              className="rounded-lg px-3 py-2 text-sm font-mono outline-none"
              style={{ background: "#0d0020", border: `1px solid ${mapping[field] || !REQUIRED.includes(field) ? "#2a0050" : "#ff2d7866"}`, color: "#e2d9f3" }}
            >
              {opts.map(o => <option key={o} value={o}>{o || "— select —"}</option>)}
            </select>
          </div>
        ))}
      </div>

      {/* Default currency */}
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-mono text-muted uppercase tracking-wider">
          Default currency (used when no currency column)
        </label>
        <div className="flex gap-2">
          {(["GBP", "USD", "EUR"] as Currency[]).map(c => (
            <button
              key={c}
              onClick={() => setDefaultCurrency(c)}
              className="px-3 py-1.5 text-xs font-mono rounded-lg transition-all"
              style={
                defaultCurrency === c
                  ? { background: "linear-gradient(90deg,#bf5af2,#ff2d78)", color: "#fff" }
                  : { background: "#0d0020", border: "1px solid #2a0050", color: "#6b5e7e" }
              }
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* CSV preview */}
      {previewRows.length > 0 && (
        <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid #1a0030" }}>
          <table className="w-full text-[11px] font-mono">
            <thead>
              <tr style={{ borderBottom: "1px solid #1a0030" }}>
                {headers.map(h => (
                  <th key={h} className="px-3 py-2 text-left" style={{ color: "#bf5af2", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.slice(0, 3).map((row, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #0d0020" }}>
                  {headers.map(h => (
                    <td key={h} className="px-3 py-1.5 text-muted truncate max-w-32">{row[h]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button
        onClick={onPreview}
        disabled={!allMapped}
        className="px-5 py-2.5 text-sm font-semibold rounded-lg transition-all disabled:opacity-40 self-start"
        style={{ background: "linear-gradient(90deg,#bf5af2,#ff2d78)", color: "#fff" }}
      >
        Preview Transactions →
      </button>
    </div>
  );
}

// ── Preview table ─────────────────────────────────────────────────────────────

function PreviewStep({
  transactions,
  onImport,
  importing,
}: {
  transactions: MappedTransaction[];
  onImport: () => void;
  importing: boolean;
}) {
  const valid   = transactions.filter(t => !t.error);
  const invalid = transactions.filter(t => t.error);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-4 text-xs font-mono">
        <span style={{ color: "#00f5d4" }}>{valid.length} valid</span>
        {invalid.length > 0 && <span style={{ color: "#ff2d78" }}>{invalid.length} with errors (will be skipped)</span>}
      </div>

      <div className="overflow-x-auto rounded-xl max-h-80 overflow-y-auto" style={{ border: "1px solid #1a0030" }}>
        <table className="w-full text-xs font-mono">
          <thead className="sticky top-0" style={{ background: "#0d0020" }}>
            <tr style={{ borderBottom: "1px solid #1a0030" }}>
              {["Date", "Ticker", "Shares", "Price", "Currency", "Action", ""].map(h => (
                <th key={h} className="px-3 py-2 text-left" style={{ color: "#bf5af2", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {transactions.map((t, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #0d0020", opacity: t.error ? 0.5 : 1 }}>
                <td className="px-3 py-1.5 text-muted">{t.date}</td>
                <td className="px-3 py-1.5" style={{ color: "#e2d9f3" }}>{t.ticker}</td>
                <td className="px-3 py-1.5 text-muted">{t.shares}</td>
                <td className="px-3 py-1.5 text-muted">{t.price}</td>
                <td className="px-3 py-1.5 text-muted">{t.price_currency}</td>
                <td className="px-3 py-1.5" style={{ color: t.type === "buy" ? "#00f5d4" : "#ff2d78" }}>
                  {t.type.toUpperCase()}
                </td>
                <td className="px-3 py-1.5">
                  {t.error && <ErrorBadge msg={t.error} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        onClick={onImport}
        disabled={valid.length === 0 || importing}
        className="px-5 py-2.5 text-sm font-semibold rounded-lg transition-all disabled:opacity-40 self-start flex items-center gap-2"
        style={{ background: "linear-gradient(90deg,#bf5af2,#ff2d78)", color: "#fff" }}
      >
        {importing
          ? <><span className="w-3 h-3 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "#ffffff66", borderTopColor: "transparent" }} />Importing…</>
          : `Import ${valid.length} transaction${valid.length !== 1 ? "s" : ""}`
        }
      </button>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export default function ImportCSVModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging]         = useState(false);
  const [step, setStep]                 = useState<Step>("upload");
  const [broker, setBroker]             = useState<BrokerFormat>("generic");
  const [headers, setHeaders]           = useState<string[]>([]);
  const [rows, setRows]                 = useState<Record<string, string>[]>([]);
  const [mapping, setMapping]           = useState<ColumnMapping>({ date: "", ticker: "", shares: "", price: "", currency: "", action: "" });
  const [defaultCurrency, setDefaultCurrency] = useState<Currency>("GBP");
  const [transactions, setTransactions] = useState<MappedTransaction[]>([]);
  const [importing, setImporting]       = useState(false);
  const [result, setResult]             = useState<{ imported: number; skipped: number } | null>(null);
  const [parseError, setParseError]     = useState("");

  const processFile = useCallback((file: File) => {
    setParseError("");
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      const { headers: h, rows: r } = parseCSV(text);

      if (h.length === 0) {
        setParseError("Could not parse the CSV file. Make sure it's a valid export.");
        return;
      }

      setHeaders(h);
      setRows(r);

      const detected = detectBroker(h);
      setBroker(detected);

      if (detected === "revolut") {
        const txns = parseRevolut(r);
        setTransactions(txns);
        setStep("preview");
      } else {
        // Auto-populate mapping for obvious column names
        const find = (...candidates: string[]) =>
          candidates.find(c => h.some(hh => hh.toLowerCase() === c.toLowerCase())) ?? "";
        setMapping({
          date:     find("date", "time", "transaction date", "datetime"),
          ticker:   find("ticker", "symbol", "stock", "asset", "isin"),
          shares:   find("quantity", "shares", "amount", "no. of shares", "units"),
          price:    find("price", "price per share", "unit price", "cost"),
          currency: find("currency", "ccy"),
          action:   find("type", "side", "action", "direction", "transaction type"),
        });
        setStep("map");
      }
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  function handlePreview() {
    const txns = parseWithMapping(rows, mapping, defaultCurrency);
    setTransactions(txns);
    setStep("preview");
  }

  async function handleImport() {
    const valid = transactions.filter(t => !t.error);
    if (valid.length === 0) return;
    setImporting(true);
    try {
      const res = await importTransactions(
        valid.map(t => ({
          ticker: t.ticker,
          type: t.type,
          date: t.date,
          shares: t.shares,
          price: t.price,
          price_currency: t.price_currency,
          asset_type: inferAssetType(t.ticker),
        }))
      );
      setResult(res);
      setStep("done");
      onImported();
    } catch {
      setParseError("Import failed. Make sure the API server is running.");
    } finally {
      setImporting(false);
    }
  }

  const stepIndex = { upload: 0, map: 1, preview: 2, done: 3 };
  const si = stepIndex[step];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(5,0,12,0.85)", backdropFilter: "blur(8px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl flex flex-col"
        style={{
          background: "linear-gradient(170deg, #0f0020 0%, #080012 100%)",
          border: "1px solid #2a0050",
          boxShadow: "0 0 60px #bf5af222",
        }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 px-6 py-4 flex items-center justify-between"
          style={{ background: "#0f0020ee", borderBottom: "1px solid #2a0050", backdropFilter: "blur(12px)" }}>
          <div>
            <h2 className="font-bold text-base text-text">Import Transactions</h2>
            <p className="text-[11px] text-muted font-mono mt-0.5">
              {broker === "revolut" && step !== "upload" ? "Revolut Investing detected" : "CSV file import"}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {/* Step indicators */}
            <div className="flex items-center gap-1.5">
              {(["upload", "preview", "done"] as const).map((s, i) => (
                <StepDot key={s} active={step === s || (s === "preview" && step === "map")} done={si > i} />
              ))}
            </div>
            <button onClick={onClose} style={{ color: "#6b5e7e" }} className="hover:text-text transition-colors text-lg leading-none">✕</button>
          </div>
        </div>

        <div className="flex-1 px-6 py-6 flex flex-col gap-5">

          {parseError && (
            <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "#ff2d7811", border: "1px solid #ff2d7833", color: "#ff2d78" }}>
              {parseError}
            </div>
          )}

          {/* Upload step */}
          {step === "upload" && (
            <div className="flex flex-col gap-5">
              <p className="text-sm text-muted leading-relaxed">
                Export your transaction history from Revolut Investing (or any broker) as a CSV file, then upload it here.
                Transactions already in your portfolio are automatically skipped.
              </p>

              {/* Drop zone */}
              <div
                className="rounded-2xl flex flex-col items-center justify-center gap-3 py-14 cursor-pointer transition-all"
                style={{
                  border: `2px dashed ${dragging ? "#bf5af2" : "#2a0050"}`,
                  background: dragging ? "#bf5af211" : "#0d0020",
                }}
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
              >
                <div className="text-4xl" style={{ color: dragging ? "#bf5af2" : "#2a0050" }}>↑</div>
                <div className="text-sm font-medium text-text">Drop your CSV here</div>
                <div className="text-xs text-muted">or click to browse</div>
                <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileInput} />
              </div>

              {/* Revolut instructions */}
              <div className="rounded-xl p-4 text-xs leading-relaxed" style={{ background: "#0d0020", border: "1px solid #1a0030" }}>
                <div className="font-mono text-muted mb-2 uppercase tracking-wider text-[10px]">How to export from Revolut</div>
                <ol className="text-muted space-y-1 list-decimal list-inside">
                  <li>Open Revolut app → Investing tab</li>
                  <li>Tap your profile icon → <span style={{ color: "#bf5af2" }}>Statements</span></li>
                  <li>Select <span style={{ color: "#bf5af2" }}>Trading statement</span> → choose date range → Export as CSV</li>
                </ol>
              </div>
            </div>
          )}

          {/* Map step */}
          {step === "map" && (
            <MapStep
              headers={headers}
              previewRows={rows}
              mapping={mapping}
              setMapping={setMapping}
              defaultCurrency={defaultCurrency}
              setDefaultCurrency={setDefaultCurrency}
              onPreview={handlePreview}
            />
          )}

          {/* Preview step */}
          {step === "preview" && (
            <PreviewStep
              transactions={transactions}
              onImport={handleImport}
              importing={importing}
            />
          )}

          {/* Done step */}
          {step === "done" && result && (
            <div className="flex flex-col items-center gap-5 py-6 text-center">
              <div className="text-5xl" style={{ color: "#00f5d4" }}>✓</div>
              <div>
                <div className="text-lg font-bold text-text">Import complete</div>
                <div className="text-sm text-muted mt-1">
                  <span style={{ color: "#00f5d4" }}>{result.imported} transaction{result.imported !== 1 ? "s" : ""} added</span>
                  {result.skipped > 0 && <span className="ml-2 text-muted">· {result.skipped} duplicate{result.skipped !== 1 ? "s" : ""} skipped</span>}
                </div>
              </div>
              <button
                onClick={onClose}
                className="px-6 py-2.5 text-sm font-semibold rounded-lg"
                style={{ background: "linear-gradient(90deg,#bf5af2,#ff2d78)", color: "#fff" }}
              >
                Done
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
