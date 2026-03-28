"use client";
import { useState } from "react";
import Link from "next/link";
import { SignInButton, SignUpButton, Show, UserButton } from "@clerk/nextjs";
import { submitWaitlist } from "@/lib/api";

// ── Feature data ──────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: "◈",
    accent: "#bf5af2",
    glow: "#bf5af222",
    title: "Risk Metrics",
    tag: "Institutional-grade",
    description:
      "Sharpe ratio, annualised volatility, max drawdown, VaR, beta, and Jensen's alpha — all computed from your actual holdings with live market data. The numbers your broker never shows you.",
    bullets: ["1-year rolling, S&P 500 benchmarked", "UK Gilt risk-free rate", "CAPM-adjusted alpha"],
    screen: "/screen-metrics2.png",
  },
  {
    icon: "✦",
    accent: "#00f5d4",
    glow: "#00f5d422",
    title: "AI Overview",
    tag: "Powered by AI",
    description:
      "A private-wealth-grade portfolio report generated in seconds. Plain-English explanations of every metric, hidden exposures, dividend income, and an honest assessment of your portfolio construction.",
    bullets: ["Live data, not generic advice", "Streams in real time", "8-section structured report"],
    screen: "/screen-ai.png",
  },
  {
    icon: "⬡",
    accent: "#ff2d78",
    glow: "#ff2d7822",
    title: "Portfolio Review",
    tag: "Quantitative analysis",
    description:
      "Concentration risk scored by HHI and MCTR. Actionable rebalancing recommendations with GBP amounts. CGT warnings on sell actions. Tested against balanced, growth, and conservative profiles.",
    bullets: ["HHI & Effective-N scoring", "MCTR risk attribution", "Includes CGT disclosure"],
    screen: "/screen-review.png",
  },
  {
    icon: "↗",
    accent: "#f5a623",
    glow: "#f5a62322",
    title: "Charts & Tracking",
    tag: "Visual analytics",
    description:
      "Portfolio vs S&P 500 performance indexed to 100. Drawdown from peak. P&L by holding. Allocation breakdown. All charts update in real time when you add or remove positions.",
    bullets: ["1M · 3M · 6M · 1Y · 5Y timeframes", "Correlation heatmap", "Live P&L tracking"],
    screen: "/screen-charts.png",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Add your holdings",
    body: "Enter ticker, date, shares, and price. Supports GBP, USD, and EUR transactions. Or import everything at once via CSV.",
  },
  {
    n: "02",
    title: "Live data loads automatically",
    body: "Prices, FX rates, and historical data are fetched from global markets. No manual updates. No spreadsheet maintenance.",
  },
  {
    n: "03",
    title: "Get professional analysis",
    body: "Risk metrics, AI report, and portfolio review — all on demand. Designed for UK retail investors who want more than a number.",
  },
];

// ── Waitlist form ─────────────────────────────────────────────────────────────

