"use client";

import Link from "next/link";
import { AlertTriangle, CalendarClock, Camera, CheckCircle2, Circle, FileBadge, Inbox, MapPin, PackageOpen, Repeat, ShieldCheck } from "lucide-react";
import { useWorkspace } from "@/components/WorkspaceContext";
import { CaptureList, Empty, ErrorNote, Section, Spinner } from "@/components/ui";
import { daysUntil, formatDate, formatMoney, frequencyLabel, relativeDue } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { Dashboard, Schedule } from "@/lib/types";

function ScheduleRow({ s }: { s: Schedule }) {
  const overdue = daysUntil(s.nextDueDate) < 0;
  return (
    <Link href={`/recurring/${s._id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          overdue ? "bg-danger-soft text-danger" : "bg-accent-soft text-accent"
        }`}
      >
        {overdue ? <AlertTriangle size={18} /> : <CalendarClock size={18} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{s.title}</p>
        <p className={`text-sm ${overdue ? "text-danger" : "text-muted"}`}>
          {relativeDue(s.nextDueDate)} · {formatDate(s.nextDueDate)} · {frequencyLabel(s.frequency)}
        </p>
      </div>
      {s.amountMinor != null && <span className="font-medium tabular-nums">{formatMoney(s.amountMinor, s.currency)}</span>}
    </Link>
  );
}

const EXPIRING = {
  expires: { icon: FileBadge, verb: "Expires" },
  return: { icon: PackageOpen, verb: "Return by" },
  warranty: { icon: ShieldCheck, verb: "Warranty ends" },
} as const;

/** Getting-started checklist; disappears once the basics are done. */
function SetupChecklist({ setup }: { setup: Dashboard["setup"] }) {
  const steps = [
    { done: setup.captures > 0, label: "Save your first payment or receipt", href: "/new" },
    { done: setup.withProof > 0, label: "Attach a screenshot or photo as proof", href: "/new" },
    { done: setup.schedules > 0, label: "Add a recurring bill (HOA, insurance, utilities)", href: "/recurring/new" },
    { done: false, label: "Fill in your profile and choose a theme", href: "/profile", optional: true },
  ];
  const required = steps.filter((st) => !st.optional);
  const doneCount = required.filter((st) => st.done).length;
  if (doneCount === required.length) return null;
  return (
    <div className="card mb-6 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Get set up in 2 minutes</h2>
        <span className="text-sm text-muted">
          {doneCount}/{required.length} done
        </span>
      </div>
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent" style={{ width: `${(doneCount / required.length) * 100}%` }} />
      </div>
      <ul className="space-y-1">
        {steps.map((st) => (
          <li key={st.label}>
            <Link href={st.href} className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-surface-2">
              {st.done ? <CheckCircle2 size={18} className="text-ok" /> : <Circle size={18} className="text-muted" />}
              <span className={st.done ? "text-muted line-through" : ""}>{st.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** Colourful welcome panel: greeting, three numbers that matter, and quick actions. */
function Hero({ data }: { data: Dashboard }) {
  const { user, workspace, isFamily } = useWorkspace();
  const week = data.upcoming.filter((s) => daysUntil(s.nextDueDate) <= 7);
  const dueCount = data.overdue.length + week.length;
  const owedByCurrency = new Map<string, number>();
  for (const g of data.reimbursementsOwed) owedByCurrency.set(g.currency, (owedByCurrency.get(g.currency) ?? 0) + g.outstandingMinor);
  const owed = [...owedByCurrency.entries()].map(([c, m]) => formatMoney(m, c)).join(" + ") || formatMoney(0, workspace?.defaultCurrency ?? "USD");
  const stats = [
    { label: data.overdue.length ? `Due · ${data.overdue.length} overdue` : "Due this week", value: String(dueCount), href: "/recurring" },
    { label: "Owed to you", value: owed, href: "/reimbursements" },
    { label: "In your inbox", value: String(data.inboxCount), href: "/inbox" },
  ];
  const actions = [
    { href: "/new?type=expense", label: "Snap a receipt", icon: Camera },
    { href: "/recurring/new", label: "Add a bill", icon: Repeat },
    { href: "/new?type=place", label: "Save a place", icon: MapPin },
  ];
  return (
    <div className="bg-hero relative mb-8 overflow-hidden rounded-3xl p-5 shadow-lg md:p-7">
      {/* soft decorative circles */}
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10" />
      <div className="pointer-events-none absolute -bottom-24 right-24 h-48 w-48 rounded-full bg-white/10" />
      <p className="relative text-sm opacity-80">{isFamily ? `👪 ${workspace?.name}` : new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date())}</p>
      <h1 className="relative mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
        {greeting()}
        {user?.name ? `, ${user.name.split(" ")[0]}` : ""} 👋
      </h1>
      <div className="relative mt-5 grid grid-cols-3 gap-2 md:gap-3">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="rounded-2xl bg-white/15 p-3 backdrop-blur-sm transition hover:bg-white/25 md:p-4">
            <p className="truncate text-lg font-semibold tabular-nums md:text-2xl">{s.value}</p>
            <p className="truncate text-xs opacity-85 md:text-sm">{s.label}</p>
          </Link>
        ))}
      </div>
      <div className="relative mt-4 flex flex-wrap gap-2">
        {actions.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-sm font-medium text-[#141726] shadow-sm hover:bg-white">
            <Icon size={15} /> {label}
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data, error, loading } = useApi<Dashboard>("/dashboard");

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorNote message={error} />;
  if (!data) return null;

  const dueItems = [...data.overdue, ...data.upcoming];

  return (
    <>
      <Hero data={data} />

      <SetupChecklist setup={data.setup} />

      {data.inboxCount > 0 && (
        <Link href="/inbox" className="card mb-6 flex items-center gap-3 border-warn/40 bg-warn-soft px-4 py-3 text-warn">
          <Inbox size={18} />
          <span className="flex-1 text-sm font-medium">
            {data.inboxCount} item{data.inboxCount === 1 ? "" : "s"} in your inbox waiting to be filed
          </span>
          <span className="text-sm">Review →</span>
        </Link>
      )}

      <Section title="Bills due" action={<Link href="/recurring" className="text-sm text-accent">All recurring</Link>}>
        {dueItems.length ? (
          <div className="card divide-y divide-border overflow-hidden">
            {dueItems.map((s) => (
              <ScheduleRow key={s._id} s={s} />
            ))}
          </div>
        ) : (
          <Empty
            title="Nothing due in the next two weeks"
            body="Add recurring bills like HOA dues or insurance to get reminders."
            action={<Link href="/recurring/new" className="btn-secondary">Add recurring payment</Link>}
          />
        )}
      </Section>

      {data.expiring.length > 0 && (
        <Section title="Coming up">
          <div className="card divide-y divide-border overflow-hidden">
            {data.expiring.map((e) => {
              const { icon: Icon, verb } = EXPIRING[e.kind];
              const d = daysUntil(e.date);
              const urgent = d <= 7;
              return (
                <Link key={e.kind + e.id} href={`/captures/${e.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${urgent ? "bg-warn-soft text-warn" : "bg-surface-2 text-muted"}`}
                  >
                    <Icon size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{e.title}</p>
                    <p className={`text-sm ${d < 0 ? "text-danger" : urgent ? "text-warn" : "text-muted"}`}>
                      {verb} {formatDate(e.date)} · {d < 0 ? `${-d} days ago` : d === 0 ? "today" : `in ${d} days`}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </Section>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Section title="Owed to you">
          {data.reimbursementsOwed.length ? (
            <div className="card divide-y divide-border">
              {data.reimbursementsOwed.map((g) => (
                <Link
                  key={g.organization + g.currency}
                  href={`/reimbursements`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-surface-2"
                >
                  <div>
                    <p className="font-medium">{g.organization}</p>
                    <p className="text-sm text-muted">
                      {g.count} expense{g.count === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span className="font-medium tabular-nums">{formatMoney(g.outstandingMinor, g.currency)}</span>
                </Link>
              ))}
            </div>
          ) : (
            <Empty title="No reimbursements pending" />
          )}
        </Section>

        <Section title="Deposits not cleared">
          {data.unclearedDeposits.length ? (
            <CaptureList items={data.unclearedDeposits} />
          ) : (
            <Empty title="All deposits cleared" />
          )}
        </Section>
      </div>

      <Section title="Recently saved" action={<Link href="/activity" className="text-sm text-accent">See all</Link>}>
        {data.recent.length ? (
          <CaptureList items={data.recent} />
        ) : (
          <Empty
            title="Nothing saved yet"
            body="Snap a receipt or upload a payment screenshot to get started."
            action={<Link href="/new" className="btn-primary">New capture</Link>}
          />
        )}
      </Section>
    </>
  );
}
