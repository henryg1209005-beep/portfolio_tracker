"use client";
import { useRef, useState, useEffect, useCallback } from "react";
import { streamAnalysis, fetchRefresh, fetchAIUsage, saveAiReport, listAiReports, deleteAiReport, type AiReport } from "@/lib/api";
import { DEMO_AI_REPORT } from "@/lib/demoPortfolio";
import { useDemoMode } from "@/lib/demoModeContext";
import { trackEvent } from "@/lib/analytics";

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
    s.nextDelay = /[.!?]/.test(trailingChar) ? 550 + Math.random() * 200   // sentence end
                : trailingChar === "\n"       ? 380 + Math.random() * 150   // line break
                : /[,;:]/.test(trailingChar)  ? 260 + Math.random() * 100   // clause break
                :                               130 + Math.random() * 70;   // regular word

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
  const divRe = /^(?:[━─=\-]){8,}$/;
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
  const divRe = /^(?:[━─=\-]){8,}$/;
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

function sanitizeReportText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^\s*(?:[-_=~]{3,}|[━─]{3,})\s*$/gm, "")
    .replace(/\*\*/g, "")
    .replace(/^\s*---+\s*$/gm, "")
    .replace(/^\s*•\s*/gm, "- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractExecutiveBullets(text: string): string[] {
  const sections = parseSections(text);
  const tldr = sections.find((s) => s.title.toUpperCase() === "TL;DR");
  const source = tldr?.body ?? text;
  const bullets = source
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^[-*]\s+/.test(l))
    .map((l) => l.replace(/^[-*]\s+/, ""))
    .slice(0, 3);
  if (bullets.length > 0) return bullets;
  return source
    .split(/[.!?]\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
}

type ScoreChip = { label: string; value: string; tone: "good" | "warn" | "bad" | "muted" };
function extractScoreChips(text: string): ScoreChip[] {
  const picks: ScoreChip[] = [];
  const score = text.match(/overall\s*score[:\s]+(\d{1,3})\s*\/\s*100/i);
  if (score) {
    const v = Number(score[1]);
    picks.push({
      label: "Overall Score",
      value: `${v}/100`,
      tone: v >= 75 ? "good" : v >= 50 ? "warn" : "bad",
    });
  }
  const sharpe = text.match(/sharpe\s+ratio(?:\s+of)?[:\s]+(-?\d+(?:\.\d+)?)/i);
  if (sharpe) {
    const v = Number(sharpe[1]);
    picks.push({
      label: "Sharpe",
      value: v.toFixed(2),
      tone: v >= 1 ? "good" : v >= 0.5 ? "warn" : "bad",
    });
  }
  const sortino = text.match(/sortino\s+ratio(?:\s+of)?[:\s]+(-?\d+(?:\.\d+)?)/i);
  if (sortino) {
    const v = Number(sortino[1]);
    picks.push({
      label: "Sortino",
      value: v.toFixed(2),
      tone: v >= 1.5 ? "good" : v >= 0.7 ? "warn" : "bad",
    });
  }
  const beta = text.match(/\bbeta(?:\s*\(.*?\))?[:\s]+(-?\d+(?:\.\d+)?)/i);
  if (beta) {
    const v = Number(beta[1]);
    picks.push({
      label: "Beta",
      value: v.toFixed(2),
      tone: v < 0.8 ? "good" : v < 1.3 ? "warn" : "bad",
    });
  }
  const mdd = text.match(/max(?:imum)?\s+drawdown[:\s]+(-?\d+(?:\.\d+)?)%/i);
  if (mdd) {
    const v = Math.abs(Number(mdd[1]));
    picks.push({
      label: "Max Drawdown",
      value: `-${v.toFixed(1)}%`,
      tone: v <= 12 ? "good" : v <= 25 ? "warn" : "bad",
    });
  }
  if (picks.length === 0) {
    picks.push({ label: "Analysis", value: "Processing", tone: "muted" });
  }
  return picks.slice(0, 5);
}

