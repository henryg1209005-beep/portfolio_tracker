"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useUser, UserButton } from "@clerk/nextjs";


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
      "A private-wealth-grade portfolio report generated in seconds. Plain-English explanations of every metric, hidden exposures, and an honest assessment of your portfolio construction.",
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
    body: "Risk metrics, AI report, and portfolio review — all on demand. Designed for retail investors who want more than a number.",
  },
];

// ── Page ──────────────────────────────────────────────────────────────────────

function Particles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    window.addEventListener("resize", resize);

    const COLORS = ["#bf5af2", "#ff2d78", "#00f5d4"];
    const particles = Array.from({ length: 60 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.5 + 0.4,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      alpha: Math.random() * 0.5 + 0.15,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />;
}

function Meteors() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    window.addEventListener("resize", resize);

    type Meteor = { x: number; y: number; len: number; speed: number; alpha: number; color: string; active: boolean };
    const COLORS = ["#bf5af2", "#ff2d78", "#00f5d4"];
    const meteors: Meteor[] = Array.from({ length: 6 }, () => ({ x: 0, y: 0, len: 0, speed: 0, alpha: 0, color: "", active: false }));

    const spawn = (m: Meteor) => {
      m.x = Math.random() * canvas.width * 1.5;
      m.y = Math.random() * canvas.height * 0.5;
      m.len = Math.random() * 120 + 60;
      m.speed = Math.random() * 6 + 4;
      m.alpha = 1;
      m.color = COLORS[Math.floor(Math.random() * COLORS.length)];
      m.active = true;
    };

    // stagger initial spawns
    meteors.forEach((m, i) => setTimeout(() => spawn(m), i * 1800 + Math.random() * 3000));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const m of meteors) {
        if (!m.active) continue;
        m.x += m.speed;
        m.y += m.speed * 0.5;
        m.alpha -= 0.012;
        if (m.alpha <= 0) { m.active = false; setTimeout(() => spawn(m), Math.random() * 4000 + 1500); continue; }
        const grad = ctx.createLinearGradient(m.x, m.y, m.x - m.len, m.y - m.len * 0.5);
        grad.addColorStop(0, m.color);
        grad.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(m.x - m.len, m.y - m.len * 0.5);
        ctx.strokeStyle = grad;
        ctx.globalAlpha = m.alpha;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />;
}

function useInView(ref: React.RefObject<HTMLElement | null>) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold: 0.12 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref]);
  return visible;
}