function WaitlistForm() {
  const [email, setEmail]   = useState("");
  const [state, setState]   = useState<"idle" | "loading" | "done" | "duplicate" | "error">("idle");
  const [position, setPosition] = useState<number | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setState("loading");
    try {
      const res = await submitWaitlist(email.trim());
      if (res.status === "already_registered") {
        setState("duplicate");
        setPosition(res.position ?? null);
      } else {
        setState("done");
        setPosition(res.position ?? null);
      }
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div
        className="flex items-center gap-3 px-5 py-3.5 rounded-xl"
        style={{ background: "#00f5d411", border: "1px solid #00f5d433" }}
      >
        <span style={{ color: "#00f5d4" }}>✓</span>
        <span className="text-sm" style={{ color: "#00f5d4" }}>
          You&apos;re on the list{position ? ` — #${position}` : ""}. We&apos;ll be in touch.
        </span>
      </div>
    );
  }

  if (state === "duplicate") {
    return (
      <div
        className="flex items-center gap-3 px-5 py-3.5 rounded-xl"
        style={{ background: "#bf5af211", border: "1px solid #bf5af233" }}
      >
        <span style={{ color: "#bf5af2" }}>◈</span>
        <span className="text-sm" style={{ color: "#bf5af2" }}>
          Already registered{position ? ` — you&apos;re #${position} on the list` : ""}.
        </span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 w-full max-w-md">
      <input
        type="email"
        required
        placeholder="your@email.com"
        value={email}
        onChange={e => setEmail(e.target.value)}
        disabled={state === "loading"}
        className="flex-1 px-4 py-3 rounded-xl text-sm font-mono focus:outline-none transition-colors disabled:opacity-50"
        style={{
          background: "#0d0020",
          border: "1px solid #2a0050",
          color: "#e2d9f3",
        }}
        onFocus={e => (e.currentTarget.style.borderColor = "#bf5af2")}
        onBlur={e => (e.currentTarget.style.borderColor = "#2a0050")}
      />
      <button
        type="submit"
        disabled={state === "loading"}
        className="px-6 py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 shrink-0"
        style={{
          background: "linear-gradient(90deg, #bf5af2, #ff2d78)",
          color: "#fff",
          boxShadow: "0 0 20px #bf5af244",
        }}
      >
        {state === "loading" ? "Joining…" : "Join Waitlist"}
      </button>
      {state === "error" && (
        <p className="text-xs mt-1 w-full" style={{ color: "#ff2d78" }}>
          Something went wrong — make sure the server is running.
        </p>
      )}
    </form>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "#080012", color: "#e2d9f3" }}
    >
      {/* ── Nav ── */}
      <nav
        className="sticky top-0 z-50 flex items-center justify-between px-6 py-4"
        style={{ background: "#08001299", backdropFilter: "blur(12px)", borderBottom: "1px solid #1a0030" }}
      >
        <div className="text-base font-bold tracking-tight">
          <span style={{ color: "#ff2d78", textShadow: "0 0 12px #ff2d7866" }}>Porti</span>
          <span style={{ color: "#e2d9f3" }}>vex</span>
        </div>
        <div className="flex items-center gap-3">
          <Show when="signed-out">
            <SignInButton mode="redirect">
              <button className="px-4 py-2 rounded-lg text-sm font-medium transition-all" style={{ color: "#e2d9f3", border: "1px solid #2a0050" }}>
                Sign in
              </button>
            </SignInButton>
            <SignUpButton mode="redirect">
              <button className="px-4 py-2 rounded-lg text-sm font-semibold transition-all" style={{ background: "linear-gradient(90deg,#bf5af2,#ff2d78)", color: "#fff" }}>
                Get started →
              </button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <Link href="/dashboard" className="px-4 py-2 rounded-lg text-sm font-semibold transition-all" style={{ background: "linear-gradient(90deg,#bf5af2,#ff2d78)", color: "#fff" }}>
              Dashboard →
            </Link>
            <UserButton />
          </Show>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative flex flex-col items-center justify-center text-center px-6 pt-28 pb-24 overflow-hidden">
        {/* Background glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 80% 50% at 50% -10%, #bf5af218 0%, transparent 70%), radial-gradient(ellipse 60% 40% at 80% 60%, #ff2d7810 0%, transparent 60%)",
          }}
        />

        {/* Badge */}
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono mb-8"
          style={{ background: "#bf5af211", border: "1px solid #bf5af233", color: "#bf5af2" }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
          Early Access · UK Retail Investors
        </div>

        {/* Headline */}
        <h1
          className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight max-w-3xl mb-6"
          style={{ color: "#e2d9f3" }}
        >
          Your portfolio,{" "}
          <span
            style={{
              background: "linear-gradient(90deg, #bf5af2, #ff2d78)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            professionally analysed.
          </span>
        </h1>

        {/* Subheadline */}
        <p
          className="text-base sm:text-lg leading-relaxed max-w-xl mb-10"
          style={{ color: "#6b5e7e" }}
        >
          Institutional-grade risk metrics, AI-powered insights, and portfolio analysis —
          built for UK investors who want more than a spreadsheet.
        </p>

        {/* CTA */}
        <WaitlistForm />

        <div className="flex items-center gap-2 mt-4">
          <span
            className="text-xs font-mono px-2.5 py-1 rounded-full"
            style={{ background: "#00f5d411", border: "1px solid #00f5d433", color: "#00f5d4" }}
          >
            Free during early access
          </span>
          <span className="text-xs" style={{ color: "#3a2a50" }}>· No card required</span>
        </div>

        {/* Hero screenshot */}
        <div className="relative mt-16 w-full max-w-5xl mx-auto">
          {/* Glow underneath */}
          <div
            className="absolute -inset-px rounded-2xl pointer-events-none"
            style={{ boxShadow: "0 0 80px 10px #bf5af222, 0 0 140px 30px #ff2d7808" }}
          />
          {/* Frame */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{ border: "1px solid #bf5af233" }}
          >
            {/* Fake browser bar */}
            <div
              className="flex items-center gap-2 px-4 py-2.5"
              style={{ background: "#0d0020", borderBottom: "1px solid #1a0030" }}
            >
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#ff2d7866" }} />
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#f5a62366" }} />
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#00f5d466" }} />
              <span
                className="ml-3 text-[11px] font-mono px-3 py-0.5 rounded"
                style={{ background: "#1a0030", color: "#3a2a50" }}
              >
                portivex.com/dashboard
              </span>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/screen-metrics.png"
              alt="Portivex Risk Metrics dashboard"
              className="w-full object-cover object-top"
            />
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="px-6 py-20 max-w-6xl mx-auto w-full">
        <div className="text-center mb-14">
          <div
            className="text-[11px] font-mono uppercase tracking-widest mb-3"
            style={{ color: "#4a3a5e" }}
          >
            What&apos;s inside
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold" style={{ color: "#e2d9f3" }}>
            Everything your broker doesn&apos;t tell you
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl flex flex-col overflow-hidden"
              style={{
                background: "linear-gradient(135deg, #0f002088, #0a001288)",
                border: `1px solid ${f.accent}22`,
              }}
            >
              {/* Text section */}
              <div className="p-6 flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                    style={{ background: f.glow, border: `1px solid ${f.accent}33` }}
                  >
                    <span style={{ color: f.accent }}>{f.icon}</span>
                  </div>
                  <span
                    className="text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded-full mt-1"
                    style={{ background: `${f.accent}11`, color: f.accent, border: `1px solid ${f.accent}22` }}
                  >
                    {f.tag}
                  </span>
                </div>

                <h3 className="text-lg font-bold" style={{ color: "#e2d9f3" }}>{f.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: "#6b5e7e" }}>{f.description}</p>

                <ul className="flex flex-col gap-1.5 pt-2" style={{ borderTop: `1px solid ${f.accent}11` }}>
                  {f.bullets.map((b) => (
                    <li key={b} className="flex items-center gap-2 text-xs" style={{ color: "#4a3a5e" }}>
                      <span style={{ color: f.accent }}>·</span>
                      {b}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Screenshot */}
              <div
                className="mx-4 mb-4 rounded-xl overflow-hidden"
                style={{ border: `1px solid ${f.accent}18` }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={f.screen}
                  alt={`${f.title} screenshot`}
                  className="w-full object-cover object-top"
                  style={{ maxHeight: "220px" }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Also includes strip */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {[
            { icon: "⬡", label: "Correlation Matrix" },
            { icon: "↑", label: "CSV Import" },
            { icon: "◉", label: "Multi-currency (GBP / USD / EUR)" },
            { icon: "▦", label: "Live P&L per holding" },
            { icon: "◈", label: "Dividend tracking" },
          ].map(({ icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono"
              style={{ background: "#0d0020", border: "1px solid #1a0030", color: "#4a3a5e" }}
            >
              <span style={{ color: "#2a1a40" }}>{icon}</span>
              {label}
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section
        className="px-6 py-20"
        style={{ background: "linear-gradient(180deg, transparent, #0d001888, transparent)" }}
      >
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-14">
            <div
              className="text-[11px] font-mono uppercase tracking-widest mb-3"
              style={{ color: "#4a3a5e" }}
            >
              How it works
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold" style={{ color: "#e2d9f3" }}>
              Up and running in minutes
            </h2>
          </div>

          <div className="flex flex-col gap-6">
            {STEPS.map((s, i) => (
              <div key={s.n} className="flex gap-5 items-start">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold font-mono shrink-0 mt-0.5"
                  style={{ background: "#bf5af211", border: "1px solid #bf5af233", color: "#bf5af2" }}
                >
                  {s.n}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold mb-1.5" style={{ color: "#e2d9f3" }}>{s.title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: "#6b5e7e" }}>{s.body}</p>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className="absolute ml-5 mt-12 w-px h-6"
                    style={{ background: "#1a0030" }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="px-6 py-24 flex flex-col items-center text-center">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mb-8"
          style={{
            background: "linear-gradient(135deg, #bf5af222, #ff2d7811)",
            border: "1px solid #bf5af233",
          }}
        >
          ✦
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold mb-4" style={{ color: "#e2d9f3" }}>
          Ready to see what your portfolio is really doing?
        </h2>
        <p className="text-sm mb-8 max-w-sm" style={{ color: "#6b5e7e" }}>
          Join the waitlist. Early access opens to UK investors first.
        </p>
        <WaitlistForm />
      </section>

      {/* ── Footer ── */}
      <footer
        className="px-6 py-8 flex flex-col items-center gap-4"
        style={{ borderTop: "1px solid #1a0030" }}
      >
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 w-full max-w-5xl">
          <div className="text-sm font-bold">
            <span style={{ color: "#ff2d78" }}>Porti</span>
            <span style={{ color: "#e2d9f3" }}>vex</span>
          </div>
          <p className="text-xs text-center" style={{ color: "#3a2a50" }}>
            Built by a UK investor who got frustrated with spreadsheets.
          </p>
          <Link
            href="/dashboard"
            className="text-xs transition-colors"
            style={{ color: "#3a2a50" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#bf5af2")}
            onMouseLeave={e => (e.currentTarget.style.color = "#3a2a50")}
          >
            Launch App →
          </Link>
        </div>
        <p className="text-xs" style={{ color: "#2a1a40" }}>
          © 2026 Portivex. For informational purposes only. Not financial advice.
        </p>
      </footer>
    </div>
  );
}
