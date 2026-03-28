"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { ensureToken, getToken } from "@/lib/api";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState("");
  const [copied, setCopied] = useState(false);
  const [ready, setReady]   = useState(false);

  useEffect(() => {
    ensureToken().then(t => {
      setToken(t);
      setReady(true);
    });
  }, []);

  function copyToken() {
    navigator.clipboard.writeText(token);
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
      <Sidebar token={token} copied={copied} onCopyToken={copyToken} />
      <main className="flex-1 overflow-y-auto bg-bg">
        {children}
      </main>
    </div>
  );
}
