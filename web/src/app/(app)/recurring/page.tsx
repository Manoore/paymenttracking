"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Empty, ErrorNote, PageHeader, Spinner } from "@/components/ui";
import { daysUntil, formatDate, formatMoney, frequencyLabel, monthlyEquivalent, relativeDue } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { Schedule } from "@/lib/types";

export default function RecurringPage() {
  const [showInactive, setShowInactive] = useState(false);
  const { data, error, loading } = useApi<{ items: Schedule[] }>("/recurring", { active: showInactive ? "all" : "true" });

  return (
    <>
      <PageHeader
        title="Recurring payments"
        subtitle="Schedules, due dates and payment history with proof."
        actions={
          <Link href="/recurring/new" className="btn-primary">
            <Plus size={18} /> Add
          </Link>
        }
      />
      <label className="mb-3 flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show stopped schedules
      </label>
      {error && <ErrorNote message={error} />}
      {(() => {
        // Subscriptions view: what all active schedules cost per month / year.
        const perCurrency = new Map<string, number>();
        for (const s of data?.items ?? [])
          if (s.active) perCurrency.set(s.currency, (perCurrency.get(s.currency) ?? 0) + monthlyEquivalent(s.amountMinor, s.frequency));
        if (!perCurrency.size) return null;
        return (
          <div className="mb-4 flex flex-wrap gap-3">
            {[...perCurrency.entries()].map(([cur, monthly]) => (
              <div key={cur} className="card px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-muted">Recurring cost ({cur})</p>
                <p className="text-xl font-semibold tabular-nums">
                  {formatMoney(monthly, cur)}
                  <span className="text-sm font-normal text-muted"> / month</span>
                </p>
                <p className="text-sm text-muted tabular-nums">{formatMoney(monthly * 12, cur)} / year</p>
              </div>
            ))}
          </div>
        );
      })()}
      {loading && !data ? (
        <Spinner />
      ) : data?.items.length ? (
        <div className="card divide-y divide-border overflow-hidden">
          {data.items.map((s) => {
            const overdue = s.active && daysUntil(s.nextDueDate) < 0;
            return (
              <Link key={s._id} href={`/recurring/${s._id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {s.title} {!s.active && <span className="chip ml-1 bg-surface-2 text-muted">Stopped</span>}
                  </p>
                  <p className={`text-sm ${overdue ? "text-danger" : "text-muted"}`}>
                    {frequencyLabel(s.frequency)}
                    {s.active && ` · ${relativeDue(s.nextDueDate)} (${formatDate(s.nextDueDate)})`}
                    {s.property && ` · ${s.property}`}
                  </p>
                </div>
                {s.amountMinor != null && <span className="font-medium tabular-nums">{formatMoney(s.amountMinor, s.currency)}</span>}
              </Link>
            );
          })}
        </div>
      ) : (
        <Empty
          title="No recurring payments yet"
          body="Add HOA dues, insurance or utilities to get reminders and keep every payment's proof together."
          action={<Link href="/recurring/new" className="btn-primary">Add recurring payment</Link>}
        />
      )}
    </>
  );
}
