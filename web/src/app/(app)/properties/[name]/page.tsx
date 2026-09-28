"use client";

import { use, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { CaptureList, Empty, PageHeader, Section, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { formatMoney, frequencyLabel, relativeDue } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { Capture, Paged, Schedule } from "@/lib/types";

export default function PropertyPage({ params }: PageProps<"/properties/[name]">) {
  const name = decodeURIComponent(use(params).name);
  const [year, setYear] = useState(new Date().getFullYear());
  const range = { from: `${year}-01-01`, to: `${year}-12-31` };
  const records = useApi<Paged<Capture>>("/captures", { property: name, ...range, limit: 100 });
  const byCategory = useApi<{ rows: { key: string; currency: string; totalMinor: number }[] }>("/reports/summary", {
    property: name,
    groupBy: "category",
    type: "payment,expense",
    ...range,
  });
  const schedules = useApi<{ items: Schedule[] }>("/recurring");
  const bills = (schedules.data?.items ?? []).filter((s) => s.property?.trim().toLowerCase() === name.trim().toLowerCase());
  const totals = new Map<string, number>();
  for (const r of byCategory.data?.rows ?? []) totals.set(r.currency, (totals.get(r.currency) ?? 0) + r.totalMinor);

  return (
    <>
      <PageHeader
        title={name}
        subtitle="Property overview"
        actions={
          <>
            <select className="input w-28" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Year">
              {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
            <button
              className="btn-secondary"
              onClick={() => void api.download("/reports/export.csv", { property: name, ...range }, `${name}-${year}.csv`)}
            >
              <Download size={16} /> CSV
            </button>
          </>
        }
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Spent in {year}</p>
          {[...totals.entries()].map(([cur, t]) => (
            <p key={cur} className="text-2xl font-semibold tabular-nums">
              {formatMoney(t, cur)}
            </p>
          ))}
          {!totals.size && <p className="text-2xl font-semibold">–</p>}
        </div>
        <div className="card p-4 sm:col-span-2">
          <p className="mb-2 text-xs uppercase tracking-wide text-muted">By category</p>
          {byCategory.data?.rows.length ? (
            <ul className="space-y-1 text-sm">
              {byCategory.data.rows.map((r) => (
                <li key={r.key + r.currency} className="flex justify-between gap-2">
                  <span>{r.key}</span>
                  <span className="tabular-nums">{formatMoney(r.totalMinor, r.currency)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No spending recorded for {year}.</p>
          )}
        </div>
      </div>

      <Section title="Recurring bills">
        {bills.length ? (
          <div className="card divide-y divide-border overflow-hidden">
            {bills.map((s) => (
              <Link key={s._id} href={`/recurring/${s._id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2">
                <div>
                  <p className="font-medium">{s.title}</p>
                  <p className="text-sm text-muted">
                    {frequencyLabel(s.frequency)} · {relativeDue(s.nextDueDate)}
                  </p>
                </div>
                <span className="tabular-nums">{formatMoney(s.amountMinor, s.currency)}</span>
              </Link>
            ))}
          </div>
        ) : (
          <Empty title="No recurring bills for this property" />
        )}
      </Section>

      <Section title={`Records in ${year}`}>
        {records.loading && !records.data ? (
          <Spinner />
        ) : records.data?.items.length ? (
          <CaptureList items={records.data.items} />
        ) : (
          <Empty title="Nothing recorded this year" />
        )}
      </Section>
    </>
  );
}
