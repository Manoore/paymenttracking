"use client";

import Link from "next/link";
import { Building2 } from "lucide-react";
import { Empty, ErrorNote, PageHeader, Spinner } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";
import { useApi } from "@/lib/hooks";

interface PropertyRow {
  name: string;
  count: number;
  lastAt: string;
  schedules: number;
  totals: { currency: string; totalMinor: number }[];
}

export default function PropertiesPage() {
  const { data, error, loading } = useApi<{ items: PropertyRow[] }>("/properties");
  return (
    <>
      <PageHeader title="Properties" subtitle="Everything tied to each home or property: bills, repairs, proof." />
      {error && <ErrorNote message={error} />}
      {loading && !data ? (
        <Spinner />
      ) : data?.items.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {data.items.map((p) => (
            <Link key={p.name} href={`/properties/${encodeURIComponent(p.name)}`} className="card block p-5 hover:border-accent">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft text-accent">
                  <Building2 size={20} />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{p.name}</p>
                  <p className="text-sm text-muted">
                    {p.count} record{p.count === 1 ? "" : "s"} · {p.schedules} recurring
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">Spent (all time)</p>
                  {p.totals.length ? (
                    p.totals.map((t) => (
                      <p key={t.currency} className="text-lg font-semibold tabular-nums">
                        {formatMoney(t.totalMinor, t.currency)}
                      </p>
                    ))
                  ) : (
                    <p className="text-lg font-semibold">–</p>
                  )}
                </div>
                {p.count > 0 && <p className="text-xs text-muted">Last: {formatDate(p.lastAt)}</p>}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <Empty
          title="No properties yet"
          body="Add a Property (like “Oak Grove”) to a payment, expense or recurring bill and it will appear here."
        />
      )}
    </>
  );
}
