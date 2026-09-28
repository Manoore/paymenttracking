import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";

export const metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <Suspense>
      <AuthForm initialMode="register" />
    </Suspense>
  );
}
