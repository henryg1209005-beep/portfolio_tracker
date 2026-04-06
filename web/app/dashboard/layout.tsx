"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import OnboardingModal from "@/components/OnboardingModal";
import { setToken, getToken, getProfile, bootstrapAdmin, fetchAdminMe, type InvestorProfile } from "@/lib/api";
import { CurrencyProvider } from "@/lib/currencyContext";
import { DemoModeProvider, useDemoMode } from "@/lib/demoModeContext";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
  return (
    <CurrencyProvider>
      <DemoModeProvider userId={userId ?? "guest"}>
        <DashboardShell>{children}</DashboardShell>
      </DemoModeProvider>
    </CurrencyProvider>
  );
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { userId, isLoaded } = useAuth();
  const router = useRouter();
  const { isDemoMode, setDemoMode } = useDemoMode();
  const [copied, setCopied] = useState(false);
  const [ready, setReady] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [profile, setProfile] = useState<Partial<InvestorProfile> | null>(null);
  const [profileError, setProfileError] = useState("");
  const [isAdminUser, setIsAdminUser] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    if (!userId) { router.replace("/sign-in"); return; }
    setToken(userId);
    Promise.all([
      getProfile().catch(() => null),
      bootstrapAdmin().catch(() => null),
      fetchAdminMe().catch(() => ({ is_admin: false })),
    ]).then(([p, _boot, admin]) => {
      if (admin?.is_admin) setIsAdminUser(true);
      setProfileError("");
      if (p && p.exists) {
        setProfile(p);
      } else if (p && !p.exists) {
        setShowOnboarding(true);
      } else {
        setProfileError("Could not verify investor profile right now.");
      }
      setReady(true);
    }).catch(() => {
      setProfileError("Could not verify investor profile right now.");
      setReady(true);
    });
  }, [isLoaded, userId, router]);

  function copyToken() {
    navigator.clipboard.writeText(getToken());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: "#050b14" }}>
        <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "#4dd2ff55", borderTopColor: "transparent" }} />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden font-sans">
      <Sidebar
        token={getToken()}
        copied={copied}
        onCopyToken={copyToken}
        isDemoMode={isDemoMode}
        onToggleDemoMode={() => setDemoMode(!isDemoMode)}
        isAdminUser={isAdminUser}
      />
        <main className="flex-1 overflow-y-auto bg-bg pb-16 md:pb-0">
          <div className="mx-auto max-w-screen-xl px-4 md:px-6 pt-3">
            <div className="ops-panel rounded-lg px-3 py-2">
              <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-muted">
                PORTIVEX INTELLIGENCE CONSOLE
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className="ontology-chip ontology-chip-entity">Entity: Portfolio</span>
                <span className="ontology-chip ontology-chip-rel">Edge: exposes risk_metric</span>
                <span className="ontology-chip ontology-chip-rel">Edge: composed_of holding</span>
                <span className="ontology-id">OBJ-PORTFOLIO-PRIMARY</span>
              </div>
            </div>
          </div>
          {isDemoMode && (
            <div className="mx-auto max-w-screen-xl px-4 md:px-6 pt-4">
              <div
                className="rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-3"
                style={{ background: "#7ca8ff12", border: "1px solid #7ca8ff44", color: "#7ca8ff" }}
              >
                <span>Exploring with sample data. Exit demo when you&apos;re ready to add your real holdings.</span>
                <button
                  onClick={() => setDemoMode(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-mono"
                  style={{ border: "1px solid #7ca8ff44", color: "#7ca8ff" }}
                >
                  Add real holdings -&gt;
                </button>
              </div>
            </div>
          )}
          {profileError && (
            <div className="mx-auto max-w-screen-xl px-4 md:px-6 pt-4">
              <div
                className="rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-3"
                style={{ background: "#ff6b8a12", border: "1px solid #ff6b8a44", color: "#ff6b8a" }}
              >
                <span>{profileError}</span>
                <button
                  onClick={() => window.location.reload()}
                  className="px-3 py-1.5 rounded-lg text-xs font-mono"
                  style={{ border: "1px solid #ff6b8a44", color: "#ff6b8a" }}
                >
                  Retry
                </button>
              </div>
            </div>
          )}
          {children}
        </main>
        {showOnboarding && (
          <OnboardingModal
            onDone={() => {
              setShowOnboarding(false);
              setDemoMode(true);
            }}
            initialProfile={profile}
            onSaved={(saved) => setProfile(saved)}
          />
        )}
    </div>
  );
}
