"use client";

import Link from "next/link";
import { AlertTriangle, CalendarClock, CheckCircle2, Circle, FileBadge, Inbox, PackageOpen, ShieldCheck } from "lucide-react";
import { CaptureList, Empty, ErrorNote, PageHeader, Section, Spinner } from "@/components/ui";
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

export default function DashboardPage() {
  const { data, error, loading } = useApi<Dashboard>("/dashboard");

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorNote message={error} />;
  if (!data) return null;

  const dueItems = [...data.overdue, ...data.upcoming];

  return (
    <>
      <PageHeader title="Home" subtitle="What needs attention, and what you saved recently." />

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
