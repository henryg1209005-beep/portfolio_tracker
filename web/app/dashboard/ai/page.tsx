"use client";
import { useRef, useState, useEffect, useCallback } from "react";
import { streamAnalysis, fetchRefresh, fetchAIUsage } from "@/lib/api";

type Status = "idle" | "loading" | "streaming" | "done" | "error";
interface Section { title: string; body: string }

// ─── Word-level typewriter (rAF-based for smooth frame-aligned reveal) ───────
function useTypewriter(target: string, active: boolean): string {
  const [displayed, setDisplayed] = useState("");
  const ref = useRef({
    target, pos: 0, active, running: false,
    raf: 0, lastTick: 0, nextDelay: 0,
  });

  const tick = useCallback((now: number) => {
    const s = ref.current;
    if (!s.active || s.pos >= s.target.length) { s.running = false; return; }

    if (!s.lastTick) { s.lastTick = now; s.nextDelay = 0; }
    if (now - s.lastTick < s.nextDelay) { s.raf = requestAnimationFrame(tick); return; }

    // Advance to next word boundary (whole word at a time)
    let end = s.pos + 1;
    while (end < s.target.length && s.target[end] !== " " && s.target[end] !== "\n") end++;
    if (end < s.target.length && s.target[end] === " ") end++; // include trailing space

    s.pos = end;
    s.lastTick = now;

    // Natural pacing: pause longer at sentence ends, shorter between words
    const trailingChar = s.target.slice(0, s.pos).trimEnd().slice(-1);
    s.nextDelay = /[.!?]/.test(trailingChar) ? 220 + Math.random() * 130   // sentence end
                : trailingChar === "\n"       ? 150 + Math.random() * 100   // line break
                : /[,;:]/.test(trailingChar)  ? 120 + Math.random() * 60    // clause break
                :                               60 + Math.random() * 40;    // regular word

    setDisplayed(s.target.slice(0, s.pos));
    if (s.pos < s.target.length) s.raf = requestAnimationFrame(tick);
    else s.running = false;
  }, []);

  useEffect(() => {
    const s = ref.current;
    s.target = target;
    s.active = active;
    if (!active) {
      cancelAnimationFrame(s.raf);
      s.pos = target.length; s.running = false; s.lastTick = 0;
      setDisplayed(target);
      return;
    }
    if (!s.running && s.pos < s.target.length) {
      s.running = true;
      s.raf = requestAnimationFrame(tick);
    }
  }, [target, active, tick]);

  useEffect(() => () => { cancelAnimationFrame(ref.current.raf); }, []);
  return displayed;
}

// ─── Parser ──────────────────────────────────────────────────────────────────
function parseSections(raw: string): Section[] {
  const divRe = /^━{10,}$/;
  const lines = raw.split("\n");
  const sections: Section[] = [];
  let i = 0;
  while (i < lines.length) {
    if (divRe.test(lines[i].trim())) {
      const title = lines[i + 1]?.trim() ?? "";
      if (divRe.test(lines[i + 2]?.trim() ?? "")) {
        const bodyLines: string[] = [];
        let j = i + 3;
        while (j < lines.length && !divRe.test(lines[j].trim())) {
          bodyLines.push(lines[j]);
          j++;
        }
        if (title) sections.push({ title, body: bodyLines.join("\n").trim() });
        i = j;
        continue;
      }
    }
    i++;
  }
  return sections;
}

// Extracts the section currently being written (header complete, body still streaming)
function parsePartial(raw: string): Section | null {
  const divRe = /^━{10,}$/;
  const lines  = raw.split("\n");
  for (let i = lines.length - 1; i >= 2; i--) {
    if (divRe.test(lines[i]?.trim()) && !divRe.test(lines[i - 1]?.trim()) && divRe.test(lines[i - 2]?.trim())) {
      const title    = lines[i - 1].trim();
      const bodyLines = lines.slice(i + 1);
      if (bodyLines.some(l => divRe.test(l.trim()))) return null; // already closed
      return { title, body: bodyLines.join("\n") };
    }
  }
  return null;
}

