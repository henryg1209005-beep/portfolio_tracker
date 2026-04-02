"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { trackEvent } from "@/lib/analytics";

type DemoModeCtx = {
  isDemoMode: boolean;
  setDemoMode: (enabled: boolean) => void;
  toggleDemoMode: () => void;
};

const STORAGE_KEY = "portivex_demo_mode";

const Ctx = createContext<DemoModeCtx>({
  isDemoMode: false,
  setDemoMode: () => {},
  toggleDemoMode: () => {},
});

export function DemoModeProvider({ children }: { children: React.ReactNode }) {
  const [isDemoMode, setIsDemoMode] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    setIsDemoMode(saved === "1");
  }, []);

  function setDemoMode(enabled: boolean) {
    setIsDemoMode(enabled);
    localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
    if (enabled) {
      void trackEvent("demo_mode_enabled", { enabled: true });
    }
  }

  function toggleDemoMode() {
    setDemoMode(!isDemoMode);
  }

  return (
    <Ctx.Provider value={{ isDemoMode, setDemoMode, toggleDemoMode }}>
      {children}
    </Ctx.Provider>
  );
}

export function useDemoMode() {
  return useContext(Ctx);
}
