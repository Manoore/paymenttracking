"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { setAccessToken } from "@/lib/api";

function LoginForm() {
  const params = useSearchParams();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [signupOpen, setSignupOpen] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", name: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/session/status")
      .then((r) => r.json())
      .then((d) => setSignupOpen(Boolean(d.signupOpen)))
      .catch(() => setError("Can't reach the server. Check that the API is running."));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/session/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mode === "login" ? { email: form.email, password: form.password } : form),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (!res?.ok) {
      setBusy(false);
      const details = data?.error?.details as { message: string }[] | undefined;
      setError(details?.[0]?.message ?? data?.error?.message ?? "Something went wrong");
      return;
    }
    setAccessToken(data.accessToken);
    const next = params.get("next");
    window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  }

  const field = (k: keyof typeof form) => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value })),
  });

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <a href="/welcome" className="mb-6 inline-block text-sm text-muted hover:text-text">
          ← About Capture Hub
        </a>
        <h1 className="text-2xl font-semibold tracking-tight">Capture Hub</h1>
        <p className="mb-6 mt-1 text-sm text-muted">Your private place for payment proof, expenses and everything worth keeping.</p>
        <form onSubmit={(e) => void submit(e)} className="card space-y-4 p-5">
          {mode === "register" && (
            <label className="block">
              <span className="label">Name</span>
              <input className="input" autoComplete="name" required {...field("name")} />
            </label>
          )}
          <label className="block">
            <span className="label">Email</span>
            <input className="input" type="email" autoComplete="email" required {...field("email")} />
          </label>
          <label className="block">
            <span className="label">Password</span>
            <input
              className="input"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={mode === "register" ? 10 : undefined}
              required
              {...field("password")}
            />
          </label>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button className="btn-primary w-full" disabled={busy}>
            {busy && <Loader2 size={16} className="animate-spin" />}
            {mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
        {signupOpen && (
          <button
            className="btn-ghost mt-3 w-full"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError(null);
            }}
          >
            {mode === "login" ? "First time here? Create your account" : "Have an account? Sign in"}
          </button>
        )}
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