// ─── Rich text helpers ────────────────────────────────────────────────────────
function highlightNumbers(text: string): React.ReactNode {
  const re = /(£[\d,]+(?:\.\d+)?|[+][\d.]+%|[-][\d.]+%|\d+(?:\.\d+)?%|\b\d+\.\d{2}\b)/g;
  const parts = text.split(re);
  return (
    <>
      {parts.map((p, i) => {
        if (/^£/.test(p))
          return (
            <span key={i} className="font-semibold font-mono text-[13px] px-1.5 py-0.5 rounded-md mx-0.5"
              style={{ color: "#00e6b4", background: "rgba(0,230,180,0.08)", border: "1px solid rgba(0,230,180,0.15)" }}>
              {p}
            </span>
          );
        if (/^\+/.test(p) && p.endsWith("%"))
          return (
            <span key={i} className="font-semibold font-mono text-[13px] px-1 py-0.5 rounded mx-0.5"
              style={{ color: "#34d399", background: "rgba(52,211,153,0.08)" }}>
              {p}
            </span>
          );
        if (/^-/.test(p) && p.endsWith("%"))
          return (
            <span key={i} className="font-semibold font-mono text-[13px] px-1 py-0.5 rounded mx-0.5"
              style={{ color: "#f87171", background: "rgba(248,113,113,0.08)" }}>
              {p}
            </span>
          );
        if (p.endsWith("%"))
          return <span key={i} className="font-semibold text-white/90">{p}</span>;
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
          ? <strong key={i} className="font-semibold" style={{ color: "rgba(255,255,255,0.95)" }}>{p}</strong>
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
        <ul key={`ul${i}`} className="space-y-3 my-4 pl-1">
          {bullets.map((b, j) => (
            <li key={j} className="flex gap-3.5 text-sm leading-relaxed text-white/80">
              <span className="mt-[6px] w-1.5 h-1.5 rounded-full shrink-0 opacity-80" style={{ background: "#bf5af2", boxShadow: "0 0 4px #bf5af260" }} />
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
        <div key={i} className="flex gap-3.5 text-sm leading-relaxed text-white/80 my-2.5">
          <span
            className="shrink-0 tabular-nums text-[11px] font-bold mt-0.5 w-5 h-5 rounded-md flex items-center justify-center"
            style={{ background: "rgba(191,90,242,0.12)", color: "#bf5af2", border: "1px solid rgba(191,90,242,0.2)" }}
          >
            {num.replace(".", "")}
          </span>
          <span>{inlineBold(line.replace(/^\d+\.\s*/, ""))}</span>
        </div>
      );
    } else if (line.trim() === "") {
      els.push(<div key={i} className="h-3" />);
    } else {
      els.push(
        <p key={i} className="text-sm leading-relaxed text-white/80">
          {inlineBold(line)}
        </p>
      );
    }
    i++;
  }
  return <div className="space-y-2.5">{els}</div>;
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
    <div className="space-y-2.5">
      {bullets.map((b, i) => {
        const v = variants[i] ?? variants[2];
        return (
          <div key={i} className="flex gap-4 px-4 py-4 rounded-2xl"
            style={{ background: v.bg, border: `1px solid ${v.border}` }}>
            <div className="shrink-0 flex flex-col items-center gap-1.5 pt-0.5 min-w-[40px]">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
                style={{ background: `${v.accent}14`, border: `1px solid ${v.border}` }}>
                <span style={{ color: v.accent }}>{v.icon}</span>
              </div>
              <span className="text-[8px] font-bold tracking-widest leading-tight text-center" style={{ color: v.accent, opacity: 0.6 }}>{v.label}</span>
            </div>
            <p className="text-sm leading-relaxed pt-1" style={{ color: "rgba(255,255,255,0.88)" }}>{b}</p>
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
  "6. OBSERVATIONS WORTH CONSIDERING": { icon: "✦" },
  "7. OVERALL ASSESSMENT":             { icon: "▣" },
};

function SectionCard({ section, isLast, isStreaming, index = 0 }: {
  section: Section; isLast: boolean; isStreaming: boolean; index?: number;
}) {
  const meta = SECTION_META[section.title.toUpperCase()] ?? { icon: "◈" };
  const accent = meta.accent ?? "#bf5af2";
  const isTldr = section.title.toUpperCase() === "TL;DR";

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{
        background: `linear-gradient(160deg, ${accent}07 0%, rgba(8,0,18,0.55) 55%)`,
        animation: `ai-fadein 0.4s ease both`,
        animationDelay: `${index * 0.04}s`,
        border: "1px solid rgba(42,0,80,0.85)",
        borderLeft: `3px solid ${accent}80`,
      }}>
      {/* Header bar */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b"
        style={{
          background: `linear-gradient(90deg, ${accent}18 0%, transparent 65%)`,
          borderColor: "rgba(42,0,80,0.6)",
        }}>
        <span className="text-sm" style={{ color: accent }}>{meta.icon}</span>
        <span className="text-[11px] font-bold tracking-[0.18em] uppercase" style={{ color: accent }}>
          {section.title}
        </span>
      </div>
      {/* Body */}
      <div className="px-5 py-5">
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
function StreamingSectionCard({ section, active }: { section: Section; active: boolean }) {
  const meta   = SECTION_META[section.title.toUpperCase()] ?? { icon: "◈" };
  const accent = meta.accent ?? "#bf5af2";
  const isTldr = section.title.toUpperCase() === "TL;DR";
  const typed  = useTypewriter(section.body, active);

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{
        background: `linear-gradient(160deg, ${accent}07 0%, rgba(8,0,18,0.55) 55%)`,
        animation: "ai-fadein 0.4s ease both",
        border: "1px solid rgba(42,0,80,0.85)",
        borderLeft: `3px solid ${accent}80`,
      }}>
      <div className="flex items-center gap-3 px-5 py-3.5 border-b"
        style={{
          background: `linear-gradient(90deg, ${accent}18 0%, transparent 65%)`,
          borderColor: "rgba(42,0,80,0.6)",
        }}>
        <span className="text-sm" style={{ color: accent }}>{meta.icon}</span>
        <span className="text-[11px] font-bold tracking-[0.18em] uppercase" style={{ color: accent }}>
          {section.title}
        </span>
      </div>
      <div className="px-5 py-5">
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

function StreamingRawCard({ text }: { text: string }) {
  return (
    <div
      className="rounded-2xl border border-border px-6 py-5"
      style={{ background: "rgba(255,255,255,0.02)" }}
    >
      <div className="flex items-center gap-2.5 mb-3">
        <span style={{ color: "#bf5af2", fontSize: 13 }}>✦</span>
        <span className="text-xs font-bold tracking-[0.14em] uppercase" style={{ color: "#bf5af2" }}>
          Analysis Stream
        </span>
        <span className="w-1.5 h-1.5 bg-cyan rounded-full animate-pulse ml-1" />
      </div>
      <p className="text-sm leading-relaxed text-white/80 whitespace-pre-wrap">{text}</p>
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
  const { isDemoMode, demoData } = useDemoMode();
  const [text, setText]         = useState("");
  const [status, setStatus]     = useState<Status>("idle");
  const [error, setError]       = useState("");
  const [holdingCount, setHoldingCount] = useState<number | null>(null);
  const [usage, setUsage]       = useState<{ used: number; limit: number; remaining: number } | null>(null);
  const cleanupRef              = useRef<(() => void) | null>(null);
  const bottomRef               = useRef<HTMLDivElement>(null);
  const lastScrollRef           = useRef(0);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedReports, setSavedReports]     = useState<AiReport[]>([]);
  const [expandedReport, setExpandedReport] = useState<number | null>(null);

  useEffect(() => {
    if (isDemoMode) {
      // In demo mode, always allow analysis — use 1 as minimum so the button isn't disabled
      setHoldingCount(Math.max(1, demoData.holdings.length));
      setUsage({ used: 0, limit: 999, remaining: 999 });
      setSavedReports([]);
      return;
    }
    fetchRefresh()
      .then(d => setHoldingCount(d.holdings.length))
      .catch(() => setHoldingCount(0));
    fetchAIUsage()
      .then(setUsage)
      .catch(() => {});
    listAiReports()
      .then(setSavedReports)
      .catch(() => {});
  }, [isDemoMode, demoData.holdings.length]);

  async function handleSave() {
    if (!text || saveState === "saving" || saveState === "saved") return;
    setSaveState("saving");
    try {
      await saveAiReport(text);
      const reports = await listAiReports();
      setSavedReports(reports);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  function start() {
    setText(""); setError(""); setStatus("loading"); setSaveState("idle");
    void trackEvent("ai_analysis_run", { is_demo_mode: isDemoMode, holdings_count: holdingCount ?? 0 });
    if (isDemoMode) {
      setStatus("streaming");
      window.setTimeout(() => {
        setText(sanitizeReportText(DEMO_AI_REPORT));
        setStatus("done");
      }, 500);
      return;
    }
    const cleanup = streamAnalysis(
      (chunk) => {
        setStatus("streaming");
        setText(t => sanitizeReportText(t + chunk));
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
  const cleanText   = sanitizeReportText(text);
  const sections    = parseSections(cleanText);
  const hasText     = cleanText.trim().length > 0;
  // Keep partial alive on "done" so the typewriter can finish the last section,
  // but suppress it if parseSections already includes that section (avoids duplicate)
  const _partial    = (busy || status === "done") ? parsePartial(cleanText) : null;
  const partial     = _partial && !sections.some(s => s.title === _partial.title) ? _partial : null;
  const execBullets = extractExecutiveBullets(cleanText);
  const chips       = extractScoreChips(cleanText);

  return (
    <>
      {/* Keyframe animation injected once */}
      <style>{`
        @keyframes ai-fadein {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="p-6 max-w-5xl mx-auto space-y-5 pb-16">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">AI Overview</h1>
            <p className="text-white/35 text-sm mt-1">
              Private-wealth-grade analysis · Live data
            </p>
            {isDemoMode ? (
              <p className="text-[11px] mt-1 font-mono" style={{ color: "#4a3a5e" }}>
                Demo mode · Unlimited analyses
              </p>
            ) : usage && (
              <p className="text-[11px] mt-1 font-mono" style={{ color: limitHit ? "#ff2d78" : "#6b5e7e" }}>
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
            {status === "done" && (
              <button
                onClick={handleSave}
                disabled={saveState === "saving" || saveState === "saved"}
                className="px-3 py-2 text-xs font-mono rounded-lg transition-all disabled:opacity-50"
                style={{
                  border: saveState === "saved" ? "1px solid #00f5d433" : "1px solid #2a0050",
                  color:  saveState === "saved" ? "#00f5d4" : saveState === "error" ? "#ff2d78" : "#6b5e7e",
                }}
                onMouseEnter={e => { if (saveState === "idle") { (e.currentTarget as HTMLElement).style.color = "#e2d9f3"; (e.currentTarget as HTMLElement).style.borderColor = "#bf5af2"; }}}
                onMouseLeave={e => { if (saveState === "idle") { (e.currentTarget as HTMLElement).style.color = "#6b5e7e"; (e.currentTarget as HTMLElement).style.borderColor = "#2a0050"; }}}
              >
                {saveState === "saving" ? "Saving…" : saveState === "saved" ? "✓ Saved" : saveState === "error" ? "Failed" : "↓ Save Report"}
              </button>
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

        {(sections.length > 0 || hasText) && (
          <div
            className="rounded-2xl border px-5 py-4 md:px-6 md:py-5 space-y-4"
            style={{
              background: "linear-gradient(180deg, rgba(191,90,242,0.09) 0%, rgba(255,255,255,0.02) 65%)",
              borderColor: "#2a0050",
            }}
          >
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-widest" style={{ color: "#bf5af2" }}>
                  Executive Summary
                </div>
                <p className="text-xs mt-1 text-white/55">
                  Key takeaways before the deep-dive sections.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {chips.map((c) => {
                  const tone =
                    c.tone === "good" ? { bg: "#00f5d422", fg: "#00f5d4", br: "#00f5d455" } :
                    c.tone === "warn" ? { bg: "#f5a62322", fg: "#f5a623", br: "#f5a62355" } :
                    c.tone === "bad" ? { bg: "#ff2d7822", fg: "#ff2d78", br: "#ff2d7855" } :
                    { bg: "#6b5e7e22", fg: "#9b8ab0", br: "#6b5e7e55" };
                  return (
                    <div
                      key={`${c.label}-${c.value}`}
                      className="rounded-lg px-2.5 py-1.5"
                      style={{ background: tone.bg, color: tone.fg, border: `1px solid ${tone.br}` }}
                    >
                      <div className="text-[9px] font-mono uppercase tracking-widest opacity-85">{c.label}</div>
                      <div className="text-sm font-mono font-semibold">{c.value}</div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="grid md:grid-cols-3 gap-2.5">
              {execBullets.map((b, i) => (
                <div
                  key={`${i}-${b.slice(0, 16)}`}
                  className="rounded-xl px-3 py-2.5 text-sm leading-relaxed"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid #2a0050" }}
                >
                  <span className="text-[10px] font-mono mr-2" style={{ color: "#bf5af2" }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-white/80">{b}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Content area */}
        {holdingCount === 0 ? (
          <NoHoldingsState />
        ) : status === "idle" ? (
          <div className="bg-surface border border-border rounded-2xl">
            <IdleState />
          </div>
        ) : (status === "loading" || (status === "streaming" && sections.length === 0 && !hasText)) ? (
          <div className="bg-surface border border-border rounded-2xl px-6">
            <LoadingState status={status} />
          </div>
        ) : (status === "streaming" || status === "done") && sections.length === 0 && hasText ? (
          <StreamingRawCard text={cleanText} />
        ) : sections.length > 0 || partial ? (
          <div className="space-y-3">
            {sections.map((s, i) => (
              <SectionCard
                key={i}
                section={s}
                isLast={i === sections.length - 1 && !partial}
                isStreaming={busy}
                index={i}
              />
            ))}
            {partial && (
              <StreamingSectionCard key={partial.title} section={partial} active={busy} />
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

        {/* Saved Reports */}
        {savedReports.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold tracking-[0.14em] uppercase" style={{ color: "#6b5e7e" }}>Saved Reports</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full" style={{ background: "#1a0030", color: "#6b5e7e", border: "1px solid #2a0050" }}>
                {savedReports.length}/10
              </span>
            </div>
            {savedReports.map(r => {
              const date = new Date(r.created_at);
              const label = date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) + " · " + date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
              const isOpen = expandedReport === r.id;
              const reportText = sanitizeReportText(r.text);
              const reportSections = parseSections(reportText);
              return (
                <div key={r.id} className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid #2a0050" }}>
                  {/* Row header */}
                  <div className="flex items-center justify-between px-5 py-3 cursor-pointer" onClick={() => setExpandedReport(isOpen ? null : r.id)}>
                    <div className="flex items-center gap-3">
                      <span style={{ color: "#bf5af2", fontSize: 12 }}>◈</span>
                      <span className="text-xs font-mono text-white/50">{label}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={async e => {
                          e.stopPropagation();
                          await deleteAiReport(r.id).catch(() => {});
                          setSavedReports(prev => prev.filter(x => x.id !== r.id));
                          if (expandedReport === r.id) setExpandedReport(null);
                        }}
                        className="text-[11px] font-mono transition-all"
                        style={{ color: "#3a2a50" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#ff2d78"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#3a2a50"; }}
                      >
                        ✕
                      </button>
                      <span className="text-[10px] text-white/20">{isOpen ? "▲" : "▼"}</span>
                    </div>
                  </div>
                  {/* Expanded content */}
                  {isOpen && (
                    <div className="border-t px-5 py-4 space-y-4" style={{ borderColor: "#2a0050" }}>
                      {reportSections.length > 0
                        ? reportSections.map((s, i) => (
                            <SectionCard key={i} section={s} isLast={i === reportSections.length - 1} isStreaming={false} />
                          ))
                        : <p className="text-sm text-white/40 whitespace-pre-wrap">{reportText}</p>
                      }
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </>
  );
}
