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
  { href: "/dashboard", label: "Overview", icon: "OVR" },
  { href: "/dashboard/metrics", label: "Risk Metrics", icon: "RSK" },
  { href: "/dashboard/correlation", label: "Correlation", icon: "COR" },
  { href: "/dashboard/charts", label: "Charts", icon: "CHT" },
  { href: "/dashboard/ai", label: "AI", icon: "AIX" },
  { href: "/dashboard/analytics", label: "Analytics", icon: "ANL" },
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
        className="hidden md:flex w-56 shrink-0 flex-col py-5 px-3.5 gap-1 relative"
        style={{ background: "linear-gradient(180deg, #0d1828 0%, #081220 100%)", borderRight: "1px solid #1f3248" }}
      >
        <div className="mb-5 px-1">
          <Image src="/logo.png" alt="Portivex" width={180} height={60} className="object-contain w-full" />
          <div className="mt-3 text-[10px] font-mono tracking-[0.16em] text-muted uppercase">Operations</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="ontology-chip ontology-chip-entity">Graph</span>
            <span className="ontology-chip ontology-chip-rel">Portfolio leads to holdings, then metrics</span>
          </div>
        </div>

        {visibleLinks.map((l) => {
          const active = path === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`ops-nav-link flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${active ? "ops-nav-link-active" : "text-muted hover:text-text"}`}
            >
              <span className="text-[10px] font-mono tracking-[0.12em] px-1.5 py-0.5 rounded" style={{ border: "1px solid #2b415c" }}>
                {l.icon}
              </span>
              {l.label}
            </Link>
          );
        })}

        <button
          onClick={() => setShowProfile(true)}
          className="ops-nav-link flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted hover:text-text w-full text-left mt-2"
          style={{ borderTop: "1px solid #1a2a3f", paddingTop: "12px" }}
        >
          <span className="text-[10px] font-mono tracking-[0.12em] px-1.5 py-0.5 rounded" style={{ border: "1px solid #2b415c" }}>PRF</span>
          Investor Profile
        </button>

        <button
          onClick={() => setShowFeedback(true)}
          className="ops-nav-link flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted hover:text-text w-full text-left"
        >
          <span className="text-[10px] font-mono tracking-[0.12em] px-1.5 py-0.5 rounded" style={{ border: "1px solid #2b415c" }}>FDB</span>
          Feedback
        </button>

        <a
          href="https://discord.gg/MabTm9Z4zR"
          target="_blank"
          rel="noopener noreferrer"
          className="ops-nav-link flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted hover:text-text w-full text-left"
        >
          <span className="text-[10px] font-mono tracking-[0.12em] px-1.5 py-0.5 rounded" style={{ border: "1px solid #2b415c" }}>COM</span>
          Discord
        </a>

        <button
          onClick={() => signOut({ redirectUrl: "/" })}
          className="ops-nav-link flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted hover:text-text w-full text-left"
        >
          <span className="text-[10px] font-mono tracking-[0.12em] px-1.5 py-0.5 rounded" style={{ border: "1px solid #2b415c" }}>EXT</span>
          Sign Out
        </button>

        <button
          onClick={onToggleDemoMode}
          className="ops-nav-link flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium w-full text-left"
          style={{
            color: isDemoMode ? "#7ca8ff" : "#7f93ad",
            background: isDemoMode ? "#7ca8ff14" : "transparent",
            borderColor: isDemoMode ? "#7ca8ff44" : "transparent",
          }}
        >
          <span className="text-[10px] font-mono tracking-[0.12em] px-1.5 py-0.5 rounded" style={{ border: "1px solid #2b415c" }}>
            {isDemoMode ? "ON" : "OFF"}
          </span>
          Demo Mode
        </button>

        {token && (
          <div className="mt-auto pt-4" style={{ borderTop: "1px solid #1a2a3f" }}>
            <div className="text-[9px] font-mono uppercase tracking-widest mb-1.5 text-muted">
              Access token
            </div>
            <button
              onClick={onCopyToken}
              title="Click to copy your token"
              className="w-full text-left rounded-lg px-2 py-1.5 transition-colors"
              style={{ background: "#0b1523", border: "1px solid #1f3248" }}
            >
              <div className="text-[10px] font-mono truncate text-muted">
                {token.slice(0, 18)}...
              </div>
              <div className="text-[9px] mt-0.5" style={{ color: copied ? "#4dd2ff" : "#6d8199" }}>
                {copied ? "Copied" : "Click to copy"}
              </div>
            </button>
          </div>
        )}
      </aside>

      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-stretch"
        style={{ background: "#0b1523", borderTop: "1px solid #1f3248", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {visibleLinks.map((l) => {
          const active = path === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className="flex-1 flex flex-col items-center justify-center py-2.5 gap-1 transition-all"
              style={{ color: active ? "#4dd2ff" : "#7f93ad" }}
            >
              <span className="text-[10px] leading-none font-mono">{l.icon}</span>
              <span className="text-[9px] font-mono tracking-wide">{l.label}</span>
            </Link>
          );
        })}

        <button
          onClick={() => setShowMore(true)}
          className="flex-1 flex flex-col items-center justify-center py-2.5 gap-1 transition-all"
          style={{ color: "#7f93ad" }}
        >
          <span className="text-lg leading-none">...</span>
          <span className="text-[9px] font-mono tracking-wide">More</span>
        </button>
      </nav>

      {showMore && (
        <div className="md:hidden fixed inset-0 z-50" onClick={() => setShowMore(false)}>
          <div className="absolute inset-0" style={{ background: "rgba(5,11,20,0.75)" }} />
          <div
            className="absolute bottom-0 left-0 right-0 rounded-t-2xl px-4 pt-4 pb-8 flex flex-col gap-1"
            style={{ background: "#0b1523", border: "1px solid #1f3248", borderBottom: "none" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: "#2b415c" }} />

            <button
              onClick={() => { setShowProfile(true); setShowMore(false); }}
              className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-all text-muted w-full text-left"
              style={{ background: "#0d1828" }}
            >
              Investor Profile
            </button>

            <button
              onClick={() => { setShowFeedback(true); setShowMore(false); }}
              className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-all text-muted w-full text-left"
              style={{ background: "#0d1828" }}
            >
              Feedback
            </button>

            <a
              href="https://discord.gg/MabTm9Z4zR"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-all text-muted w-full text-left"
              style={{ background: "#0d1828" }}
              onClick={() => setShowMore(false)}
            >
              Discord Community
            </a>

            <button
              onClick={() => { onToggleDemoMode(); setShowMore(false); }}
              className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-all w-full text-left"
              style={{
                background: isDemoMode ? "#7ca8ff14" : "#0d1828",
                color: isDemoMode ? "#7ca8ff" : "#7f93ad",
                border: isDemoMode ? "1px solid #7ca8ff44" : "1px solid #1f3248",
              }}
            >
              {isDemoMode ? "Disable Demo Mode" : "Enable Demo Mode"}
            </button>

            <button
              onClick={() => signOut({ redirectUrl: "/" })}
              className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-all w-full text-left mt-1"
              style={{ background: "#0d1828", color: "#ff6b8a" }}
            >
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