export default function LandingPage() {
  const { isSignedIn, isLoaded } = useUser();
  const featuresRef = useRef<HTMLDivElement>(null);
  const featuresVisible = useInView(featuresRef);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "#080012", color: "#e2d9f3" }}
    >
      {/* ── Nav ── */}
      <nav
        className="sticky top-0 z-50 flex flex-col"
        style={{ background: "#08001299", backdropFilter: "blur(12px)", borderBottom: "1px solid #1a0030" }}
      >
        {/* Main row */}
        <div className="flex items-center justify-between px-6 py-4">
          <Image src="/logo.png" alt="Portivex" width={140} height={46} className="object-contain" />

          {/* Desktop anchor links */}
          <div className="hidden md:flex items-center gap-7">
            {[
              { label: "Features", href: "#features" },
              { label: "How it works", href: "#how-it-works" },
              { label: "Discord", href: "https://discord.gg/MabTm9Z4zR", external: true },
            ].map(({ label, href, external }) => (
              <a
                key={label}
                href={href}
                {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="text-sm transition-colors"
                style={{ color: "#6b5e7e" }}
                onMouseEnter={e => (e.currentTarget.style.color = label === "Discord" ? "#bf5af2" : "#e2d9f3")}
                onMouseLeave={e => (e.currentTarget.style.color = "#6b5e7e")}
              >
                {label}
              </a>
            ))}
          </div>

          {/* Auth + mobile hamburger */}
          <div className="flex items-center gap-3">
            {isLoaded && isSignedIn ? (
              <>
                <Link href="/dashboard" className="px-4 py-2 rounded-lg text-sm font-semibold transition-all" style={{ background: "linear-gradient(90deg,#bf5af2,#ff2d78)", color: "#fff" }}>
                  Dashboard →
                </Link>
                <UserButton />
              </>
            ) : (
              <>
                <Link href="/sign-in" className="hidden sm:block px-4 py-2 rounded-lg text-sm font-medium transition-all" style={{ color: "#e2d9f3", border: "1px solid #2a0050" }}>
                  Sign in
                </Link>
                <Link href="/sign-up" className="px-4 py-2 rounded-lg text-sm font-semibold transition-all" style={{ background: "linear-gradient(90deg,#bf5af2,#ff2d78)", color: "#fff" }}>
                  Get started →
                </Link>
                <button
                  className="md:hidden p-2 rounded-lg transition-colors text-base leading-none"
                  style={{ color: "#6b5e7e", border: "1px solid #1a0030" }}
                  onClick={() => setMobileMenuOpen(m => !m)}
                  aria-label="Menu"
                >
                  {mobileMenuOpen ? "✕" : "☰"}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Mobile dropdown */}
        {mobileMenuOpen && (
          <div
            className="md:hidden flex flex-col px-6 pb-4 gap-1"
            style={{ borderTop: "1px solid #1a0030" }}
          >
            {[
              { label: "Features", href: "#features" },
              { label: "How it works", href: "#how-it-works" },
            ].map(({ label, href }) => (
              <a
                key={label}
                href={href}
                onClick={() => setMobileMenuOpen(false)}
                className="py-3 text-sm border-b transition-colors"
                style={{ color: "#6b5e7e", borderColor: "#1a0030" }}
              >
                {label}
              </a>
            ))}
            <a
              href="https://discord.gg/MabTm9Z4zR"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMobileMenuOpen(false)}
              className="py-3 text-sm border-b transition-colors"
              style={{ color: "#bf5af2", borderColor: "#1a0030" }}
            >
              Discord →
            </a>
            <Link
              href="/sign-in"
              onClick={() => setMobileMenuOpen(false)}
              className="py-3 text-sm transition-colors"
              style={{ color: "#6b5e7e" }}
            >
              Sign in
            </Link>
          </div>
        )}
      </nav>

      {/* ── Hero ── */}
      <section className="relative flex flex-col items-center justify-center text-center px-6 pt-28 pb-24 overflow-hidden">
        <Particles />
        <Meteors />
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
          className="animate-fade-up inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono mb-8"
          style={{ background: "#bf5af211", border: "1px solid #bf5af233", color: "#bf5af2", animationDelay: "0ms" }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
          Early Access · Retail Investors
        </div>

        {/* Headline */}
        <h1
          className="animate-fade-up text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight max-w-3xl mb-6"
          style={{ color: "#e2d9f3", animationDelay: "120ms" }}
        >
          Stop guessing.{" "}
          <span
            style={{
              background: "linear-gradient(90deg, #bf5af2, #ff2d78)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            See exactly what your portfolio is really doing.
          </span>
        </h1>

        {/* Subheadline */}
        <p
          className="animate-fade-up text-base sm:text-lg leading-relaxed max-w-xl mb-10"
          style={{ color: "#6b5e7e", animationDelay: "240ms" }}
        >
          Institutional-grade risk metrics, AI-powered insights, and portfolio analysis —
          built for serious retail investors who want more than a spreadsheet.
        </p>

        {/* CTA */}
        <div className="animate-fade-up flex flex-col items-center gap-4" style={{ animationDelay: "360ms" }}>
          <Link
            href="/sign-up"
            className="px-8 py-3.5 rounded-xl text-sm font-semibold transition-all"
            style={{ background: "linear-gradient(90deg, #bf5af2, #ff2d78)", color: "#fff", boxShadow: "0 0 30px #bf5af244" }}
          >
            Get started free →
          </Link>
          <div className="flex items-center gap-2">
            <span
              className="text-xs font-mono px-2.5 py-1 rounded-full"
              style={{ background: "#00f5d411", border: "1px solid #00f5d433", color: "#00f5d4" }}
            >
              Free during early access
            </span>
            <span className="text-xs" style={{ color: "#3a2a50" }}>· No card required</span>
          </div>
        </div>

        {/* Hero screenshot */}
        <div className="animate-fade-up relative mt-16 w-full max-w-5xl mx-auto" style={{ animationDelay: "480ms" }}>
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
      <section id="features" className="px-6 py-20 max-w-6xl mx-auto w-full">
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

        <div ref={featuresRef} className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className={`rounded-2xl flex flex-col overflow-hidden card-hidden ${featuresVisible ? "card-visible" : ""}`}
              style={{
                background: "linear-gradient(135deg, #0f002088, #0a001288)",
                border: `1px solid ${f.accent}22`,
                transitionDelay: featuresVisible ? `${i * 120}ms` : "0ms",
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
            { icon: "◈", label: "CSV broker import" },
          ].map(({ icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono"
              style={{ background: "#0d0020", border: "1px solid #2a0050", color: "#8a7a9e" }}
            >
              <span style={{ color: "#6b5e7e" }}>{icon}</span>
              {label}
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section
        id="how-it-works"
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
          Free during early access. No card required.
        </p>
        <Link
          href="/sign-up"
          className="px-8 py-3.5 rounded-xl text-sm font-semibold transition-all"
          style={{ background: "linear-gradient(90deg, #bf5af2, #ff2d78)", color: "#fff", boxShadow: "0 0 30px #bf5af244" }}
        >
          Get started free →
        </Link>
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
