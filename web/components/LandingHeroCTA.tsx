"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { captureLandingAttribution } from "@/lib/growthAttribution";
import DemoEmailModal from "@/components/DemoEmailModal";

export default function LandingHeroCTA() {
  const [showDemoModal, setShowDemoModal] = useState(false);

  useEffect(() => {
    captureLandingAttribution();
  }, []);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/sign-up"
          className="px-7 py-3 rounded-xl text-sm font-semibold hover-lift"
          style={{ background: "linear-gradient(90deg,#bf5af2,#ff2d78)", color: "#fff", boxShadow: "0 0 24px #bf5af244" }}
        >
          Launch free &rarr;
        </Link>
        <button
          onClick={() => setShowDemoModal(true)}
          className="px-7 py-3 rounded-xl text-sm font-semibold hover-lift"
          style={{ border: "1px solid #2a0050", color: "#e2d9f3" }}
        >
          Try demo
        </button>
      </div>
      {showDemoModal && <DemoEmailModal onClose={() => setShowDemoModal(false)} />}
    </>
  );
}
