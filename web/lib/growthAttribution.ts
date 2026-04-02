import { trackEvent } from "@/lib/analytics";

export type AttributionProps = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  referrer_host?: string;
};

const ATTR_KEY = "portivex_first_touch_attribution_v1";
const LANDING_SEEN_KEY = "portivex_landing_seen_v1";

function sanitize(v: string | null): string | undefined {
  if (!v) return undefined;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 120) : undefined;
}

function getReferrerHost(): string | undefined {
  if (typeof document === "undefined") return undefined;
  if (!document.referrer) return undefined;
  try {
    return sanitize(new URL(document.referrer).hostname);
  } catch {
    return undefined;
  }
}

export function readAttribution(): AttributionProps {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(ATTR_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as AttributionProps;
    return {
      utm_source: sanitize(parsed.utm_source ?? null),
      utm_medium: sanitize(parsed.utm_medium ?? null),
      utm_campaign: sanitize(parsed.utm_campaign ?? null),
      utm_content: sanitize(parsed.utm_content ?? null),
      utm_term: sanitize(parsed.utm_term ?? null),
      referrer_host: sanitize(parsed.referrer_host ?? null),
    };
  } catch {
    return {};
  }
}

function hasAnyAttribution(a: AttributionProps): boolean {
  return Boolean(
    a.utm_source ||
      a.utm_medium ||
      a.utm_campaign ||
      a.utm_content ||
      a.utm_term ||
      a.referrer_host
  );
}

export function captureLandingAttribution() {
  if (typeof window === "undefined") return;

  const params = new URLSearchParams(window.location.search);
  const attribution: AttributionProps = {
    utm_source: sanitize(params.get("utm_source")),
    utm_medium: sanitize(params.get("utm_medium")),
    utm_campaign: sanitize(params.get("utm_campaign")),
    utm_content: sanitize(params.get("utm_content")),
    utm_term: sanitize(params.get("utm_term")),
    referrer_host: getReferrerHost(),
  };

  if (!hasAnyAttribution(attribution)) return;

  try {
    const existing = readAttribution();
    if (!hasAnyAttribution(existing)) {
      localStorage.setItem(ATTR_KEY, JSON.stringify(attribution));
    }
  } catch {
    // best effort only
  }

  try {
    const campaign = attribution.utm_campaign || "(none)";
    const dedupe = `${LANDING_SEEN_KEY}:${campaign}:${new Date().toISOString().slice(0, 10)}`;
    if (sessionStorage.getItem(dedupe) === "1") return;
    sessionStorage.setItem(dedupe, "1");
    void trackEvent("landing_attributed_visit", attribution);
  } catch {
    // best effort only
  }
}

