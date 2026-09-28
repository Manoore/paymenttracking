"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronLeft, ChevronRight, CircleDashed, Hand } from "lucide-react";
import { Empty, ErrorNote, PageHeader, Section, Spinner } from "@/components/ui";
import { useWorkspace } from "@/components/WorkspaceContext";
import { api } from "@/lib/api";
import { formatDate, formatMoney, relativeDue } from "@/lib/format";
import { useApi } from "@/lib/hooks";

interface Bill {
  scheduleId: string;
  title: string;
  amountMinor?: number;
  currency: string;
  status: "paid" | "claimed" | "due";
  paidByName?: string;
  paidAt?: string;
  captureId?: string;
  dueDate?: string;
  claimedBy?: string;
  claimedByName?: string;
}
interface Household {
  month: string;
  members: { userId: string; name: string }[];
  bills: Bill[];
  paidByMember: { userId: string; name: string; currency: string; totalMinor: number; count: number }[];
  items: { _id: string; title: string; amountMinor?: number; currency: string; occurredAt?: string; paidByName: string; category?: string }[];
}

function shiftMonth(m: string, delta: number) {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export default function HouseholdPage() {
  const { isFamily, user, canWrite, loading: wsLoading } = useWorkspace();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const { data, error, loading, reload } = useApi<Household>(isFamily ? "/household" : null, { month });
  const [busy, setBusy] = useState<string | null>(null);

  if (wsLoading) return <Spinner />;
  if (!isFamily)
    return (
      <>
        <PageHeader title="Household" />
        <Empty
          title="Household is for shared family spaces"
          body="Create or switch to a family space to see who paid which bills this month."
          action={
            <Link href="/family" className="btn-primary">
              Family & sharing
            </Link>
          }
        />
      </>
    );

  const claim = async (b: Bill, release = false) => {
    setBusy(b.scheduleId);
    try {
      if (release) await api.del(`/recurring/${b.scheduleId}/claim`);
      else await api.post(`/recurring/${b.scheduleId}/claim`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not update");
    } finally {
      setBusy(null);
      void reload();
    }
  };

  const monthLabel = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
  const currencies = [...new Set(data?.paidByMember.map((p) => p.currency))];
  const paidCount = data?.bills.filter((b) => b.status === "paid").length ?? 0;

  return (
    <>
      <PageHeader
        title="Household"
        subtitle="Who paid what this month, so nobody pays the same bill twice."
        actions={
          <div className="flex items-center gap-1">
            <button className="btn-ghost px-2" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>
              <ChevronLeft size={18} />
            </button>
            <span className="min-w-36 text-center font-medium">{monthLabel}</span>
            <button className="btn-ghost px-2" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}>
              <ChevronRight size={18} />
            </button>
          </div>
        }
      />
      {error && <ErrorNote message={error} />}
      {loading && !data ? (
        <Spinner />
      ) : data ? (
        <>
          <Section title={`Shared bills · ${paidCount}/${data.bills.length} paid`}>
            {data.bills.length ? (
              <div className="card divide-y divide-border overflow-hidden">
                {data.bills.map((b) => {
                  const mine = b.claimedBy === user?.id;
                  return (
                    <div key={b.scheduleId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      {b.status === "paid" ? (
                        <CheckCircle2 size={22} className="shrink-0 text-ok" />
                      ) : b.status === "claimed" ? (
                        <Hand size={22} className="shrink-0 text-accent" />
                      ) : (
                        <CircleDashed size={22} className="shrink-0 text-warn" />
                      )}
                      <Link href={b.captureId ? `/captures/${b.captureId}` : `/recurring/${b.scheduleId}`} className="min-w-0 flex-1">
                        <p className="truncate font-medium">{b.title}</p>
                        <p className="text-sm text-muted">
                          {b.status === "paid" && `Paid by ${b.paidByName} · ${formatDate(b.paidAt)}`}
                          {b.status === "claimed" && `${mine ? "You are" : `${b.claimedByName} is`} paying this · ${relativeDue(b.dueDate!)}`}
                          {b.status === "due" && `Nobody has paid yet · ${relativeDue(b.dueDate!)}`}
                        </p>
                      </Link>
                      <span className="tabular-nums">{formatMoney(b.amountMinor, b.currency)}</span>
                      {canWrite && b.status !== "paid" && (
                        <div className="flex w-full gap-2 sm:w-auto">
                          {b.status === "due" && (
                            <button className="btn-secondary min-h-9 py-1.5" disabled={busy === b.scheduleId} onClick={() => void claim(b)}>
                              <Hand size={14} /> I&apos;m paying this
                            </button>
                          )}
                          {b.status === "claimed" && mine && (
                            <button className="btn-ghost min-h-9 py-1.5" disabled={busy === b.scheduleId} onClick={() => void claim(b, true)}>
                              Release
                            </button>
                          )}
                          <Link href={`/recurring/${b.scheduleId}?pay=1`} className="btn-primary min-h-9 py-1.5">
                            Mark paid
                          </Link>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <Empty
                title="No shared bills this month"
                body="Add recurring bills while this family space is selected and they appear here for everyone."
                action={
                  <Link href="/recurring/new" className="btn-secondary">
                    Add recurring bill
                  </Link>
                }
              />
            )}
          </Section>

          <Section title="Paid by each person">
            {data.paidByMember.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {currencies.map((cur) => {
                  const rows = data.paidByMember.filter((p) => p.currency === cur);
                  const total = rows.reduce((n, r) => n + r.totalMinor, 0);
                  const fair = Math.round(total / Math.max(1, data.members.length));
                  return rows.map((r) => (
                    <div key={r.userId + cur} className="card p-4">
                      <p className="text-sm text-muted">{r.name}</p>
                      <p className="text-2xl font-semibold tabular-nums">{formatMoney(r.totalMinor, cur)}</p>
                      <p className="text-xs text-muted">
                        {r.count} payment{r.count === 1 ? "" : "s"}
                        {data.members.length > 1 && ` · even split would be ${formatMoney(fair, cur)}`}
                      </p>
                    </div>
                  ));
                })}
              </div>
            ) : (
              <Empty title="Nothing paid yet this month" />
            )}
          </Section>

          {data.items.length > 0 && (
            <Section title="All shared payments & expenses">
              <div className="card divide-y divide-border overflow-hidden">
                {data.items.map((i) => (
                  <Link key={i._id} href={`/captures/${i._id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{i.title}</p>
                      <p className="text-sm text-muted">
                        {formatDate(i.occurredAt)} · paid by {i.paidByName}
                        {i.category && ` · ${i.category}`}
                      </p>
                    </div>
                    <span className="tabular-nums">{formatMoney(i.amountMinor, i.currency)}</span>
                  </Link>
                ))}
              </div>
            </Section>
          )}
        </>
      ) : null}
    </>
  );
}
