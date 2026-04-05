"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useUser, UserButton } from "@clerk/nextjs";

export default function LandingNav() {
  const { isSignedIn, isLoaded } = useUser();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav
      className="sticky top-0 z-50"
      style={{ background: "linear-gradient(180deg,#080012ee,#080012aa)", backdropFilter: "blur(12px)", borderBottom: "1px solid #1a0030" }}
    >
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <Image src="/logo.png" alt="Portivex" width={140} height={46} className="object-contain" />
        <div className="hidden md:flex items-center gap-7">
          <a href="#position" className="text-sm transition-colors" style={{ color: "#6b5e7e" }}>Why Portivex</a>
          <a href="#how" className="text-sm transition-colors" style={{ color: "#6b5e7e" }}>How It Works</a>
          <Link href="/learn" className="text-sm transition-colors" style={{ color: "#6b5e7e" }}>Metric Library</Link>
          <a href="https://discord.gg/MabTm9Z4zR" target="_blank" rel="noopener noreferrer" className="text-sm transition-colors" style={{ color: "#bf5af2" }}>
            Discord
          </a>
        </div>
        <div className="flex items-center gap-3">
          {isLoaded && isSignedIn ? (
            <>
              <Link
                href="/dashboard"
                className="px-4 py-2 rounded-lg text-sm font-semibold"
                style={{ background: "linear-gradient(90deg,#bf5af2,#ff2d78)", color: "#fff" }}
              >
                Dashboard &rarr;
              </Link>
              <UserButton />
            </>
          ) : (
            <>
              <Link href="/sign-in" className="hidden sm:block px-4 py-2 rounded-lg text-sm font-medium" style={{ color: "#e2d9f3", border: "1px solid #2a0050" }}>
                Sign in
              </Link>
              <Link
                href="/sign-up"
                className="px-4 py-2 rounded-lg text-sm font-semibold"
                style={{ background: "linear-gradient(90deg,#bf5af2,#ff2d78)", color: "#fff" }}
              >
                Start free &rarr;
              </Link>
              <button
                className="md:hidden p-2 rounded-lg text-base leading-none"
                style={{ color: "#6b5e7e", border: "1px solid #1a0030" }}
                onClick={() => setMobileMenuOpen((m) => !m)}
                aria-label="Menu"
              >
                {mobileMenuOpen ? "x" : "="}
              </button>
            </>
          )}
        </div>
      </div>
      {mobileMenuOpen && (
        <div className="md:hidden px-6 pb-4 border-t" style={{ borderColor: "#1a0030" }}>
          <a href="#position" onClick={() => setMobileMenuOpen(false)} className="block py-3 text-sm" style={{ color: "#6b5e7e" }}>Why Portivex</a>
          <a href="#how" onClick={() => setMobileMenuOpen(false)} className="block py-3 text-sm" style={{ color: "#6b5e7e" }}>How It Works</a>
          <Link href="/learn" onClick={() => setMobileMenuOpen(false)} className="block py-3 text-sm" style={{ color: "#6b5e7e" }}>Metric Library</Link>
          <a href="https://discord.gg/MabTm9Z4zR" target="_blank" rel="noopener noreferrer" onClick={() => setMobileMenuOpen(false)} className="block py-3 text-sm" style={{ color: "#bf5af2" }}>
            Discord &rarr;
          </a>
        </div>
      )}
    </nav>
  );
}
