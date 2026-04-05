import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { METRICS } from "@/lib/metrics-data";

export const metadata: Metadata = {
  title: "Portfolio Risk Metrics Explained | Portivex",
  description:
    "Plain-English explanations of every risk metric in your portfolio — Sharpe Ratio, Sortino Ratio, Beta, VaR, Maximum Drawdown, and more. Learn what each number actually means.",
  alternates: { canonical: "https://portivex.co.uk/learn" },
  openGraph: {
    title: "Portfolio Risk Metrics Explained | Portivex",
    description:
      "Plain-English explanations of every risk metric in your portfolio. Learn what Sharpe, Sortino, Beta, VaR, and Maximum Drawdown really mean.",
    url: "https://portivex.co.uk/learn",
    siteName: "Portivex",
    type: "website",
  },
};

const CATEGORY_LABELS: Record<string, string> = {
  risk: "Risk",
  return: "Return",
  benchmark: "Benchmark",
  distribution: "Distribution",
};

export default function LearnIndexPage() {
  const categories = ["risk", "benchmark", "return", "distribution"] as const;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#080012", color: "#e2d9f3" }}>
      {/* Nav */}
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
            <Link href="/" className="text-sm font-medium" style={{ color: "#6b5e7e" }}>← Back</Link>
            <Link href="/">
              <Image src="/logo.png" alt="Portivex" width={120} height={40} className="object-contain" />
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/sign-in" className="hidden sm:block px-4 py-2 rounded-lg text-sm font-medium" style={{ color: "#e2d9f3", border: "1px solid #2a0050" }}>
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: "linear-gradient(90deg,#bf5af2,#ff2d78)", color: "#fff" }}
            >
              Start free →
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-16 pb-10 text-center">
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono mb-5"
          style={{ background: "#bf5af211", border: "1px solid #bf5af233", color: "#bf5af2" }}
        >
          Risk Metric Library
        </div>
        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight mb-4">
          Portfolio metrics, explained plainly.
        </h1>
        <p className="text-base sm:text-lg max-w-2xl mx-auto leading-relaxed" style={{ color: "#8a7a9e" }}>
          Every number in your portfolio has a meaning. These guides explain what each metric measures,
          how to interpret it, and what good looks like for your strategy.
        </p>
      </section>

      {/* Metric cards grouped by category */}
      <main className="max-w-4xl mx-auto px-6 pb-20 w-full">
        <section className="mb-10">
          <div
            className="rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
            style={{ background: "linear-gradient(135deg,#10001e,#0a0014)", border: "1px solid #2a0050" }}
          >
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: "#6b5e7e" }}>
                New
              </p>
              <h2 className="text-lg font-semibold">Metric comparison guides</h2>
              <p className="text-sm" style={{ color: "#8a7a9e" }}>
                Side-by-side explainers for Sharpe vs Sortino, VaR vs Maximum Drawdown, and Beta vs Correlation.
              </p>
            </div>
            <Link
              href="/learn/compare"
              className="px-4 py-2 rounded-lg text-sm font-semibold shrink-0"
              style={{ background: "linear-gradient(90deg,#bf5af2,#ff2d78)", color: "#fff" }}
            >
              Explore comparisons
            </Link>
          </div>
        </section>

        {categories.map((cat) => {
          const group = METRICS.filter((m) => m.category === cat);
          if (group.length === 0) return null;
          return (
            <section key={cat} className="mb-12">
              <div className="flex items-center gap-3 mb-5">
                <span
                  className="text-[10px] font-mono uppercase tracking-widest px-2.5 py-1 rounded-full"
                  style={{ color: "#6b5e7e", background: "#1a0030", border: "1px solid #2a0050" }}
                >
                  {CATEGORY_LABELS[cat]}
                </span>
                <div className="flex-1 h-px" style={{ background: "#1a0030" }} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {group.map((metric) => (
                  <Link
                    key={metric.slug}
                    href={`/learn/${metric.slug}`}
                    className="group rounded-2xl p-5 transition-all hover:scale-[1.01]"
                    style={{
                      background: "linear-gradient(135deg,#10001e,#0a0014)",
                      border: `1px solid ${metric.accent}33`,
                    }}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <span
                        className="text-[10px] font-mono px-2.5 py-1 rounded-full uppercase tracking-widest"
                        style={{ color: metric.accent, background: `${metric.accent}11`, border: `1px solid ${metric.accent}22` }}
                      >
                        {metric.shortName}
                      </span>
                      <span className="text-xs font-mono opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: metric.accent }}>
                        Read →
                      </span>
                    </div>
                    <h2 className="text-base font-semibold mb-1">{metric.name}</h2>
                    <p className="text-sm leading-relaxed" style={{ color: "#8a7a9e" }}>{metric.tagline}</p>
                    <div className="mt-3 text-xs font-mono" style={{ color: "#4a3a5e" }}>
                      Formula: <code style={{ color: "#6b5e7e" }}>{metric.formula}</code>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}

        {/* CTA */}
        <div className="rounded-2xl p-8 text-center mt-8" style={{ background: "linear-gradient(130deg,#120020,#0d0018)", border: "1px solid #2a0050" }}>
          <h2 className="text-xl sm:text-2xl font-bold mb-2">See all these metrics for your portfolio.</h2>
          <p className="text-sm mb-6" style={{ color: "#8a7a9e" }}>
            Add your holdings in under 2 minutes. Portivex calculates every metric above — with confidence context and plain-English interpretation.
          </p>
          <Link
            href="/sign-up"
            className="inline-flex px-8 py-3 rounded-xl text-sm font-semibold"
            style={{ background: "linear-gradient(90deg,#bf5af2,#ff2d78)", color: "#fff", boxShadow: "0 0 26px #bf5af244" }}
          >
            Analyse my portfolio →
          </Link>
          <p className="text-xs mt-3 font-mono" style={{ color: "#4a3a5e" }}>Free during early access · No card required</p>
        </div>
      </main>

      <footer className="px-6 py-8 border-t" style={{ borderColor: "#1a0030" }}>
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs" style={{ color: "#4a3a5e" }}>Portivex - Portfolio Risk Intelligence Platform</p>
          <Link href="/learn" className="text-xs" style={{ color: "#bf5af2" }}>Metric Library</Link>
          <p className="text-xs" style={{ color: "#2a1a40" }}>For informational purposes only. Not financial advice.</p>
        </div>
      </footer>
    </div>
  );
}
