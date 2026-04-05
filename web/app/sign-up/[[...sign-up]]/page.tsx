import { SignUp } from "@clerk/nextjs";
import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default function SignUpPage() {
  return (
    <div className="flex h-screen items-center justify-center" style={{ background: "#080012" }}>
      <SignUp fallbackRedirectUrl="/dashboard" />
    </div>
  );
}
