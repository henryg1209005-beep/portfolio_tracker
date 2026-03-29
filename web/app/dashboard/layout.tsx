"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import OnboardingModal from "@/components/OnboardingModal";
import { setToken, getToken, getProfile } from "@/lib/api";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { userId, isLoaded } = useAuth();
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [ready, setReady] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    if (!userId) { router.replace("/sign-in"); return; }
    setToken(userId);
    getProfile().then(p => {
      if (!p.exists) setShowOnboarding(true);
      setReady(true);
    }).catch(() => setReady(true));
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
    <div className="flex h-screen overflow-hidden font-sans">
      <Sidebar token={getToken()} copied={copied} onCopyToken={copyToken} />
      <main className="flex-1 overflow-y-auto bg-bg">
        {children}
      </main>
      {showOnboarding && <OnboardingModal onDone={() => setShowOnboarding(false)} />}
    </div>
  );
}
