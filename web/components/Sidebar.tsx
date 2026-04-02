"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import FeedbackModal from "@/components/FeedbackModal";
import OnboardingModal from "@/components/OnboardingModal";
import { getProfile, type InvestorProfile } from "@/lib/api";

const links = [
  { href: "/dashboard", label: "Overview", icon: "◨" },
  { href: "/dashboard/metrics", label: "Risk Metrics", icon: "◈" },
  { href: "/dashboard/correlation", label: "Correlation", icon: "⬡" },
  { href: "/dashboard/charts", label: "Charts", icon: "↗" },
  { href: "/dashboard/ai", label: "AI", icon: "✦" },
  { href: "/dashboard/analytics", label: "Analytics", icon: "◇" },
];

type Props = {
  token: string;
  copied: boolean;
  onCopyToken: () => void;
  isDemoMode: boolean;
  onToggleDemoMode: () => void;
  isAdminUser: boolean;
};

export default function Sidebar({ token, copied, onCopyToken, isDemoMode, onToggleDemoMode, isAdminUser }: Props) {
  const path = usePathname();
  const { signOut } = useClerk();
  const [showFeedback, setShowFeedback] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [profile, setProfile] = useState<Partial<InvestorProfile> | null>(null);

  useEffect(() => {
    if (!showProfile) return;
    getProfile().then((p) => {
      if (p.exists) setProfile(p);
    }).catch(() => {});
  }, [showProfile]);

  const visibleLinks = isAdminUser ? links : links.filter((l) => l.href !== "/dashboard/analytics");

  return (
    <>
      <aside
        className="hidden md:flex w-52 shrink-0 flex-col py-6 px-4 gap-1 relative"
        style={{ background: "linear-gradient(180deg, #10001e 0%, #080012 100%)", borderRight: "1px solid #2a0050" }}
      >
        <div className="mb-6 px-1">
          <Image src="/logo.png" alt="Portivex" width={180} height={60} className="object-contain w-full" />
        </div>

        {visibleLinks.map((l) => {
          const active = path === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
                ${active ? "text-cyan border border-cyan/20 border-glow-cyan" : "text-muted hover:text-text hover:bg-white/5"}`}
              style={active ? { background: "linear-gradient(90deg, #00f5d411, transparent)" } : {}}
            >
              <span className={`text-base ${active ? "glow-cyan" : ""}`}>{l.icon}</span>
              {l.label}
            </Link>
          );
        })}

        <button
          onClick={() => setShowProfile(true)}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-muted hover:text-text hover:bg-white/5 w-full text-left"
        >
          <span className="text-base">◉</span>
          Investor profile
        </button>

        <button
          onClick={() => setShowFeedback(true)}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-muted hover:text-text hover:bg-white/5 w-full text-left mt-2"
          style={{ borderTop: "1px solid #1a0030", paddingTop: "12px" }}
        >
          <span className="text-base">◎</span>
          Feedback
        </button>

        <a
          href="https://discord.gg/MabTm9Z4zR"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-muted hover:text-text hover:bg-white/5 w-full text-left"
        >
          <span className="text-base">◈</span>
          Discord
        </a>

        <button
          onClick={() => signOut({ redirectUrl: "/" })}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-muted hover:text-text hover:bg-white/5 w-full text-left"
        >
          <span className="text-base">→</span>
          Sign out
        </button>

        <button
          onClick={onToggleDemoMode}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all w-full text-left"
          style={{
            color: isDemoMode ? "#bf5af2" : "#6b5e7e",
            background: isDemoMode ? "#bf5af211" : "transparent",
            border: isDemoMode ? "1px solid #bf5af244" : "1px solid transparent",
          }}
        >
          <span className="text-base">{isDemoMode ? "●" : "○"}</span>
          {isDemoMode ? "Demo on" : "Demo off"}
        </button>

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
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#2a0050")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#1a0030")}
            >
              <div className="text-[10px] font-mono truncate" style={{ color: "#3a2a50" }}>
                {token.slice(0, 18)}...
              </div>
              <div className="text-[9px] mt-0.5" style={{ color: copied ? "#00f5d4" : "#2a1a40" }}>
                {copied ? "Copied" : "Click to copy"}
              </div>
            </button>
          </div>
        )}
      </aside>

      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-stretch"
        style={{ background: "#10001e", borderTop: "1px solid #2a0050", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {visibleLinks.map((l) => {
          const active = path === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className="flex-1 flex flex-col items-center justify-center py-2.5 gap-1 transition-all"
              style={{ color: active ? "#00f5d4" : "#4a3a5e" }}
            >
              <span className="text-lg leading-none" style={active ? { textShadow: "0 0 12px #00f5d488" } : {}}>
                {l.icon}
              </span>
              <span className="text-[9px] font-mono tracking-wide">{l.label}</span>
            </Link>
          );
        })}

        <button
          onClick={() => setShowMore(true)}
          className="flex-1 flex flex-col items-center justify-center py-2.5 gap-1 transition-all"
          style={{ color: "#4a3a5e" }}
        >
          <span className="text-lg leading-none">⋯</span>
          <span className="text-[9px] font-mono tracking-wide">More</span>
        </button>
      </nav>

      {showMore && (
        <div className="md:hidden fixed inset-0 z-50" onClick={() => setShowMore(false)}>
          <div className="absolute inset-0" style={{ background: "rgba(8,0,18,0.7)", backdropFilter: "blur(4px)" }} />
          <div
            className="absolute bottom-0 left-0 right-0 rounded-t-2xl px-4 pt-4 pb-8 flex flex-col gap-1"
            style={{ background: "#10001e", border: "1px solid #2a0050", borderBottom: "none" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: "#2a0050" }} />

            <button
              onClick={() => { setShowProfile(true); setShowMore(false); }}
              className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-all text-muted w-full text-left"
              style={{ background: "#0d0020" }}
            >
              <span className="text-base">◉</span>
              Investor Profile
            </button>

            <button
              onClick={() => { setShowFeedback(true); setShowMore(false); }}
              className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-all text-muted w-full text-left"
              style={{ background: "#0d0020" }}
            >
              <span className="text-base">◎</span>
              Feedback
            </button>

            <a
              href="https://discord.gg/MabTm9Z4zR"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-all text-muted w-full text-left"
              style={{ background: "#0d0020" }}
              onClick={() => setShowMore(false)}
            >
              <span className="text-base">◈</span>
              Discord Community
            </a>

            <button
              onClick={() => { onToggleDemoMode(); setShowMore(false); }}
              className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-all w-full text-left"
              style={{
                background: isDemoMode ? "#bf5af211" : "#0d0020",
                color: isDemoMode ? "#bf5af2" : "#6b5e7e",
                border: isDemoMode ? "1px solid #bf5af244" : "1px solid #1a0030",
              }}
            >
              <span className="text-base">{isDemoMode ? "●" : "○"}</span>
              {isDemoMode ? "Disable Demo Mode" : "Enable Demo Mode"}
            </button>

            <button
              onClick={() => signOut({ redirectUrl: "/" })}
              className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-all w-full text-left mt-1"
              style={{ background: "#0d0020", color: "#ff2d7888" }}
            >
              <span className="text-base">→</span>
              Sign Out
            </button>
          </div>
        </div>
      )}

      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}
      {showProfile && (
        <OnboardingModal
          onDone={() => setShowProfile(false)}
          initialProfile={profile}
          onSaved={(saved) => setProfile(saved)}
        />
      )}
    </>
  );
}
