"use client";
import { useState } from "react";
import { saveProfile, InvestorProfile } from "@/lib/api";

type Props = { onDone: () => void };

const STEPS = [
  {
    key: "risk_appetite" as const,
    question: "What's your risk appetite?",
    subtitle: "This shapes how we interpret your portfolio's volatility and concentration.",
    options: [
      { value: "conservative", label: "Conservative", desc: "Preserve capital, minimal drawdowns" },
      { value: "balanced",     label: "Balanced",     desc: "Mix of growth and stability" },
      { value: "growth",       label: "Growth",       desc: "Maximise returns, accept higher risk" },
    ],
  },
  {
    key: "goal" as const,
    question: "What's your primary investment goal?",
    subtitle: "We'll tailor observations to what actually matters to you.",
    options: [
      { value: "long_term_growth", label: "Long-term growth",    desc: "Build wealth over time" },
      { value: "income",           label: "Income",              desc: "Dividends and yield" },
      { value: "preservation",     label: "Capital preservation", desc: "Protect what you have" },
    ],
  },
  {
    key: "time_horizon" as const,
    question: "What's your investment time horizon?",
    subtitle: "Short-term investors need different risk profiles to long-term ones.",
    options: [
      { value: "<2",   label: "Under 2 years", desc: "Short-term" },
      { value: "2-5",  label: "2–5 years",     desc: "Medium-term" },
      { value: "5-10", label: "5–10 years",     desc: "Long-term" },
      { value: "10+",  label: "10+ years",      desc: "Very long-term" },
    ],
  },
];

export default function OnboardingModal({ onDone }: Props) {
  // -1 = welcome, 0-2 = profile questions, 3 = done
  const [step, setStep] = useState(-1);
  const [answers, setAnswers] = useState<Partial<InvestorProfile>>({});
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function handleNext() {
    if (step === -1) { setStep(0); return; }
    const current = STEPS[step];
    if (!answers[current.key]) return;
    if (step < STEPS.length - 1) { setStep(s => s + 1); return; }
    setSaving(true);
    try {
      await saveProfile(answers as InvestorProfile);
      setDone(true);
    } catch {
      setSaving(false);
    }
  }

  const current = step >= 0 ? STEPS[step] : null;
  const selected = current ? answers[current.key] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "#080012ee", backdropFilter: "blur(8px)" }}
    >
      <div
        className="w-full max-w-lg rounded-2xl p-8 flex flex-col gap-6"
        style={{ background: "#0d0020", border: "1px solid #2a0050" }}
      >
        {/* ── Done state ── */}
        {done ? (
          <>
            <div className="flex flex-col items-center text-center gap-4 py-4">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl"
                style={{ background: "linear-gradient(135deg,#bf5af222,#ff2d7811)", border: "1px solid #bf5af233" }}>
                ✦
              </div>
              <div>
                <h2 className="text-xl font-bold mb-2" style={{ color: "#e2d9f3" }}>You&apos;re all set</h2>
                <p className="text-sm leading-relaxed" style={{ color: "#4a3a5e" }}>
                  Your investor profile is saved. Add your first holding to start seeing live prices, risk metrics, and AI analysis.
                </p>
              </div>
            </div>
            <button
              onClick={onDone}
              className="px-6 py-3 rounded-xl text-sm font-semibold transition-all"
              style={{ background: "linear-gradient(90deg,#bf5af2,#ff2d78)", color: "#fff" }}
            >
              + Add your first holding →
            </button>
          </>
        ) : step === -1 ? (
          /* ── Welcome step ── */
          <>
            <div className="flex flex-col items-center text-center gap-4 py-2">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl"
                style={{ background: "linear-gradient(135deg,#bf5af222,#00f5d411)", border: "1px solid #bf5af233" }}>
                ◈
              </div>
              <div>
                <h2 className="text-xl font-bold mb-2" style={{ color: "#e2d9f3" }}>Welcome to Portivex</h2>
                <p className="text-sm leading-relaxed" style={{ color: "#4a3a5e" }}>
                  Three quick questions so we can tailor your risk metrics and AI analysis to your actual goals. Takes 30 seconds.
                </p>
              </div>
              <div className="flex flex-col gap-2 w-full text-left">
                {[
                  { icon: "◈", text: "Institutional risk metrics — Sharpe, beta, VaR, alpha" },
                  { icon: "✦", text: "AI analysis written around your specific holdings" },
                  { icon: "▦", text: "Live prices, P&L, and portfolio allocation" },
                ].map(({ icon, text }) => (
                  <div key={text} className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm"
                    style={{ background: "#080012", border: "1px solid #1a0030" }}>
                    <span style={{ color: "#bf5af2" }}>{icon}</span>
                    <span style={{ color: "#6b5e7e" }}>{text}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={onDone}
                className="flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all"
                style={{ background: "#080012", border: "1px solid #1a0030", color: "#4a3a5e" }}
              >
                Skip for now
              </button>
              <button
                onClick={handleNext}
                className="flex-1 px-6 py-3 rounded-xl text-sm font-semibold transition-all"
                style={{ background: "linear-gradient(90deg,#bf5af2,#ff2d78)", color: "#fff" }}
              >
                Let&apos;s go →
              </button>
            </div>
          </>
        ) : (
          /* ── Profile questions ── */
          <>
            {/* Progress */}
            <div className="flex gap-1.5">
              {STEPS.map((_, i) => (
                <div key={i} className="h-1 flex-1 rounded-full transition-all"
                  style={{ background: i <= step ? "linear-gradient(90deg,#bf5af2,#ff2d78)" : "#1a0030" }} />
              ))}
            </div>

            {/* Question */}
            <div>
              <div className="text-[11px] font-mono uppercase tracking-widest mb-2" style={{ color: "#4a3a5e" }}>
                Step {step + 1} of {STEPS.length}
              </div>
              <h2 className="text-xl font-bold mb-1" style={{ color: "#e2d9f3" }}>{current!.question}</h2>
              <p className="text-sm" style={{ color: "#4a3a5e" }}>{current!.subtitle}</p>
            </div>

            {/* Options */}
            <div className="flex flex-col gap-3">
              {current!.options.map(opt => {
                const active = selected === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setAnswers(a => ({ ...a, [current!.key]: opt.value }))}
                    className="flex items-center gap-4 px-4 py-3.5 rounded-xl text-left transition-all"
                    style={{
                      background: active ? "linear-gradient(90deg,#bf5af211,#ff2d7808)" : "#080012",
                      border: `1px solid ${active ? "#bf5af244" : "#1a0030"}`,
                    }}
                  >
                    <div
                      className="w-4 h-4 rounded-full shrink-0 transition-all"
                      style={{
                        border: `2px solid ${active ? "#bf5af2" : "#2a0050"}`,
                        background: active ? "#bf5af2" : "transparent",
                      }}
                    />
                    <div>
                      <div className="text-sm font-semibold" style={{ color: active ? "#e2d9f3" : "#6b5e7e" }}>{opt.label}</div>
                      <div className="text-xs mt-0.5" style={{ color: "#3a2a50" }}>{opt.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={onDone}
                className="px-4 py-3 rounded-xl text-sm font-medium transition-all"
                style={{ background: "#080012", border: "1px solid #1a0030", color: "#4a3a5e" }}
              >
                Skip
              </button>
              <button
                onClick={handleNext}
                disabled={!selected || saving}
                className="flex-1 px-6 py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-30"
                style={{ background: "linear-gradient(90deg,#bf5af2,#ff2d78)", color: "#fff" }}
              >
                {saving ? "Saving…" : step < STEPS.length - 1 ? "Next →" : "Finish →"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
