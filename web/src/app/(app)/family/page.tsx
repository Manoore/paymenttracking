"use client";

import { useState } from "react";
import { Copy, Loader2, LogOut, Share2, UserMinus, Users } from "lucide-react";
import { ErrorNote, Field, PageHeader, Section, Spinner } from "@/components/ui";
import { useWorkspace } from "@/components/WorkspaceContext";
import { api, ApiError, switchWorkspace } from "@/lib/api";

const ROLE_LABEL = { owner: "Owner", editor: "Can add & edit", viewer: "View only" } as const;

function CreateFamily() {
  const [name, setName] = useState("Our home");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const ws = await api.post<{ id: string }>("/workspaces", { name });
      switchWorkspace(ws.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create");
      setBusy(false);
    }
  };
  return (
    <div className="card space-y-4 p-5">
      <div className="flex gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <Users size={20} />
        </span>
        <div>
          <p className="font-semibold">Share bills and expenses with your family</p>
          <p className="mt-1 text-sm text-muted">
            Create a shared space for household bills. Everyone in it sees the same recurring bills, who paid what this
            month, and who is about to pay, so nobody pays the same bill twice. Your personal space stays private.
          </p>
        </div>
      </div>
      <Field label="Name of the shared space">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      {error && <ErrorNote message={error} />}
      <button className="btn-primary" disabled={busy || !name.trim()} onClick={() => void create()}>
        {busy && <Loader2 size={16} className="animate-spin" />} Create family space
      </button>
    </div>
  );
}

function InviteLink() {
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const make = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ url: string }>("/workspaces/current/invites", { role });
      setUrl(r.url);
      setCopied(false);
    } finally {
      setBusy(false);
    }
  };
  const share = async () => {
    if (!url) return;
    if (navigator.share) await navigator.share({ title: "Join our Capture Hub", text: "Join our shared household space:", url }).catch(() => null);
    else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    }
  };
  return (
    <div className="card space-y-3 p-4">
      <p className="text-sm text-muted">Send a one-time link to your spouse or family member. It works for 7 days and for one person.</p>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="They can">
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as "editor" | "viewer")}>
            <option value="editor">Add & edit (recommended for a spouse)</option>
            <option value="viewer">View only</option>
          </select>
        </Field>
        <button className="btn-primary" disabled={busy} onClick={() => void make()}>
          {busy && <Loader2 size={16} className="animate-spin" />} Create invite link
        </button>
      </div>
      {url && (
        <div className="flex flex-wrap gap-2">
          <input className="input min-w-0 flex-1 font-mono text-xs" readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Invite link" />
          <button
            className="btn-secondary"
            onClick={() => {
              void navigator.clipboard.writeText(url).then(() => setCopied(true));
            }}
          >
            <Copy size={16} /> {copied ? "Copied" : "Copy"}
          </button>
          <button className="btn-secondary" onClick={() => void share()}>
            <Share2 size={16} /> Share
          </button>
        </div>
      )}
    </div>
  );
}

export default function FamilyPage() {
  const { workspace, members, user, isFamily, reload, loading } = useWorkspace();
  const [busy, setBusy] = useState<string | null>(null);
  const isOwner = workspace?.role === "owner";
  const familySpaces = user?.workspaces.filter((w) => w.kind === "family") ?? [];

  const setRole = async (userId: string, role: string) => {
    setBusy(userId);
    await api.patch(`/workspaces/current/members/${userId}`, { role }).finally(() => setBusy(null));
    reload();
  };
  const remove = async (userId: string, name: string) => {
    if (!confirm(`Remove ${name} from ${workspace?.name}? They keep their own personal space.`)) return;
    setBusy(userId);
    await api.del(`/workspaces/current/members/${userId}`).finally(() => setBusy(null));
    reload();
  };
  const leave = async () => {
    if (!confirm(`Leave ${workspace?.name}? You will lose access to its shared records.`)) return;
    await api.del("/workspaces/current/members/me");
    switchWorkspace(null);
  };

  if (loading) return <Spinner />;
  return (
    <>
      <PageHeader title="Family & sharing" subtitle="Share household bills and expenses without paying twice." />

      {!isFamily && (
        <>
          {familySpaces.length > 0 && (
            <Section title="Your shared spaces">
              <div className="card divide-y divide-border">
                {familySpaces.map((w) => (
                  <button key={w.id} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-surface-2" onClick={() => switchWorkspace(w.id)}>
                    <span className="font-medium">👪 {w.name}</span>
                    <span className="text-sm text-accent">Switch →</span>
                  </button>
                ))}
              </div>
            </Section>
          )}
          <Section title={familySpaces.length ? "Create another" : "Get started"}>
            <CreateFamily />
          </Section>
          <p className="text-sm text-muted">You are in your personal space right now. Items here are only visible to you.</p>
        </>
      )}

      {isFamily && (
        <>
          <Section title={`Members of ${workspace?.name}`}>
            <div className="card divide-y divide-border">
              {members.map((m) => (
                <div key={m.userId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent">
                    {m.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {m.name} {m.userId === user?.id && <span className="text-sm text-muted">(you)</span>}
                    </p>
                    <p className="truncate text-sm text-muted">{m.email}</p>
                  </div>
                  {isOwner && m.role !== "owner" ? (
                    <>
                      <select
                        className="input min-h-9 w-40 py-1 text-sm"
                        value={m.role}
                        disabled={busy === m.userId}
                        onChange={(e) => void setRole(m.userId, e.target.value)}
                      >
                        <option value="editor">{ROLE_LABEL.editor}</option>
                        <option value="viewer">{ROLE_LABEL.viewer}</option>
                      </select>
                      <button
                        className="btn-ghost min-h-9 px-2 text-danger"
                        aria-label={`Remove ${m.name}`}
                        disabled={busy === m.userId}
                        onClick={() => void remove(m.userId, m.name)}
                      >
                        <UserMinus size={16} />
                      </button>
                    </>
                  ) : (
                    <span className="chip bg-surface-2 text-muted">{ROLE_LABEL[m.role]}</span>
                  )}
                </div>
              ))}
            </div>
          </Section>

          {isOwner && (
            <Section title="Invite someone">
              <InviteLink />
            </Section>
          )}

          <Section title="How sharing works">
            <ul className="card list-disc space-y-2 p-4 pl-8 text-sm text-muted">
              <li>Everything added while this space is selected is visible to all members, unless you tick “Only me”.</li>
              <li>Each payment shows who paid it. Tap “I’m paying this” on a bill so others know you’re handling it.</li>
              <li>Household shows this month’s bills (paid, being paid, due) and how much each of you paid.</li>
              <li>Switch spaces from the menu. Your personal space is never shared.</li>
            </ul>
          </Section>

          {!isOwner && (
            <button className="btn-danger" onClick={() => void leave()}>
              <LogOut size={16} /> Leave {workspace?.name}
            </button>
          )}
        </>
      )}
    </>
  );
}
