import { METRICS } from "@/lib/metrics-data";
import { METRIC_COMPARISONS } from "@/lib/metric-comparisons";
import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const metricPages = METRICS.map((m) => ({
    url: `https://portivex.co.uk/learn/${m.slug}`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));
  const comparisonPages = METRIC_COMPARISONS.map((c) => ({
    url: `https://portivex.co.uk/learn/compare/${c.slug}`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.75,
  }));

  return [
    { url: "https://portivex.co.uk", lastModified: new Date(), priority: 1.0 },
    { url: "https://portivex.co.uk/learn", lastModified: new Date(), changeFrequency: "monthly", priority: 0.9 },
    { url: "https://portivex.co.uk/learn/compare", lastModified: new Date(), changeFrequency: "monthly", priority: 0.85 },
    ...metricPages,
    ...comparisonPages,
  ];
}
