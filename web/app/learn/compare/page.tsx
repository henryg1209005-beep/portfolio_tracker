import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { METRIC_COMPARISONS } from "@/lib/metric-comparisons";

export const metadata: Metadata = {
  title: "Metric Comparisons | Portivex Learn",
  description:
    "Compare portfolio risk metrics side by side: Sharpe vs Sortino, VaR vs Maximum Drawdown, Beta vs Correlation, and more.",
  alternates: { canonical: "https://portivex.co.uk/learn/compare" },
  openGraph: {
    title: "Metric Comparisons | Portivex Learn",
    description:
      "Side-by-side metric explainers to help you choose the right risk measure for your portfolio decisions.",
    url: "https://portivex.co.uk/learn/compare",
    siteName: "Portivex",
    type: "website",
  },
};

export default function LearnCompareIndexPage() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#080012", color: "#e2d9f3" }}>
      <nav
        className="sticky top-0 z-50"
        style={{
          background: "linear-gradient(180deg,#080012ee,#080012aa)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid #1a0030",
        }}
      >
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/learn" className="text-sm font-medium" style={{ color: "#6b5e7e" }}>
              Back to library
            </Link>
            <Link href="/">
              <Image src="/logo.png" alt="Portivex" width={120} height={40} className="object-contain" />
            </Link>
          </div>
          <Link
            href="/sign-up"
            className="px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ background: "linear-gradient(90deg,#bf5af2,#ff2d78)", color: "#fff" }}
          >
            Start free
          </Link>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-14 w-full flex-1">
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono mb-5"
          style={{ background: "#bf5af211", border: "1px solid #bf5af233", color: "#bf5af2" }}
        >
          Metric Comparison Hub
        </div>
        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight mb-4">
          Choose the right metric for the decision.
        </h1>
        <p className="text-base sm:text-lg max-w-2xl leading-relaxed mb-10" style={{ color: "#8a7a9e" }}>
          These side-by-side guides explain where similar-looking metrics differ, what each one misses,
          and how to use them together without blind spots.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {METRIC_COMPARISONS.map((item) => (
            <Link
              key={item.slug}
              href={`/learn/compare/${item.slug}`}
              className="group rounded-2xl p-5 transition-all hover:scale-[1.01]"
              style={{ background: "linear-gradient(135deg,#10001e,#0a0014)", border: "1px solid #2a0050" }}
            >
              <div className="flex items-start justify-between mb-3">
                <span
                  className="text-[10px] font-mono px-2.5 py-1 rounded-full uppercase tracking-widest"
                  style={{ color: "#bf5af2", background: "#bf5af211", border: "1px solid #bf5af233" }}
                >
                  Comparison
                </span>
                <span className="text-xs font-mono opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "#bf5af2" }}>
                  Read
                </span>
              </div>
              <h2 className="text-base font-semibold mb-1">{item.shortTitle}</h2>
              <p className="text-sm leading-relaxed" style={{ color: "#8a7a9e" }}>
                {item.summary}
              </p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
