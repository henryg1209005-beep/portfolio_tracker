"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import OnboardingModal from "@/components/OnboardingModal";
import { setToken, getToken, getProfile, type InvestorProfile } from "@/lib/api";
import { CurrencyProvider } from "@/lib/currencyContext";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { userId, isLoaded } = useAuth();
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [ready, setReady] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [profile, setProfile] = useState<Partial<InvestorProfile> | null>(null);
  const [profileError, setProfileError] = useState("");

  useEffect(() => {
    if (!isLoaded) return;
    if (!userId) { router.replace("/sign-in"); return; }
    setToken(userId);
    getProfile().then(p => {
      if (!p.exists) {
        setShowOnboarding(true);
      } else {
        setProfile(p);
      }
      setProfileError("");
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
      <div className="flex h-screen items-center justify-center" style={{ background: "#080012" }}>
        <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "#bf5af266", borderTopColor: "transparent" }} />
      </div>
    );
  }

  return (
    <CurrencyProvider>
      <div className="flex h-screen overflow-hidden font-sans">
        <Sidebar token={getToken()} copied={copied} onCopyToken={copyToken} />
        <main className="flex-1 overflow-y-auto bg-bg pb-16 md:pb-0">
          {profileError && (
            <div className="mx-auto max-w-screen-xl px-4 md:px-6 pt-4">
              <div
                className="rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-3"
                style={{ background: "#ff2d7811", border: "1px solid #ff2d7833", color: "#ff2d78" }}
              >
                <span>{profileError}</span>
                <button
                  onClick={() => window.location.reload()}
                  className="px-3 py-1.5 rounded-lg text-xs font-mono"
                  style={{ border: "1px solid #ff2d7833", color: "#ff2d78" }}
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
            onDone={() => setShowOnboarding(false)}
            initialProfile={profile}
            onSaved={(saved) => setProfile(saved)}
          />
        )}
      </div>
    </CurrencyProvider>
  );
}
