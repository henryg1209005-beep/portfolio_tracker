"use client";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { fetchAdminAnalytics, fetchAdminMe, type AnalyticsSummary } from "@/lib/api";
import { trackEvent } from "@/lib/analytics";

const X_QUERIES = [
  "portfolio review",
  "rate my portfolio",
  "etf portfolio",
  "drawdown",
  "sharpe ratio",
  "risk management investing",
  "underperforming portfolio",
  "S&P 500 portfolio",
];

const REPLY_TEMPLATES = [
  "Big thing to check is risk-adjusted quality, not just return %. Weak Sharpe + overlap usually explains this setup.",
  "Your return can be green while risk quality is weak. Drawdown pressure + overlap are usually the hidden drag.",
  "Before changing picks, check concentration and downside quality. It often fixes more than swapping tickers.",
  "The key question is: are you being paid for risk? Sharpe/Sortino tells you fast.",
];

function metricCount(data: AnalyticsSummary | null, key: string): number {
  if (!data) return 0;
  return data.events.find((e) => e.event_name === key)?.count ?? 0;
}

export default function GrowthPage() {
  const { userId, isLoaded } = useAuth();
  const router = useRouter();
  const [days, setDays] = useState(14);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [utmSource, setUtmSource] = useState("x");
  const [utmMedium, setUtmMedium] = useState("social");
  const [utmCampaign, setUtmCampaign] = useState("risk_launch");
  const [utmContent, setUtmContent] = useState("creative_a");
  const [baseUrl, setBaseUrl] = useState("https://portivex.co.uk/");

  const trackedUrl = useMemo(() => {
    try {
      const u = new URL(baseUrl);
      u.searchParams.set("utm_source", utmSource.trim() || "x");
      u.searchParams.set("utm_medium", utmMedium.trim() || "social");
      u.searchParams.set("utm_campaign", utmCampaign.trim() || "risk_launch");
      if (utmContent.trim()) u.searchParams.set("utm_content", utmContent.trim());
      return u.toString();
    } catch {
      return "Invalid base URL";
    }
  }, [baseUrl, utmSource, utmMedium, utmCampaign, utmContent]);

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
      .catch(() => router.replace("/dashboard"));
  }, [isLoaded, userId, router]);

  async function loadSummary() {
    setLoading(true);
    setError("");
    try {
      setData(await fetchAdminAnalytics(days));
    } catch (e: any) {
      setError(e?.message ?? "Failed to fetch growth metrics.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isLoaded || !isAdmin || !userId) return;
    void loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isAdmin, userId]);

  function copyText(value: string, eventName: string) {
    navigator.clipboard.writeText(value);
    void trackEvent(eventName, { value_length: value.length, utm_campaign: utmCampaign });
  }

  function logAction(eventName: string, count = 1) {
    void trackEvent(eventName, { count, utm_campaign: utmCampaign });
  }

  if (!isLoaded || !isAdmin || !userId) return null;

  return (
    <div className="p-4 md:p-6 max-w-screen-xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Growth OS</h1>
        <p className="text-sm mt-1" style={{ color: "#6b5e7e" }}>
          Coded promotion workflow: discover, post, reply, track, iterate.
        </p>
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Attributed Visits" value={metricCount(data, "landing_attributed_visit")} />
        <MetricCard label="Attributed Signups" value={metricCount(data, "signup_completed")} />
        <MetricCard label="First Reviews" value={metricCount(data, "first_review_run")} />
        <MetricCard label="Posts Logged" value={metricCount(data, "growth_post_published")} />
      </div>

      <div className="synth-card rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-semibold">Tracked Link Builder (UTM)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <Input label="Base URL" value={baseUrl} onChange={setBaseUrl} />
          <Input label="utm_source" value={utmSource} onChange={setUtmSource} />
          <Input label="utm_medium" value={utmMedium} onChange={setUtmMedium} />
          <Input label="utm_campaign" value={utmCampaign} onChange={setUtmCampaign} />
          <Input label="utm_content" value={utmContent} onChange={setUtmContent} />
        </div>
        <div className="rounded-lg px-3 py-2 font-mono text-xs break-all" style={{ background: "#0d0020", border: "1px solid #1a0030", color: "#e2d9f3" }}>
          {trackedUrl}
        </div>
        <button
          onClick={() => copyText(trackedUrl, "growth_link_copied")}
          className="px-3 py-2 text-sm rounded-lg font-semibold"
          style={{ background: "linear-gradient(90deg,#bf5af2,#ff2d78)", color: "#fff" }}
        >
          Copy tracked URL
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="synth-card rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold">X Query Bank</h2>
          {X_QUERIES.map((q) => {
            const url = `https://x.com/search?q=${encodeURIComponent(q)}&src=typed_query&f=live`;
            return (
              <div key={q} className="rounded-lg px-3 py-2 flex items-center justify-between gap-2" style={{ background: "#0d0020", border: "1px solid #1a0030" }}>
                <span className="font-mono text-xs" style={{ color: "#e2d9f3" }}>{q}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => copyText(q, "growth_query_copied")}
                    className="px-2.5 py-1.5 text-xs rounded-md"
                    style={{ border: "1px solid #2a0050", color: "#6b5e7e" }}
                  >
                    Copy
                  </button>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1.5 text-xs rounded-md"
                    style={{ border: "1px solid #00f5d433", color: "#00f5d4" }}
                    onClick={() => logAction("growth_query_opened", 1)}
                  >
                    Open
                  </a>
                </div>
              </div>
            );
          })}
        </div>

        <div className="synth-card rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold">Reply Template Bank</h2>
          {REPLY_TEMPLATES.map((t, i) => (
            <div key={i} className="rounded-lg p-3 text-sm" style={{ background: "#0d0020", border: "1px solid #1a0030", color: "#e2d9f3" }}>
              <p className="leading-relaxed">{t}</p>
              <button
                onClick={() => copyText(t, "growth_reply_template_copied")}
                className="mt-2 px-2.5 py-1.5 text-xs rounded-md"
                style={{ border: "1px solid #2a0050", color: "#6b5e7e" }}
              >
                Copy template
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="synth-card rounded-xl p-4">
        <h2 className="text-sm font-semibold mb-3">Daily Execution Logger</h2>
        <div className="flex flex-wrap gap-2">
          <ActionButton label="Log Post Published" onClick={() => logAction("growth_post_published")} />
          <ActionButton label="Log 10 Replies Sent" onClick={() => logAction("growth_replies_sent", 10)} />
          <ActionButton label="Log 5 DMs Sent" onClick={() => logAction("growth_dms_sent", 5)} />
          <ActionButton label="Log Follow-up Post" onClick={() => logAction("growth_followup_post_published")} />
        </div>
      </div>

      {data && (
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
                      No campaign attribution data yet. Start using tracked URLs.
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
      )}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="synth-card rounded-xl p-4">
      <div className="text-xs font-mono" style={{ color: "#6b5e7e" }}>{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-xs font-mono block mb-1.5" style={{ color: "#6b5e7e" }}>{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg px-3 py-2 text-sm bg-transparent"
        style={{ border: "1px solid #2a0050", color: "#e2d9f3" }}
      />
    </div>
  );
}

function ActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-2 text-sm rounded-lg font-semibold"
      style={{ border: "1px solid #2a0050", color: "#e2d9f3", background: "#0d0020" }}
    >
      {label}
    </button>
  );
}

