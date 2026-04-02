"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { registerDemoEmail } from "@/lib/api";

export default function DemoEmailModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("loading");
    setErrorMsg("");
    try {
      await registerDemoEmail(email.trim());
      router.push("/demo");
    } catch (err: any) {
      setStatus("error");
      setErrorMsg(err?.message ?? "Something went wrong. Please try again.");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(8,0,18,0.85)", backdropFilter: "blur(8px)" }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-8"
        style={{ background: "linear-gradient(140deg,#120020,#0a0014)", border: "1px solid #2a0050", boxShadow: "0 0 40px #bf5af21c" }}
      >
        <div className="mb-6">
          <div className="text-[11px] font-mono uppercase tracking-widest mb-2" style={{ color: "#bf5af2" }}>
            Live Demo
          </div>
          <h2 className="text-xl font-bold mb-2">See Portivex in action</h2>
          <p className="text-sm leading-relaxed" style={{ color: "#8a7a9e" }}>
            Enter your email to access a live demo with a pre-loaded portfolio — no credit card, no commitment.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            className="w-full px-4 py-3 rounded-xl text-sm font-mono outline-none"
            style={{
              background: "#0b0018",
              border: "1px solid #2a0050",
              color: "#e2d9f3",
            }}
          />

          {status === "error" && (
            <p className="text-xs font-mono" style={{ color: "#ff2d78" }}>{errorMsg}</p>
          )}

          <button
            type="submit"
            disabled={status === "loading" || !email.trim()}
            className="w-full px-4 py-3 rounded-xl text-sm font-semibold disabled:opacity-50"
            style={{ background: "linear-gradient(90deg,#bf5af2,#ff2d78)", color: "#fff" }}
          >
            {status === "loading" ? "Opening demo..." : "View demo →"}
          </button>
        </form>

        <button
          onClick={onClose}
          className="mt-4 w-full text-xs font-mono text-center"
          style={{ color: "#4a3a5e" }}
        >
          No thanks
        </button>
      </div>
    </div>
  );
}