// ─── Rich text helpers ────────────────────────────────────────────────────────
function highlightNumbers(text: string): React.ReactNode {
  const re = /(£[\d,]+(?:\.\d+)?|[+][\d.]+%|[-][\d.]+%|\d+(?:\.\d+)?%|\b\d+\.\d{2}\b)/g;
  const parts = text.split(re);
  return (
    <>
      {parts.map((p, i) => {
        if (/^£/.test(p))            return <span key={i} className="text-cyan font-semibold font-mono">{p}</span>;
        if (/^\+/.test(p) && p.endsWith("%")) return <span key={i} className="text-emerald-400 font-semibold">{p}</span>;
        if (/^-/.test(p) && p.endsWith("%"))  return <span key={i} className="text-red-400 font-semibold">{p}</span>;
        if (p.endsWith("%"))         return <span key={i} className="text-white/90 font-semibold">{p}</span>;
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

function inlineBold(text: string): React.ReactNode {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1
          ? <strong key={i} className="font-bold text-white">{p}</strong>
          : <span key={i}>{highlightNumbers(p)}</span>
      )}
    </>
  );
}

function renderBody(body: string): React.ReactNode {
  const lines = body.split("\n");
  const els: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const isBullet = /^[•\-\*]\s/.test(line);
    if (isBullet) {
      const bullets: string[] = [];
      while (i < lines.length && /^[•\-\*]\s/.test(lines[i])) {
        bullets.push(lines[i].replace(/^[•\-\*]\s+/, ""));
        i++;
      }
      els.push(
        <ul key={`ul${i}`} className="space-y-2.5 my-3">
          {bullets.map((b, j) => (
            <li key={j} className="flex gap-3 text-sm leading-relaxed text-white/75">
              <span className="mt-[7px] w-1 h-1 rounded-full shrink-0" style={{ background: "#bf5af2" }} />
              <span>{inlineBold(b)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }
    if (/^\d+\./.test(line)) {
      const num = line.match(/^(\d+\.)/)?.[1] ?? "";
      els.push(
        <div key={i} className="flex gap-3 text-sm leading-relaxed text-white/75 my-1.5">
          <span className="font-bold text-white/40 shrink-0 tabular-nums">{num}</span>
          <span>{inlineBold(line.replace(/^\d+\.\s*/, ""))}</span>
        </div>
      );
    } else if (line.trim() === "") {
      els.push(<div key={i} className="h-1.5" />);
    } else {
      els.push(
        <p key={i} className="text-sm leading-relaxed text-white/75">
          {inlineBold(line)}
        </p>
      );
    }
    i++;
  }
  return <div className="space-y-0.5">{els}</div>;
}

// ─── TL;DR section ───────────────────────────────────────────────────────────
function TldrSection({ body }: { body: string }) {
  const bullets = body
    .split("\n")
    .filter(l => /^[•\-]\s/.test(l))
    .map(l => l.replace(/^[•\-]\s+/, "").trim());

  if (!bullets.length) return <>{renderBody(body)}</>;

  const variants = [
    { icon: "◎", label: "HEALTH",       bg: "rgba(0,230,180,0.06)",   border: "rgba(0,230,180,0.18)",   accent: "#00e6b4" },
    { icon: "⚠", label: "KEY RISK",     bg: "rgba(255,190,0,0.06)",   border: "rgba(255,190,0,0.18)",   accent: "#ffbe00" },
    { icon: "→", label: "REFLECT ON",   bg: "rgba(191,90,242,0.06)",  border: "rgba(191,90,242,0.18)",  accent: "#bf5af2" },
  ];

  return (
    <div className="space-y-3">
      {bullets.map((b, i) => {
        const v = variants[i] ?? variants[2];
        return (
          <div key={i} className="flex gap-4 p-4 rounded-xl"
            style={{ background: v.bg, border: `1px solid ${v.border}` }}>
            <div className="shrink-0 flex flex-col items-center gap-1 pt-0.5">
              <span className="text-base leading-none" style={{ color: v.accent }}>{v.icon}</span>
              <span className="text-[9px] font-bold tracking-widest" style={{ color: v.accent, opacity: 0.7 }}>{v.label}</span>
            </div>
            <p className="text-sm leading-relaxed text-white/90 font-medium">{b}</p>
          </div>
        );
      })}
    </div>
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────
const SECTION_META: Record<string, { icon: string; accent?: string }> = {
  "TL;DR":                             { icon: "◈", accent: "#00e6b4" },
  "PORTFOLIO SCORE":                   { icon: "◎" },
  "1. PORTFOLIO SNAPSHOT":             { icon: "▦" },
  "2. SHARPE RATIO":                   { icon: "◆" },
  "3. RISK METRICS":                   { icon: "⚡" },
  "4. PERFORMANCE VS BENCHMARK":       { icon: "↗", accent: "#00e6b4" },
  "5. HIDDEN EXPOSURES":               { icon: "⚠", accent: "#ffbe00" },
  "6. DIVIDEND INCOME":                { icon: "◉" },
  "7. OBSERVATIONS WORTH CONSIDERING": { icon: "✦" },
  "8. OVERALL ASSESSMENT":             { icon: "▣" },
};

function SectionCard({ section, isLast, isStreaming }: {
  section: Section; isLast: boolean; isStreaming: boolean;
}) {
  const meta = SECTION_META[section.title.toUpperCase()] ?? { icon: "◈" };
  const accent = meta.accent ?? "#bf5af2";
  const isTldr = section.title.toUpperCase() === "TL;DR";

  return (
    <div className="rounded-2xl overflow-hidden border border-border"
      style={{ background: "rgba(255,255,255,0.02)", animation: "ai-fadein 0.35s ease both" }}>
      {/* Header bar */}
      <div className="flex items-center gap-2.5 px-6 py-3.5 border-b border-border/50"
        style={{ background: `linear-gradient(90deg, ${accent}08 0%, transparent 60%)` }}>
        <span style={{ color: accent, fontSize: 13 }}>{meta.icon}</span>
        <span className="text-xs font-bold tracking-[0.14em] uppercase" style={{ color: accent }}>
          {section.title}
        </span>
      </div>
      {/* Body */}
      <div className="px-6 py-5">
        {section.body
          ? isTldr ? <TldrSection body={section.body} /> : renderBody(section.body)
          : null}
        {isLast && isStreaming && (
          <span className="inline-block w-1.5 h-4 rounded-sm bg-cyan animate-pulse align-text-bottom ml-1" />
        )}
      </div>
    </div>
  );
}

// ─── Streaming section card (typewriter body) ─────────────────────────────────
function StreamingSectionCard({ section }: { section: Section }) {
  const meta   = SECTION_META[section.title.toUpperCase()] ?? { icon: "◈" };
  const accent = meta.accent ?? "#bf5af2";
  const isTldr = section.title.toUpperCase() === "TL;DR";
  const typed  = useTypewriter(section.body, true);

  return (
    <div className="rounded-2xl overflow-hidden border border-border"
      style={{ background: "rgba(255,255,255,0.02)", animation: "ai-fadein 0.35s ease both" }}>
      <div className="flex items-center gap-2.5 px-6 py-3.5 border-b border-border/50"
        style={{ background: `linear-gradient(90deg, ${accent}08 0%, transparent 60%)` }}>
        <span style={{ color: accent, fontSize: 13 }}>{meta.icon}</span>
        <span className="text-xs font-bold tracking-[0.14em] uppercase" style={{ color: accent }}>
          {section.title}
        </span>
      </div>
      <div className="px-6 py-5">
        {typed ? (isTldr ? <TldrSection body={typed} /> : renderBody(typed)) : null}
        <span className="inline-block w-1.5 h-4 rounded-sm bg-cyan animate-pulse align-text-bottom ml-1" />
      </div>
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────
const LOADING_STEPS = [
  { icon: "◈", label: "Fetching live prices" },
  { icon: "▦", label: "Loading portfolio" },
  { icon: "⚡", label: "Computing risk metrics" },
  { icon: "✦", label: "Generating analysis" },
];

function LoadingState({ status }: { status: Status }) {
  const step = status === "loading" ? 2 : 3;
  return (
    <div className="py-8 px-2 space-y-3">
      {LOADING_STEPS.map((s, i) => {
        const done    = i < step;
        const active  = i === step;
        return (
          <div key={i} className="flex items-center gap-3">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs transition-all ${
              done   ? "bg-cyan/20 text-cyan" :
              active ? "bg-purple-500/20 text-purple-300 animate-pulse" :
                       "bg-white/5 text-white/20"
            }`}>
              {done ? "✓" : s.icon}
            </div>
            <span className={`text-sm transition-all ${
              done   ? "text-white/50 line-through" :
              active ? "text-white/90 font-medium" :
                       "text-white/20"
            }`}>
              {s.label}
            </span>
            {active && <span className="w-1.5 h-1.5 rounded-full bg-cyan animate-ping" />}
          </div>
        );
      })}
    </div>
  );
}

// ─── Idle state ───────────────────────────────────────────────────────────────
function IdleState() {
  return (
    <div className="flex flex-col items-center justify-center py-14 gap-6 text-center">
      <div className="relative">
        <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl"
          style={{ background: "rgba(191,90,242,0.08)", border: "1px solid rgba(191,90,242,0.2)" }}>
          ✦
        </div>
        <div className="absolute inset-0 rounded-full animate-ping opacity-20"
          style={{ background: "rgba(191,90,242,0.3)" }} />
      </div>
      <div className="max-w-xs space-y-2">
        <p className="text-base font-semibold text-white">Portfolio Analysis</p>
        <p className="text-sm text-white/40 leading-relaxed">
          Fetches live market data, computes your risk metrics, and delivers a private-wealth-grade report in seconds.
        </p>
      </div>
      <div className="flex gap-6 text-xs text-white/30">
        <span>◈ Live prices</span>
        <span>⚡ Risk metrics</span>
        <span>✦ AI analysis</span>
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function NoHoldingsState() {
  return (
    <div
      className="rounded-2xl flex flex-col items-center justify-center py-16 gap-5 text-center"
      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid #2a0050" }}
    >
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center text-xl"
        style={{ background: "rgba(191,90,242,0.08)", border: "1px solid rgba(191,90,242,0.2)" }}
      >
        ▦
      </div>
      <div className="space-y-1.5 max-w-xs">
        <p className="text-base font-semibold text-white">No holdings yet</p>
        <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.35)" }}>
          Add at least one holding on the Overview page before running an AI analysis.
        </p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AiPage() {
  const [text, setText]         = useState("");
  const [status, setStatus]     = useState<Status>("idle");
  const [error, setError]       = useState("");
  const [holdingCount, setHoldingCount] = useState<number | null>(null);
  const [usage, setUsage]       = useState<{ used: number; limit: number; remaining: number } | null>(null);
  const cleanupRef              = useRef<(() => void) | null>(null);
  const bottomRef               = useRef<HTMLDivElement>(null);
  const lastScrollRef           = useRef(0);

  useEffect(() => {
    fetchRefresh()
      .then(d => setHoldingCount(d.holdings.length))
      .catch(() => setHoldingCount(0));
    fetchAIUsage()
      .then(setUsage)
      .catch(() => {});
  }, []);

  function start() {
    setText(""); setError(""); setStatus("loading");
    const cleanup = streamAnalysis(
      (chunk) => {
        setStatus("streaming");
        setText(t => t + chunk);
        const now = Date.now();
        if (now - lastScrollRef.current > 400) {
          lastScrollRef.current = now;
          bottomRef.current?.scrollIntoView({ behavior: "smooth" });
        }
      },
      () => {
        setStatus("done");
        fetchAIUsage().then(setUsage).catch(() => {});
      },
      (msg) => {
        setError(msg);
        setStatus("error");
        fetchAIUsage().then(setUsage).catch(() => {});
      }
    );
    cleanupRef.current = cleanup;
  }

  const busy        = status === "loading" || status === "streaming";
  const hasHoldings = holdingCount === null || holdingCount > 0;
  const limitHit    = usage !== null && usage.remaining === 0;
  const sections    = parseSections(text);
  const partial     = busy ? parsePartial(text) : null;

  return (
    <>
      {/* Keyframe animation injected once */}
      <style>{`
        @keyframes ai-fadein {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="p-6 max-w-3xl mx-auto space-y-5 pb-16">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">AI Overview</h1>
            <p className="text-white/35 text-sm mt-1">
              Private-wealth-grade analysis · Live data
            </p>
            {usage && (
              <p className="text-[11px] mt-1 font-mono" style={{ color: limitHit ? "#ff2d78" : "#3a2a50" }}>
                {limitHit
                  ? "Daily limit reached — resets at midnight"
                  : `${usage.remaining} of ${usage.limit} analyses remaining today`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0 mt-0.5">
            {status !== "idle" && (
              <div className="flex items-center gap-2 text-xs text-white/40">
                {busy      && <span className="w-1.5 h-1.5 bg-cyan rounded-full animate-pulse" />}
                {status === "done"  && <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />}
                {status === "error" && <span className="w-1.5 h-1.5 bg-red-400 rounded-full" />}
                {busy ? "Analysing…" : status === "done" ? "Complete" : "Error"}
              </div>
            )}
            <button
              onClick={start}
              disabled={busy || !hasHoldings || holdingCount === 0 || limitHit}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl transition-all disabled:opacity-40"
              style={{
                background: busy || limitHit
                  ? "rgba(191,90,242,0.3)"
                  : "linear-gradient(135deg, #bf5af2 0%, #9d3fd4 100%)",
                color: "#fff",
                boxShadow: busy || limitHit ? "none" : "0 0 20px rgba(191,90,242,0.35)",
              }}
            >
              <span style={{ fontSize: 13 }}>✦</span>
              {limitHit ? "Limit reached" : status === "done" || status === "error" ? "Re-analyse" : "Run Analysis"}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Content area */}
        {holdingCount === 0 ? (
          <NoHoldingsState />
        ) : status === "idle" ? (
          <div className="bg-surface border border-border rounded-2xl">
            <IdleState />
          </div>
        ) : (status === "loading" || (status === "streaming" && sections.length === 0)) ? (
          <div className="bg-surface border border-border rounded-2xl px-6">
            <LoadingState status={status} />
          </div>
        ) : sections.length > 0 || partial ? (
          <div className="space-y-4">
            {sections.map((s, i) => (
              <SectionCard
                key={i}
                section={s}
                isLast={i === sections.length - 1 && !partial}
                isStreaming={busy}
              />
            ))}
            {partial && (
              <StreamingSectionCard key={partial.title} section={partial} />
            )}
          </div>
        ) : null}

        {/* Disclaimer */}
        {holdingCount !== 0 && (
          <p className="text-[11px] leading-relaxed pb-2" style={{ color: "#3a2a50" }}>
            Analysis is AI-generated using live market data and modelled risk estimates.
            It is provided for informational purposes only and does not constitute financial advice.
            Past performance is not a reliable indicator of future results. Consult a qualified financial
            adviser before making investment decisions.
          </p>
        )}

        <div ref={bottomRef} />
      </div>
    </>
  );
}
