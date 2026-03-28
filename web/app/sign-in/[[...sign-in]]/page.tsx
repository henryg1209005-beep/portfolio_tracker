import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex h-screen items-center justify-center" style={{ background: "#080012" }}>
      <SignIn />
    </div>
  );
}
