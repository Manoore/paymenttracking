"use client";

import { Suspense, use, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Users } from "lucide-react";
import { AuthForm } from "@/components/AuthForm";
import { api, switchWorkspace } from "@/lib/api";

const API = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

interface InviteInfo {
  workspaceName: string;
  invitedBy: string;
  role: "editor" | "viewer";
}

function InviteInner({ token }: { token: string }) {
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/v1/invites/${encodeURIComponent(token)}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d?.error?.message ?? "Invite not found");
        setInfo(d);
      })
      .catch((e: Error) => setError(e.message));
    // Signed in if the session cookie can mint an access token.
    fetch("/api/session/token", { method: "POST" })
      .then((r) => setSignedIn(r.ok))
      .catch(() => setSignedIn(false));
  }, [token]);

  const accept = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ workspaceId: string }>(`/invites/${encodeURIComponent(token)}/accept`);
      switchWorkspace(r.workspaceId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not join");
      setBusy(false);
    }
  };

  if (error)
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <div className="card max-w-sm p-6 text-center">
          <p className="font-semibold">This invite cannot be used</p>
          <p className="mt-2 text-sm text-muted">{error}. Ask the person who invited you for a new link.</p>
          <Link href="/" className="btn-secondary mt-4">
            Go to Capture Hub
          </Link>
        </div>
      </main>
    );
  if (!info || signedIn === null)
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <Loader2 className="animate-spin text-muted" />
      </main>
    );

  const banner = (
    <div className="card mb-4 flex gap-3 p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
        <Users size={20} />
      </span>
      <div className="text-sm">
        <p className="font-semibold">
          {info.invitedBy} invited you to “{info.workspaceName}”
        </p>
        <p className="text-muted">
          A shared space for household bills and expenses. You will be able to {info.role === "viewer" ? "view" : "add and view"} shared
          records; your own personal space stays private.
        </p>
      </div>
    </div>
  );

  if (signedIn)
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <div className="w-full max-w-sm">
          {banner}
          <button className="btn-primary w-full" disabled={busy} onClick={() => void accept()}>
            {busy && <Loader2 size={16} className="animate-spin" />} Join {info.workspaceName}
          </button>
        </div>
      </main>
    );

  return <AuthForm initialMode="register" inviteToken={token} banner={banner} />;
}

export default function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = use(params);
  return (
    <Suspense>
      <InviteInner token={token} />
    </Suspense>
  );
}
