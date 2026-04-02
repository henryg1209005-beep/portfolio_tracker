"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import SummaryCards from "@/components/SummaryCards";
import MetricsGrid from "@/components/MetricsGrid";
import { DEMO_REFRESH_DATA, getDemoPerformance, DEMO_AI_REPORT } from "@/lib/demoPortfolio";

const STEPS = [
  {
    id: "overview",
    title: "Your portfolio at a glance",
    description:
      "Total value, P&L, and your holdings in one view. Your broker shows you this too — but it's just the start.",
  },
  {
    id: "metrics",
    title: "The metrics your broker never shows you",
    description:
      "Sharpe ratio, max drawdown, VaR — institutional risk metrics computed from real market data. Portivex translates each one into plain English so you know what they actually mean for your money.",
  },
  {
    id: "analysis",
    title: "Your AI risk analyst",
    description:
      "Plain-English interpretation of your entire portfolio — the kind a private wealth manager would write. Every report is specific to your holdings, your risk profile, and your benchmark.",
  },
];

function parseAiSections(text: string) {
  const divider = "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";
  const parts = text.split(divider).map((s) => s.trim()).filter(Boolean);
  const sections: { title: string; body: string }[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const title = parts[i];
    const body = parts[i + 1] ?? "";
    if (title) sections.push({ title, body });
  }
  return sections;
}

