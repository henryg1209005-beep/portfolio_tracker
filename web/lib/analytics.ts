const BASE = "/api";

type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;

function cleanProps(props: AnalyticsProps = {}) {
  const out: Record<string, string | number | boolean | null> = {};
  Object.entries(props).forEach(([k, v]) => {
    if (v === undefined) return;
    out[k] = v;
  });
  return out;
}

export async function trackEvent(eventName: string, properties: AnalyticsProps = {}) {
  if (typeof window === "undefined") return;
  try {
    const token = localStorage.getItem("portivex_token") ?? "";
    const payload = {
      event_name: eventName,
      properties: cleanProps({
        ...properties,
        path: window.location.pathname,
        referrer: document.referrer || null,
        user_agent: navigator.userAgent,
        viewport_w: window.innerWidth,
        viewport_h: window.innerHeight,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    };
    await fetch(`${BASE}/analytics/event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "X-Portfolio-Token": token } : {}),
      },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    // Analytics is best-effort and must never block UX.
  }
}
