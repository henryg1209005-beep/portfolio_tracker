import type { Metadata } from "next";
import Link from "next/link";
import LandingNav from "@/components/LandingNav";
import LandingHeroCTA from "@/components/LandingHeroCTA";

export const metadata: Metadata = {
  title: "Portivex - AI Portfolio Analysis & Risk Analytics | Sharpe Ratio, Beta, VaR",
  description:
    "AI portfolio analysis with institutional risk metrics. Calculate Sharpe Ratio, Sortino, Beta, VaR, and Maximum Drawdown, then get plain-English portfolio insights you can revisit and act on.",
  alternates: { canonical: "https://portivex.co.uk" },
  openGraph: {
    title: "Portivex - AI Portfolio Analysis & Risk Analytics",
    description:
      "AI portfolio analysis for retail investors. Track Sharpe Ratio, Sortino, Beta, VaR, Maximum Drawdown and get structured plain-English insight.",
    url: "https://portivex.co.uk",
    siteName: "Portivex",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Portivex - AI Portfolio Analysis & Risk Analytics",
    description:
      "AI portfolio analysis with Sharpe, Sortino, Beta, VaR, and Max Drawdown - with structured plain-English interpretation.",
  },
};

const PILLARS = [
  {
    title: "Risk Intelligence",
    tag: "Core",
    body: "Institutional risk metrics translated into plain language with confidence context, not just raw numbers.",
    accent: "#00f5d4",
  },
  {
    title: "Decision Clarity",
    tag: "Action",
    body: "Get specific observations on concentration, correlation, and risk trends - not just numbers, but what they mean for your portfolio right now.",
    accent: "#bf5af2",
  },
  {
    title: "Investor-Ready Output",
    tag: "Proof",
    body: "Clean exports and structured reports you can share, track, and revisit without spreadsheet cleanup.",
    accent: "#ff2d78",
  },
];

const SIGNALS = [
  { k: "Sharpe", v: "1.08", c: "#00f5d4" },
  { k: "Max DD", v: "-12.4%", c: "#ff2d78" },
  { k: "VaR 95", v: "-2.1%", c: "#f5a623" },
  { k: "Beta", v: "0.93", c: "#bf5af2" },
];

const FLOW = [
  {
    step: "01",
    title: "Bring in holdings",
    body: "Add positions manually or import via CSV in GBP, USD, or EUR.",
  },
  {
    step: "02",
    title: "Observe true risk",
    body: "See return quality, downside profile, benchmark-relative behaviour, and confidence.",
  },
  {
    step: "03",
    title: "Act with structure",
    body: "Receive specific observations on what's working, what's elevated, and what's worth reflecting on - in plain English.",
  },
];

const AI_FEATURES = [
  {
    title: "Persistent AI Reports",
    body: "Your latest analysis stays visible until you manually clear it, so you can compare portfolio changes without losing context.",
  },
  {
    title: "Structured Portfolio Analysis",
    body: "Get an executive summary, score chips, and sectioned risk commentary instead of an unstructured text dump.",
  },
  {
    title: "Actionable Risk Prompts",
    body: "See practical observations on concentration, diversification, drawdown profile, and risk-adjusted return quality.",
  },
];

