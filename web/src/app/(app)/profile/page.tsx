"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, BellOff, CheckCircle2, Loader2, LogOut } from "lucide-react";
import { disablePush, enablePush, pushState, type PushState } from "@/lib/push";
import { ErrorNote, Field, PageHeader, Section, Spinner } from "@/components/ui";
import { api, ApiError, changePassword, logout } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { User } from "@/lib/types";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";

const CURRENCIES = ["USD", "INR", "EUR", "GBP", "CAD", "AUD", "SGD", "AED", "JPY"];

function timezones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("timeZone");
  } catch {
    return ["America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York", "Asia/Kolkata", "Europe/London", "UTC"];
  }
}

function Saved({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="inline-flex items-center gap-1 text-sm text-ok">
      <CheckCircle2 size={16} /> Saved
    </span>
  );
}

function ProfileForm({ user, onSaved }: { user: User; onSaved: (u: User) => void }) {
  const ws = user.workspaces.find((w) => w.id === user.defaultWorkspaceId) ?? user.workspaces[0];
  const [f, setF] = useState({
    name: user.name,
    phone: user.phone ?? "",
    timezone: user.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    emailReminders: user.preferences.emailReminders,
    weeklyDigest: user.preferences.weeklyDigest ?? true,
    reminderEmail: user.preferences.reminderEmail ?? "",
    workspaceName: ws?.name ?? "",
    defaultCurrency: ws?.defaultCurrency ?? "USD",
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOwner = ws?.role === "owner";

  const bind = (k: "name" | "phone" | "timezone" | "reminderEmail" | "workspaceName" | "defaultCurrency") => ({
    value: f[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setSaved(false);
      setF((p) => ({ ...p, [k]: e.target.value }));
    },
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user: updated } = await api.patch<{ user: User }>("/auth/me", {
        name: f.name,
        phone: f.phone.trim() || null,
        timezone: f.timezone,
        preferences: { emailReminders: f.emailReminders, reminderEmail: f.reminderEmail.trim() || null, weeklyDigest: f.weeklyDigest },
        ...(isOwner ? { workspace: { name: f.workspaceName, defaultCurrency: f.defaultCurrency } } : {}),
      });
      onSaved(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? ((err.details as { message: string }[] | undefined)?.[0]?.message ?? err.message) : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)}>
      <Section title="Your info">
        <div className="card grid gap-4 p-4 sm:grid-cols-2">
          <Field label="Name">
            <input className="input" autoComplete="name" required {...bind("name")} />
          </Field>
          <Field label="Email" hint="Your sign-in email.">
            <input className="input opacity-70" value={user.email} readOnly />
          </Field>
          <Field label="Phone" hint="Optional.">
            <input className="input" type="tel" autoComplete="tel" placeholder="+1 408 555 0100" {...bind("phone")} />
          </Field>
          <Field label="Time zone" hint="Your local time zone.">
            <select className="input" {...bind("timezone")}>
              {timezones().map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Reminders">
        <div className="card space-y-4 p-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-0.5 h-5 w-5"
              checked={f.emailReminders}
              onChange={(e) => {
                setSaved(false);
                setF((p) => ({ ...p, emailReminders: e.target.checked }));
              }}
            />
            <span>
              <span className="block font-medium">Email me when bills are due or overdue</span>
              <span className="text-sm text-muted">In-app reminders always appear on your dashboard.</span>
            </span>
          </label>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-0.5 h-5 w-5"
              checked={f.weeklyDigest}
              onChange={(e) => {
                setSaved(false);
                setF((p) => ({ ...p, weeklyDigest: e.target.checked }));
              }}
            />
            <span>
              <span className="block font-medium">Weekly summary email</span>
              <span className="text-sm text-muted">Bills due this week, money owed to you and upcoming deadlines, once a week.</span>
            </span>
          </label>
          {f.emailReminders && (
            <Field label="Send reminders to" hint={`Leave blank to use ${user.email}`}>
              <input className="input" type="email" placeholder={user.email} {...bind("reminderEmail")} />
            </Field>
          )}
        </div>
      </Section>

      {ws && (
        <Section title="Workspace">
          <div className="card grid gap-4 p-4 sm:grid-cols-2">
            <Field label="Workspace name">
              <input className="input" disabled={!isOwner} {...bind("workspaceName")} />
            </Field>
            <Field label="Default currency" hint="Pre-filled on new records. Each record keeps its own currency.">
              <select className="input" disabled={!isOwner} {...bind("defaultCurrency")}>
                {[...new Set([f.defaultCurrency, ...CURRENCIES])].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <p className="text-sm text-muted sm:col-span-2">
              {ws.kind === "personal" ? "Personal workspace. Only you can see it." : "Shared family workspace."} Member since{" "}
              {formatDate(user.createdAt)}.
            </p>
          </div>
        </Section>
      )}

      {error && (
        <div className="mb-4">
          <ErrorNote message={error} />
        </div>
      )}
      <div className="mb-8 flex items-center gap-3">
        <button className="btn-primary" disabled={busy}>
          {busy && <Loader2 size={16} className="animate-spin" />} Save profile
        </button>
        <Saved show={saved} />
      </div>
    </form>
  );
}

/** Browser push on this device (phone or computer). */
function PushSettings() {
  const [state, setState] = useState<PushState | "loading">("loading");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    pushState()
      .then(setState)
      .catch(() => setState("unsupported"));
  }, []);

  const run = async (fn: () => Promise<unknown>, after: PushState, note?: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setState(after);
      if (note) setMsg(note);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const text: Record<PushState | "loading", string> = {
    loading: "Checking this device…",
    unsupported: "This browser can't receive notifications. On iPhone, first add Capture Hub to your Home Screen (Share → Add to Home Screen), then open it from there.",
    "not-configured": "Notifications aren't set up on the server yet (VAPID keys missing).",
    denied: "Notifications are blocked for this site. Allow them in your browser's site settings, then reload.",
    off: "Get bill reminders and deadlines as notifications on this device.",
    on: "On for this device.",
  };

  return (
    <Section title="Notifications">
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="font-medium">Push notifications</p>
          <p className="text-sm text-muted">{text[state]}</p>
          {msg && <p className="mt-1 text-sm text-accent">{msg}</p>}
        </div>
        {state === "off" && (
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void run(enablePush, "on", "Enabled. Try “Send test”.")}>
            <Bell size={16} /> Turn on
          </button>
        )}
        {state === "on" && (
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-secondary"
              disabled={busy}
              onClick={() => void run(() => api.post("/push/test"), "on", "Test sent. It should appear in a few seconds.")}
            >
              Send test
            </button>
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => void run(disablePush, "off")}>
              <BellOff size={16} /> Turn off
            </button>
          </div>
        )}
      </div>
    </Section>
  );
}

