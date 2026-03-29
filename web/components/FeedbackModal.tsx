"use client";
import { useState } from "react";
import { submitFeedback } from "@/lib/api";

type Props = { onClose: () => void };

export default function FeedbackModal({ onClose }: Props) {
  const [message, setMessage] = useState("");
  const [rating, setRating]   = useState<number | null>(null);
  const [state, setState]     = useState<"idle" | "loading" | "done" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setState("loading");
    try {
      await submitFeedback(message.trim(), rating);
      setState("done");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: "#00000088", backdropFilter: "blur(4px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6 flex flex-col gap-4"
        style={{ background: "#0d0020", border: "1px solid #2a0050" }}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold" style={{ color: "#e2d9f3" }}>Share feedback</div>
            <div className="text-xs mt-0.5" style={{ color: "#4a3a5e" }}>Help us improve Portivex</div>
          </div>
          <button onClick={onClose} className="text-lg leading-none" style={{ color: "#3a2a50" }}>✕</button>
        </div>

        {state === "done" ? (
          <div className="py-6 text-center">
            <div className="text-2xl mb-2">✓</div>
            <div className="text-sm font-medium" style={{ color: "#00f5d4" }}>Thanks — we read every message.</div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Star rating */}
            <div>
              <div className="text-xs mb-2" style={{ color: "#4a3a5e" }}>How would you rate Portivex?</div>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(rating === n ? null : n)}
                    className="text-xl transition-all"
                    style={{ opacity: rating === null || rating >= n ? 1 : 0.25 }}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>

            {/* Message */}
            <textarea
              rows={4}
              placeholder="What's working well? What could be better?"
              value={message}
              onChange={e => setMessage(e.target.value)}
              disabled={state === "loading"}
              className="w-full px-4 py-3 rounded-xl text-sm resize-none focus:outline-none transition-colors disabled:opacity-50"
              style={{ background: "#080012", border: "1px solid #2a0050", color: "#e2d9f3" }}
              onFocus={e => (e.currentTarget.style.borderColor = "#bf5af2")}
              onBlur={e => (e.currentTarget.style.borderColor = "#2a0050")}
            />

            {state === "error" && (
              <p className="text-xs" style={{ color: "#ff2d78" }}>Something went wrong — try again.</p>
            )}

            <button
              type="submit"
              disabled={state === "loading" || !message.trim()}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
              style={{ background: "linear-gradient(90deg,#bf5af2,#ff2d78)", color: "#fff" }}
            >
              {state === "loading" ? "Sending…" : "Send feedback"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
