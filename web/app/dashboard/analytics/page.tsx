"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetchAdminAnalytics, fetchAdminMe, type AnalyticsSummary } from "@/lib/api";

export default function AnalyticsPage() {
  const { userId, isLoaded } = useAuth();
  const router = useRouter();
  const [days, setDays] = useState(14);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!isLoaded || !userId) return;
    fetchAdminMe()
      .then((r) => {
        if (!r.is_admin) {
          router.replace("/dashboard");
          return;
        }
        setIsAdmin(true);
      })
      .catch(() => {
        router.replace("/dashboard");
      });
  }, [isLoaded, userId, router]);

  async function loadSummary() {
    setLoading(true);
    setError("");
    try {
      setData(await fetchAdminAnalytics(days));
    } catch (e: any) {
      setError(e?.message ?? "Failed to fetch analytics summary.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isLoaded || !isAdmin || !userId) return;
    loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isAdmin, userId]);

  if (!isLoaded || !isAdmin || !userId) return null;

  return (
    <div className="p-4 md:p-6 max-w-screen-xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-sm mt-1" style={{ color: "#6b5e7e" }}>
          Admin-only funnel snapshot from captured product events.
        </p>
        <div className="mt-3">
          <Link
            href="/dashboard/growth"
            className="inline-flex px-3 py-2 rounded-lg text-xs font-semibold"
            style={{ border: "1px solid #2a0050", color: "#bf5af2", background: "#bf5af211" }}
          >
            Open Growth OS
          </Link>
        </div>
      </div>

      <div className="rounded-xl p-4 flex flex-col md:flex-row md:items-end gap-3" style={{ background: "#0d0020", border: "1px solid #2a0050" }}>
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
          disabled={loading}
          className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
          style={{ background: "linear-gradient(90deg,#bf5af2,#ff2d78)", color: "#fff" }}
        >
          {loading ? "Loading..." : "Reload"}
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

          <div className="synth-card rounded-xl p-4">
            <h2 className="text-sm font-semibold mb-3">Campaign Breakdown</h2>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: "#6b5e7e" }}>
                    <th className="text-left pb-2">Campaign</th>
                    <th className="text-right pb-2">Visits</th>
                    <th className="text-right pb-2">Signups</th>
                    <th className="text-right pb-2">Signup CVR</th>
                    <th className="text-right pb-2">Reviews</th>
                    <th className="text-right pb-2">Review CVR</th>
                  </tr>
                </thead>
                <tbody>
                  {data.campaigns.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-3 text-center" style={{ color: "#6b5e7e" }}>
                        No campaign attribution data yet.
                      </td>
                    </tr>
                  )}
                  {data.campaigns.map((c) => (
                    <tr key={c.campaign} style={{ borderTop: "1px solid #1a0030" }}>
                      <td className="py-2 font-mono">{c.campaign}</td>
                      <td className="py-2 text-right font-mono">{c.visits}</td>
                      <td className="py-2 text-right font-mono">{c.signups}</td>
                      <td className="py-2 text-right font-mono">{c.signup_rate_from_visit}%</td>
                      <td className="py-2 text-right font-mono">{c.reviews}</td>
                      <td className="py-2 text-right font-mono">{c.review_rate_from_signup}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="synth-card rounded-xl p-4">
            <h2 className="text-sm font-semibold mb-3">Weekly Cohorts (7d Outcomes)</h2>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: "#6b5e7e" }}>
                    <th className="text-left pb-2">Cohort Week</th>
                    <th className="text-right pb-2">Users</th>
                    <th className="text-right pb-2">Activated 7d</th>
                    <th className="text-right pb-2">Review 7d</th>
                    <th className="text-right pb-2">High Intent 7d</th>
                  </tr>
                </thead>
                <tbody>
                  {data.cohorts.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-3 text-center" style={{ color: "#6b5e7e" }}>
                        No cohort data yet
                      </td>
                    </tr>
                  )}
                  {data.cohorts.map((c) => (
                    <tr key={c.cohort_week} style={{ borderTop: "1px solid #1a0030" }}>
                      <td className="py-2 font-mono">{c.cohort_week}</td>
                      <td className="py-2 text-right font-mono">{c.users}</td>
                      <td className="py-2 text-right font-mono">
                        {c.activated_7d} ({c.activation_rate_7d}%)
                      </td>
                      <td className="py-2 text-right font-mono">
                        {c.review_7d} ({c.review_rate_7d}%)
                      </td>
                      <td className="py-2 text-right font-mono">
                        {c.high_intent_7d} ({c.high_intent_rate_7d}%)
                      </td>
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