/** Private calendar subscription URL for bills, expiries and deadlines. */
function CalendarFeed() {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = async (rotate = false) => {
    if (rotate && !confirm("Create a new link? The old link stops working in any calendar that uses it.")) return;
    setBusy(true);
    try {
      const r = await api.post<{ url: string }>(`/calendar/feed${rotate ? "?rotate=1" : ""}`);
      setUrl(r.url);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Calendar">
      <div className="card space-y-3 p-4">
        <p className="text-sm text-muted">
          Add bill due dates, document expiries, return deadlines and warranty end dates to Google, Apple or Outlook Calendar.
          The link is private: anyone who has it can see these dates, so don&apos;t share it.
        </p>
        {url ? (
          <>
            <div className="flex gap-2">
              <input className="input font-mono text-xs" readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Calendar link" />
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  void navigator.clipboard.writeText(url).then(() => setCopied(true));
                }}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
              <li>Google Calendar: Other calendars → + → From URL → paste.</li>
              <li>iPhone: Settings → Calendar → Accounts → Add Subscribed Calendar → paste.</li>
              <li>Outlook: Add calendar → Subscribe from web → paste.</li>
            </ul>
            <button type="button" className="btn-ghost text-sm" disabled={busy} onClick={() => void load(true)}>
              Reset link
            </button>
          </>
        ) : (
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => void load()}>
            {busy && <Loader2 size={16} className="animate-spin" />} Get my calendar link
          </button>
        )}
      </div>
    </Section>
  );
}

function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (next !== confirm) return setError("New passwords don't match");
    if (next.length < 10) return setError("Use at least 10 characters");
    setBusy(true);
    try {
      await changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Password & security">
      <form onSubmit={(e) => void submit(e)} className="card grid gap-4 p-4 sm:grid-cols-3">
        <Field label="Current password">
          <input className="input" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="New password">
          <input className="input" type="password" autoComplete="new-password" required minLength={10} value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="Confirm new password">
          <input className="input" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
          <button className="btn-secondary" disabled={busy}>
            {busy && <Loader2 size={16} className="animate-spin" />} Change password
          </button>
          {done && (
            <span className="inline-flex items-center gap-1 text-sm text-ok">
              <CheckCircle2 size={16} /> Password changed. Other devices were signed out.
            </span>
          )}
          {error && <span className="text-sm text-danger">{error}</span>}
        </div>
      </form>
    </Section>
  );
}

export default function ProfilePage() {
  const { data, error, loading, setData } = useApi<{ user: User }>("/auth/me");

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorNote message={error} />;
  if (!data) return null;

  return (
    <>
      <PageHeader
        title="Profile"
        subtitle="Your details, reminder preferences and security."
        actions={
          <button className="btn-ghost" onClick={() => void logout()}>
            <LogOut size={16} /> Sign out
          </button>
        }
      />
      <Section title="Family & sharing">
        <Link href="/family" className="card flex items-center justify-between gap-3 p-4 hover:border-accent">
          <div>
            <p className="font-medium">Share bills with your family</p>
            <p className="text-sm text-muted">Shared space, invites, who paid what.</p>
          </div>
          <span className="text-sm text-accent">Open →</span>
        </Link>
      </Section>
      <Section title="Appearance">
        <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="font-medium">Color theme</p>
            <p className="text-sm text-muted">System follows your device&apos;s light/dark setting. Saved on this device.</p>
          </div>
          <ThemeSwitcher />
        </div>
      </Section>
      <ProfileForm user={data.user} onSaved={(u) => setData({ user: u })} />
      <PushSettings />
      <CalendarFeed />
      <PasswordForm />
    </>
  );
}
