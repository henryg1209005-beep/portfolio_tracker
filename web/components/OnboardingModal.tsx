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
      { value: "long_term_growth", label: "Long-term growth",   desc: "Build wealth over time" },
      { value: "income",           label: "Income",             desc: "Dividends and yield" },
      { value: "preservation",     label: "Capital preservation", desc: "Protect what you have" },
    ],
  },
  {
    key: "time_horizon" as const,
    question: "What's your investment time horizon?",
    subtitle: "Short-term investors need different risk profiles to long-term ones.",
    options: [
      { value: "<2",  label: "Under 2 years",  desc: "Short-term" },
      { value: "2-5", label: "2–5 years",      desc: "Medium-term" },
      { value: "5-10",label: "5–10 years",     desc: "Long-term" },
      { value: "10+", label: "10+ years",      desc: "Very long-term" },
    ],
  },
];

export default function OnboardingModal({ onDone }: Props) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<InvestorProfile>>({});
  const [saving, setSaving] = useState(false);

  const current = STEPS[step];
  const selected = answers[current.key];

  async function handleNext() {
    if (!selected) return;
    if (step < STEPS.length - 1) {
      setStep(s => s + 1);
      return;
    }
    setSaving(true);
    try {
      await saveProfile(answers as InvestorProfile);
      onDone();
    } catch {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "#080012ee", backdropFilter: "blur(8px)" }}
    >
      <div
        className="w-full max-w-lg rounded-2xl p-8 flex flex-col gap-6"
        style={{ background: "#0d0020", border: "1px solid #2a0050" }}
      >
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
          <h2 className="text-xl font-bold mb-1" style={{ color: "#e2d9f3" }}>{current.question}</h2>
          <p className="text-sm" style={{ color: "#4a3a5e" }}>{current.subtitle}</p>
        </div>

        {/* Options */}
        <div className="flex flex-col gap-3">
          {current.options.map(opt => {
            const active = selected === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setAnswers(a => ({ ...a, [current.key]: opt.value }))}
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

        {/* Next */}
        <button
          onClick={handleNext}
          disabled={!selected || saving}
          className="px-6 py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-30"
          style={{ background: "linear-gradient(90deg,#bf5af2,#ff2d78)", color: "#fff" }}
        >
          {saving ? "Saving…" : step < STEPS.length - 1 ? "Next →" : "Get started →"}
        </button>
      </div>
    </div>
  );
}
