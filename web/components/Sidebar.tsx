"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import FeedbackModal from "@/components/FeedbackModal";
import OnboardingModal from "@/components/OnboardingModal";

const links = [
  { href: "/dashboard",             label: "Overview",    icon: "▦" },
  { href: "/dashboard/metrics",     label: "Risk Metrics", icon: "◈" },
  { href: "/dashboard/correlation", label: "Correlation", icon: "⬡" },
  { href: "/dashboard/charts",      label: "Charts",      icon: "↗" },
  { href: "/dashboard/ai",          label: "AI Overview", icon: "✦" },
];

type Props = {
  token: string;
  copied: boolean;
  onCopyToken: () => void;
};

export default function Sidebar({ token, copied, onCopyToken }: Props) {
  const path = usePathname();
  const { signOut } = useClerk();
  const [showFeedback, setShowFeedback] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  return (
    <>
      <aside className="w-52 shrink-0 flex flex-col py-6 px-4 gap-1 relative"
        style={{ background: "linear-gradient(180deg, #10001e 0%, #080012 100%)", borderRight: "1px solid #2a0050" }}>

        {/* Logo */}
        <div className="mb-8 px-2">
          <div className="text-lg font-bold tracking-tight">
            <span className="text-pink glow-pink">Porti</span>
            <span className="text-text">vex</span>
          </div>
          <div className="text-xs text-muted mt-0.5 font-mono">v1.0</div>
        </div>

        {links.map((l) => {
          const active = path === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
                ${active
                  ? "text-cyan border border-cyan/20 border-glow-cyan"
                  : "text-muted hover:text-text hover:bg-white/5"
                }`}
              style={active ? { background: "linear-gradient(90deg, #00f5d411, transparent)" } : {}}
            >
              <span className={`text-base ${active ? "glow-cyan" : ""}`}>{l.icon}</span>
              {l.label}
            </Link>
          );
        })}

        {/* Profile */}
        <button
          onClick={() => setShowProfile(true)}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-muted hover:text-text hover:bg-white/5 w-full text-left"
        >
          <span className="text-base">◉</span>
          Investor profile
        </button>

        {/* Feedback */}
        <button
          onClick={() => setShowFeedback(true)}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-muted hover:text-text hover:bg-white/5 w-full text-left mt-2"
          style={{ borderTop: "1px solid #1a0030", paddingTop: "12px" }}
        >
          <span className="text-base">◎</span>
          Feedback
        </button>

        {/* Sign out */}
        <button
          onClick={() => signOut({ redirectUrl: "/" })}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-muted hover:text-text hover:bg-white/5 w-full text-left"
        >
          <span className="text-base">→</span>
          Sign out
        </button>

        {/* Access token */}
        {token && (
          <div className="mt-auto pt-4" style={{ borderTop: "1px solid #1a0030" }}>
            <div className="text-[9px] font-mono uppercase tracking-widest mb-1.5" style={{ color: "#3a2a50" }}>
              Your access token
            </div>
            <button
              onClick={onCopyToken}
              title="Click to copy your token"
              className="w-full text-left rounded-lg px-2 py-1.5 transition-colors"
              style={{ background: "#0d0020", border: "1px solid #1a0030" }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = "#2a0050")}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "#1a0030")}
            >
              <div className="text-[10px] font-mono truncate" style={{ color: "#3a2a50" }}>
                {token.slice(0, 18)}…
              </div>
              <div className="text-[9px] mt-0.5" style={{ color: copied ? "#00f5d4" : "#2a1a40" }}>
                {copied ? "✓ Copied" : "Click to copy"}
              </div>
            </button>
          </div>
        )}
      </aside>

      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}
      {showProfile && <OnboardingModal onDone={() => setShowProfile(false)} />}
    </>
  );
}