export default function DemoPage() {
  const [step, setStep] = useState(0);
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const el = sectionRefs.current[step];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [step]);

  const perfData = getDemoPerformance("1Y", "sp500");
  const aiSections = parseAiSections(DEMO_AI_REPORT);
  const isLast = step === STEPS.length - 1;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#080012", color: "#e2d9f3" }}>
      {/* Nav */}
      <nav
        className="sticky top-0 z-40"
        style={{ background: "linear-gradient(180deg,#080012ee,#080012aa)", backdropFilter: "blur(12px)", borderBottom: "1px solid #1a0030" }}
      >
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Image src="/logo.png" alt="Portivex" width={120} height={40} className="object-contain" />
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono px-2.5 py-1 rounded-full" style={{ background: "#bf5af211", border: "1px solid #bf5af244", color: "#bf5af2" }}>
              Demo portfolio
            </span>
            <Link
              href="/sign-up"
              className="px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: "linear-gradient(90deg,#bf5af2,#ff2d78)", color: "#fff" }}
            >
              Use my real portfolio →
            </Link>
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="max-w-screen-xl mx-auto w-full px-4 md:px-6 pb-40 space-y-16 pt-10">

        {/* Section 1: Overview */}
        <div
          ref={(el) => { sectionRefs.current[0] = el; }}
          id="overview"
          className="scroll-mt-24 space-y-6"
          style={{
            outline: step === 0 ? "2px solid #bf5af244" : "none",
            borderRadius: "1rem",
            padding: step === 0 ? "1.5rem" : "0",
            transition: "all 0.3s ease",
          }}
        >
          <div>
            <div className="text-[11px] font-mono uppercase tracking-widest mb-1" style={{ color: "#4a3a5e" }}>Step 1</div>
            <h2 className="text-xl font-bold">Portfolio Overview</h2>
          </div>
          <SummaryCards summary={DEMO_REFRESH_DATA.summary} currency="GBP" />
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #1a0030" }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid #1a0030", color: "#4a3a5e" }}>
                  {["Ticker", "Type", "Shares", "Avg Cost", "Price", "Value", "P&L", "Weight"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DEMO_REFRESH_DATA.holdings.map((h, i) => (
                  <tr key={h.ticker} style={{ borderBottom: i < DEMO_REFRESH_DATA.holdings.length - 1 ? "1px solid #0d001a" : "none", background: i % 2 === 0 ? "#0a0016" : "transparent" }}>
                    <td className="px-4 py-3 font-mono font-semibold">{h.ticker}</td>
                    <td className="px-4 py-3 text-xs capitalize" style={{ color: "#6b5e7e" }}>{h.type}</td>
                    <td className="px-4 py-3 font-mono text-xs">{h.net_shares}</td>
                    <td className="px-4 py-3 font-mono text-xs">£{h.avg_cost?.toFixed(2)}</td>
                    <td className="px-4 py-3 font-mono text-xs">£{h.current_price?.toFixed(2)}</td>
                    <td className="px-4 py-3 font-mono text-xs">£{h.market_value?.toLocaleString()}</td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: (h.pnl ?? 0) >= 0 ? "#00f5d4" : "#ff2d78" }}>
                      {(h.pnl ?? 0) >= 0 ? "+" : ""}£{h.pnl?.toFixed(0)} ({h.pnl_pct?.toFixed(1)}%)
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{((h.weight ?? 0) * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 2: Metrics */}
        <div
          ref={(el) => { sectionRefs.current[1] = el; }}
          id="metrics"
          className="scroll-mt-24 space-y-6"
          style={{
            outline: step === 1 ? "2px solid #bf5af244" : "none",
            borderRadius: "1rem",
            padding: step === 1 ? "1.5rem" : "0",
            transition: "all 0.3s ease",
          }}
        >
          <div>
            <div className="text-[11px] font-mono uppercase tracking-widest mb-1" style={{ color: "#4a3a5e" }}>Step 2</div>
            <h2 className="text-xl font-bold">Risk Metrics</h2>
          </div>
          {DEMO_REFRESH_DATA.metrics && (
            <MetricsGrid
              metrics={DEMO_REFRESH_DATA.metrics}
              summary={DEMO_REFRESH_DATA.summary}
              perfData={perfData}
              benchmarkLabel="S&P 500"
              riskProfile="balanced"
            />
          )}
        </div>

        {/* Section 3: AI Analysis */}
        <div
          ref={(el) => { sectionRefs.current[2] = el; }}
          id="analysis"
          className="scroll-mt-24 space-y-6"
          style={{
            outline: step === 2 ? "2px solid #bf5af244" : "none",
            borderRadius: "1rem",
            padding: step === 2 ? "1.5rem" : "0",
            transition: "all 0.3s ease",
          }}
        >
          <div>
            <div className="text-[11px] font-mono uppercase tracking-widest mb-1" style={{ color: "#4a3a5e" }}>Step 3</div>
            <h2 className="text-xl font-bold">AI Risk Analysis</h2>
          </div>
          <div className="space-y-4">
            {aiSections.map((sec) => (
              <div
                key={sec.title}
                className="rounded-xl p-5"
                style={{ background: "linear-gradient(135deg,#10001e,#0a0014)", border: "1px solid #2a0050" }}
              >
                <div className="text-xs font-mono font-semibold mb-3" style={{ color: "#bf5af2" }}>{sec.title}</div>
                <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: "#c4b5d4" }}>{sec.body}</p>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Walkthrough bar */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4 pt-2"
        style={{ background: "linear-gradient(0deg, #080012 70%, transparent)" }}
      >
        <div
          className="max-w-2xl mx-auto rounded-2xl p-5"
          style={{ background: "linear-gradient(135deg,#120020,#0a0014)", border: "1px solid #2a0050", boxShadow: "0 0 40px #bf5af230" }}
        >
          {/* Progress dots */}
          <div className="flex items-center gap-2 mb-3">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className="rounded-full transition-all"
                style={{
                  width: i === step ? "20px" : "6px",
                  height: "6px",
                  background: i === step ? "#bf5af2" : "#2a0050",
                }}
              />
            ))}
            <span className="ml-auto text-xs font-mono" style={{ color: "#4a3a5e" }}>
              {step + 1} / {STEPS.length}
            </span>
          </div>

          <div className="mb-4">
            <div className="text-sm font-semibold mb-1">{STEPS[step].title}</div>
            <p className="text-xs leading-relaxed" style={{ color: "#8a7a9e" }}>{STEPS[step].description}</p>
          </div>

          <div className="flex items-center gap-3">
            {step > 0 && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="px-4 py-2 rounded-lg text-xs font-mono"
                style={{ border: "1px solid #2a0050", color: "#6b5e7e" }}
              >
                ← Back
              </button>
            )}
            {!isLast ? (
              <button
                onClick={() => setStep((s) => s + 1)}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold"
                style={{ background: "linear-gradient(90deg,#bf5af2,#ff2d78)", color: "#fff" }}
              >
                Next →
              </button>
            ) : (
              <Link
                href="/sign-up"
                className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold text-center"
                style={{ background: "linear-gradient(90deg,#bf5af2,#ff2d78)", color: "#fff", boxShadow: "0 0 20px #bf5af244" }}
              >
                Analyse my real portfolio →
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
