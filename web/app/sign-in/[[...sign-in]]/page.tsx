import { SignIn } from "@clerk/nextjs";
import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default function SignInPage() {
  return (
    <div className="flex h-screen items-center justify-center" style={{ background: "#080012" }}>
      <SignIn fallbackRedirectUrl="/dashboard" />
    </div>
  );
}
