"use client";
import { useEffect, useState } from "react";

type Summary = {
  window_days: number;
  totals: { events: number; unique_tokens: number };
  funnel: Array<Record<string, string | number>>;
  events: Array<{ event_name: string; count: number }>;
};

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

export default function AnalyticsPage() {
  const [adminKey, setAdminKey] = useState("");
  const [days, setDays] = useState(14);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<Summary | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("portivex_admin_key") ?? "";
    if (saved) setAdminKey(saved);
  }, []);

  async function loadSummary() {
    setLoading(true);
    setError("");
    try {
      const key = adminKey.trim();
      localStorage.setItem("portivex_admin_key", key);
      const params = new URLSearchParams({ key, days: String(days) });
      let res: Response;
      try {
        res = await fetch(`${BASE}/admin/analytics?${params}`, { cache: "no-store" });
      } catch {
        // Fallback to same-origin route if NEXT_PUBLIC_API_URL points to an unreachable host.
        res = await fetch(`/api/admin/analytics?${params}`, { cache: "no-store" });
      }
      if (!res.ok) {
        let detail = "";
        try {
          const body = await res.json();
          detail = body?.detail ? ` ${body.detail}` : "";
        } catch {}
        if (res.status === 403) throw new Error(`Forbidden (${res.status}). Check ADMIN_KEY.${detail}`);
        if (res.status === 404) throw new Error(`Not found (${res.status}). API route not deployed.${detail}`);
        throw new Error(`Failed to fetch analytics summary (${res.status}).${detail}`);
      }
      setData(await res.json());
    } catch (e: any) {
      setError(e?.message ?? "Failed to fetch analytics summary.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-screen-xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-sm mt-1" style={{ color: "#6b5e7e" }}>
          Admin funnel snapshot from captured product events.
        </p>
      </div>

      <div className="rounded-xl p-4 flex flex-col md:flex-row md:items-end gap-3" style={{ background: "#0d0020", border: "1px solid #2a0050" }}>
        <div className="flex-1">
          <label className="text-xs font-mono block mb-1.5" style={{ color: "#6b5e7e" }}>Admin Key</label>
          <input
            type="password"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm bg-transparent"
            style={{ border: "1px solid #2a0050", color: "#e2d9f3" }}
            placeholder="Enter ADMIN_KEY"
          />
        </div>
        <div className="w-full md:w-36">
          <label className="text-xs font-mono block mb-1.5" style={{ color: "#6b5e7e" }}>Window (days)</label>
          <input
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(e) => setDays(Number(e.target.value) || 14)}
            className="w-full rounded-lg px-3 py-2 text-sm bg-transparent"
            style={{ border: "1px solid #2a0050", color: "#e2d9f3" }}
          />
        </div>
        <button
          onClick={loadSummary}
          disabled={loading || !adminKey.trim()}
          className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
          style={{ background: "linear-gradient(90deg,#bf5af2,#ff2d78)", color: "#fff" }}
        >
          {loading ? "Loading..." : "Load"}
        </button>
      </div>

      {error && (
        <div className="rounded-xl p-4 text-sm" style={{ background: "#ff2d7811", border: "1px solid #ff2d7833", color: "#ff2d78" }}>
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="synth-card rounded-xl p-4">
              <div className="text-xs font-mono" style={{ color: "#6b5e7e" }}>Total Events ({data.window_days}d)</div>
              <div className="text-2xl font-bold mt-1">{data.totals.events}</div>
            </div>
            <div className="synth-card rounded-xl p-4">
              <div className="text-xs font-mono" style={{ color: "#6b5e7e" }}>Unique Tokens</div>
              <div className="text-2xl font-bold mt-1">{data.totals.unique_tokens}</div>
            </div>
          </div>

          <div className="synth-card rounded-xl p-4">
            <h2 className="text-sm font-semibold mb-3">Funnel</h2>
            <div className="space-y-2">
              {data.funnel.map((row) => (
                <div key={String(row.step)} className="rounded-lg px-3 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1" style={{ background: "#0d0020", border: "1px solid #1a0030" }}>
                  <span className="text-sm font-mono" style={{ color: "#e2d9f3" }}>{String(row.step)}</span>
                  <span className="text-xs font-mono" style={{ color: "#6b5e7e" }}>
                    users: {String(row.users ?? 0)}{" "}
                    {row.rate_from_total != null ? `| rate: ${String(row.rate_from_total)}%` : ""}
                    {row.rate_from_dashboard != null ? `| rate: ${String(row.rate_from_dashboard)}%` : ""}
                    {row.rate_from_activated != null ? `| rate: ${String(row.rate_from_activated)}%` : ""}
                    {row.rate_from_review != null ? `| rate: ${String(row.rate_from_review)}%` : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="synth-card rounded-xl p-4">
            <h2 className="text-sm font-semibold mb-3">Top Events</h2>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: "#6b5e7e" }}>
                    <th className="text-left pb-2">Event</th>
                    <th className="text-right pb-2">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {data.events.map((ev) => (
                    <tr key={ev.event_name} style={{ borderTop: "1px solid #1a0030" }}>
                      <td className="py-2 font-mono">{ev.event_name}</td>
                      <td className="py-2 text-right font-mono">{ev.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
