import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex h-screen items-center justify-center" style={{ background: "#080012" }}>
      <SignUp fallbackRedirectUrl="/dashboard" />
    </div>
  );
}
