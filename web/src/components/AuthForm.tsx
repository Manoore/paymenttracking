"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { api, setAccessToken, switchWorkspace } from "@/lib/api";

type Mode = "login" | "register";

/** Sign in and Create account on one screen, switchable with tabs. */
export function AuthForm({
  initialMode,
  inviteToken,
  banner,
}: {
  initialMode: Mode;
  /** Family invite: lets the person sign up even when sign-up is closed, then joins the shared space. */
  inviteToken?: string;
  banner?: React.ReactNode;
}) {
  const params = useSearchParams();
  const [mode, setMode] = useState<Mode>(initialMode);
  // null = still checking; false = this deployment only allows existing accounts.
  const [signupOpen, setSignupOpen] = useState<boolean | null>(null);
  const [form, setForm] = useState({ email: "", password: "", name: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/session/status")
      .then((r) => r.json())
      .then((d) => setSignupOpen(Boolean(d.signupOpen)))
      .catch(() => setError("Can't reach the server. It may be waking up, so try again in a moment."));
  }, []);

  const switchTo = (m: Mode) => {
    setMode(m);
    setError(null);
    // Keep the URL shareable: /signup and /login show the matching tab.
    if (!inviteToken) window.history.replaceState(null, "", `${m === "login" ? "/login" : "/signup"}${window.location.search}`);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/session/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mode === "login" ? { email: form.email, password: form.password } : { ...form, inviteToken }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (!res?.ok) {
      setBusy(false);
      const details = data?.error?.details as { message: string }[] | undefined;
      setError(details?.[0]?.message ?? data?.error?.message ?? "Something went wrong");
      return;
    }
    setAccessToken(data.accessToken);
    if (inviteToken) {
      // New accounts join during sign-up; existing accounts accept now.
      let workspaceId = data.user?.defaultWorkspaceId as string | undefined;
      if (mode === "login") {
        const r = await api.post<{ workspaceId: string }>(`/invites/${encodeURIComponent(inviteToken)}/accept`).catch(() => null);
        workspaceId = r?.workspaceId;
      }
      switchWorkspace(workspaceId ?? null);
      return;
    }
    const next = params.get("next");
    window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  }

  const field = (k: keyof typeof form) => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value })),
  });

  const registering = mode === "register";
  const closed = registering && signupOpen === false && !inviteToken;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <a href="/welcome" className="mb-6 inline-block text-sm text-muted hover:text-text">
          ← About Capture Hub
        </a>
        {banner}
        <h1 className="text-2xl font-semibold tracking-tight">{registering ? "Create your account" : "Welcome back"}</h1>
        <p className="mb-6 mt-1 text-sm text-muted">
          {registering
            ? "Your private place for payment proof, expenses and everything worth keeping."
            : "Sign in to your Capture Hub."}
        </p>

        <div role="tablist" aria-label="Account" className="mb-4 grid grid-cols-2 rounded-lg border border-border bg-surface p-1">
          {(["login", "register"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => switchTo(m)}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                mode === m ? "bg-accent-soft text-accent" : "text-muted hover:text-text"
              }`}
            >
              {m === "login" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>

        {closed ? (
          <div className="card space-y-3 p-5 text-sm">
            <p className="font-medium">New sign-ups are closed</p>
            <p className="text-muted">This Capture Hub is private. If you already have an account, sign in instead.</p>
            <button type="button" className="btn-primary w-full" onClick={() => switchTo("login")}>
              Go to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="card space-y-4 p-5">
            {registering && (
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
                autoComplete={registering ? "new-password" : "current-password"}
                minLength={registering ? 10 : undefined}
                required
                {...field("password")}
              />
              {registering && <span className="mt-1 block text-xs text-muted">At least 10 characters.</span>}
            </label>
            {error && <p className="text-sm text-danger">{error}</p>}
            <button className="btn-primary w-full" disabled={busy}>
              {busy && <Loader2 size={16} className="animate-spin" />}
              {registering ? "Create account" : "Sign in"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