function SignalBars() {
  return (
    <div className="grid grid-cols-4 gap-2 mt-5">
      {SIGNALS.map((s) => (
        <div key={s.k} className="rounded-lg p-2" style={{ background: "#10001e", border: "1px solid #2a0050" }}>
          <div className="text-[10px] font-mono mb-1" style={{ color: "#6b5e7e" }}>{s.k}</div>
          <div className="text-xs font-mono font-semibold" style={{ color: s.c }}>{s.v}</div>
          <div className="text-[10px] font-mono mt-2" style={{ color: "#4a3a5e" }}>Demo snapshot</div>
        </div>
      ))}
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#080012", color: "#e2d9f3" }}>
      <LandingNav />

      <section className="relative overflow-hidden">
        <div className="ambient-orb ambient-orb-cyan w-80 h-80 -left-24 -top-16" />
        <div className="ambient-orb ambient-orb-pink w-72 h-72 -right-20 top-10" />
        <div className="ambient-orb ambient-orb-purple w-96 h-96 left-1/3 -bottom-44" />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(1200px 420px at 15% -10%, #00f5d414 0%, transparent 70%), radial-gradient(1000px 500px at 100% 0%, #ff2d7816 0%, transparent 65%), radial-gradient(900px 380px at 50% 110%, #bf5af214 0%, transparent 65%)",
          }}
        />
        <div className="max-w-6xl mx-auto px-6 pt-16 pb-20 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
          <div className="lg:col-span-7 space-y-6 animate-fade-up">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono" style={{ background: "#00f5d411", border: "1px solid #00f5d433", color: "#00f5d4" }}>
              Portfolio Risk Intelligence Platform
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight">
              Your broker tracks your gains. Portivex tells you if they were worth the risk.
            </h1>
            <p className="text-base sm:text-lg max-w-xl leading-relaxed" style={{ color: "#8a7a9e" }}>
              Portivex analyses your portfolio and tells you exactly what your risk metrics mean - and what&apos;s worth your attention.
            </p>
            <LandingHeroCTA />
            <div className="inline-flex items-center gap-2 text-xs font-mono px-2.5 py-1 rounded-full" style={{ background: "#00f5d411", border: "1px solid #00f5d433", color: "#00f5d4" }}>
              Free during early access · No card required
            </div>
            <div className="text-xs font-mono" style={{ color: "#4a3a5e" }}>
              Works with Revolut, Freetrade, Trading 212 and any broker - add holdings manually or import via CSV.
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              {[
                { k: "Metrics", v: "Quant-backed" },
                { k: "Review", v: "Actionable" },
                { k: "Exports", v: "Investor-ready" },
                { k: "Confidence", v: "Signal-scored" },
              ].map((item) => (
                <div key={item.k} className="rounded-lg px-3 py-2 hover-lift" style={{ background: "#0d0020", border: "1px solid #1a0030" }}>
                  <div className="text-[10px] uppercase tracking-widest font-mono" style={{ color: "#4a3a5e" }}>{item.k}</div>
                  <div className="text-sm font-semibold mt-1">{item.v}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-5 animate-fade-up" style={{ animationDelay: "120ms" }}>
            <div className="rounded-2xl p-4 sm:p-5" style={{ background: "linear-gradient(140deg,#120020,#0a0014)", border: "1px solid #2a0050", boxShadow: "0 0 20px #bf5af218" }}>
              <div className="flex items-center justify-between text-[11px] font-mono mb-3" style={{ color: "#6b5e7e" }}>
                <span>Risk Signal Console</span>
                <span style={{ color: "#00f5d4" }}>DEMO</span>
              </div>
              <div className="rounded-xl p-3" style={{ background: "#0b0018", border: "1px solid #1a0030" }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-mono" style={{ color: "#4a3a5e" }}>Model: Current Holdings</div>
                  <div className="text-xs font-mono" style={{ color: "#bf5af2" }}>Confidence: Medium</div>
                </div>
                <SignalBars />
              </div>
              <div className="mt-4 rounded-xl overflow-hidden" style={{ border: "1px solid #2a0050" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/screen-metrics2.png" alt="Portfolio risk metrics dashboard showing Sharpe Ratio, Beta, VaR and Maximum Drawdown" className="w-full object-cover object-top" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="position" className="max-w-6xl mx-auto px-6 py-16">
        <div className="mb-10">
          <div className="text-[11px] font-mono uppercase tracking-widest mb-3" style={{ color: "#4a3a5e" }}>What makes it different</div>
          <h2 className="text-2xl sm:text-3xl font-bold">Built as risk intelligence, not a generic tracker.</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PILLARS.map((p, idx) => (
            <div key={p.title} className="rounded-2xl p-5 animate-fade-up hover-lift" style={{ animationDelay: `${idx * 90}ms`, background: "linear-gradient(135deg,#10001e,#0a0014)", border: `1px solid ${p.accent}33` }}>
              <div className="inline-flex text-[10px] px-2 py-1 rounded-full font-mono uppercase tracking-widest mb-4" style={{ color: p.accent, background: `${p.accent}11`, border: `1px solid ${p.accent}22` }}>
                {p.tag}
              </div>
              <h3 className="text-lg font-semibold mb-2">{p.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: "#8a7a9e" }}>{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="px-6 py-16" style={{ background: "linear-gradient(180deg,transparent,#0d001888,transparent)" }}>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <div className="text-[11px] font-mono uppercase tracking-widest mb-3" style={{ color: "#4a3a5e" }}>Workflow</div>
            <h2 className="text-2xl sm:text-3xl font-bold">From holdings to decision-quality insight.</h2>
          </div>
          <div className="space-y-4">
            {FLOW.map((f, idx) => (
              <div key={f.step} className="rounded-xl p-4 sm:p-5 flex gap-4 items-start animate-fade-up hover-lift" style={{ animationDelay: `${idx * 110}ms`, background: "#0d0020", border: "1px solid #2a0050" }}>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xs font-mono font-semibold shrink-0" style={{ background: "#bf5af211", border: "1px solid #bf5af244", color: "#bf5af2" }}>
                  {f.step}
                </div>
                <div>
                  <h3 className="font-semibold mb-1">{f.title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: "#8a7a9e" }}>{f.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="ai-analysis" className="max-w-5xl mx-auto px-6 py-14">
        <div className="mb-8">
          <div className="text-[11px] font-mono uppercase tracking-widest mb-3" style={{ color: "#4a3a5e" }}>AI Portfolio Analysis</div>
          <h2 className="text-2xl sm:text-3xl font-bold">Understand what your portfolio is doing, not just what it returned.</h2>
          <p className="text-sm mt-3 max-w-3xl leading-relaxed" style={{ color: "#8a7a9e" }}>
            Portivex combines AI portfolio analysis with deterministic risk metrics so you get both the numbers and the interpretation. Track
            Sharpe Ratio, Sortino Ratio, Beta, Value at Risk and drawdown, then read a structured analysis that highlights where risk is concentrated and what may deserve action.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {AI_FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl p-4" style={{ background: "#0d0020", border: "1px solid #2a0050" }}>
              <h3 className="text-sm font-semibold mb-2">{f.title}</h3>
              <p className="text-xs leading-relaxed" style={{ color: "#8a7a9e" }}>{f.body}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <Link href="/sign-up" className="font-semibold" style={{ color: "#bf5af2" }}>
            Try AI analysis on your portfolio &rarr;
          </Link>
          <Link href="/learn" style={{ color: "#6b5e7e" }}>
            Learn how each risk metric is calculated &rarr;
          </Link>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 py-12 w-full">
        <div className="text-center mb-8">
          <div className="text-[11px] font-mono uppercase tracking-widest mb-3" style={{ color: "#4a3a5e" }}>Learn</div>
          <h2 className="text-2xl sm:text-3xl font-bold">Understand every number in your portfolio.</h2>
          <p className="text-sm mt-3 max-w-xl mx-auto" style={{ color: "#8a7a9e" }}>
            Plain-English explanations of Sharpe Ratio, Sortino, Beta, VaR, Maximum Drawdown, and more.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          {[
            { name: "Sharpe Ratio", slug: "sharpe-ratio", accent: "#00f5d4" },
            { name: "Sortino Ratio", slug: "sortino-ratio", accent: "#bf5af2" },
            { name: "Beta", slug: "beta", accent: "#ff2d78" },
            { name: "Value at Risk", slug: "value-at-risk", accent: "#f5a623" },
            { name: "Max Drawdown", slug: "maximum-drawdown", accent: "#ff2d78" },
            { name: "Correlation", slug: "correlation", accent: "#bf5af2" },
          ].map((m) => (
            <Link
              key={m.slug}
              href={`/learn/${m.slug}`}
              className="rounded-xl p-3 text-sm font-medium text-center transition-all hover:scale-[1.02]"
              style={{ background: "#0d0020", border: `1px solid ${m.accent}33`, color: m.accent }}
            >
              {m.name}
            </Link>
          ))}
        </div>
        <div className="text-center">
          <Link href="/learn" className="text-sm font-medium" style={{ color: "#6b5e7e" }}>
            View full metric library &rarr;
          </Link>
        </div>
      </section>

      <section className="px-6 py-20 text-center">
        <div className="max-w-2xl mx-auto rounded-2xl p-8 sm:p-10" style={{ background: "linear-gradient(130deg,#120020,#0d0018)", border: "1px solid #2a0050" }}>
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">See your portfolio through a risk-intelligence lens.</h2>
          <p className="text-sm mb-7" style={{ color: "#8a7a9e" }}>Free during early access. No card required.</p>
          <Link href="/sign-up" className="inline-flex px-8 py-3 rounded-xl text-sm font-semibold hover-lift" style={{ background: "linear-gradient(90deg,#bf5af2,#ff2d78)", color: "#fff", boxShadow: "0 0 12px #bf5af228" }}>
            Create account &rarr;
          </Link>
        </div>
      </section>

      <footer className="px-6 py-8 border-t" style={{ borderColor: "#1a0030" }}>
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs" style={{ color: "#4a3a5e" }}>Portivex - Portfolio Risk Intelligence Platform</p>
          <div className="flex items-center gap-5">
            <Link href="/learn" className="text-xs" style={{ color: "#6b5e7e" }}>Metric Library</Link>
            <a href="https://discord.gg/MabTm9Z4zR" target="_blank" rel="noopener noreferrer" className="text-xs" style={{ color: "#bf5af2" }}>
              Join Discord &rarr;
            </a>
          </div>
          <p className="text-xs" style={{ color: "#2a1a40" }}>For informational purposes only. Not financial advice.</p>
        </div>
      </footer>
    </div>
  );
}
