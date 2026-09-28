"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, MapPin, Plus } from "lucide-react";
import { PropertyForm } from "@/components/PropertyForm";
import { Empty, ErrorNote, PageHeader, Spinner } from "@/components/ui";
import { useWorkspace } from "@/components/WorkspaceContext";
import { formatDate, formatMoney } from "@/lib/format";
import { useApi } from "@/lib/hooks";

interface PropertyRow {
  id?: string;
  name: string;
  address?: string;
  count: number;
  lastAt?: string;
  schedules: number;
  totals: { currency: string; totalMinor: number }[];
}

export default function PropertiesPage() {
  const router = useRouter();
  const { canWrite } = useWorkspace();
  const { data, error, loading, reload } = useApi<{ items: PropertyRow[] }>("/properties");
  const [adding, setAdding] = useState(false);

  const addButton = canWrite && !adding && (
    <button className="btn-primary" onClick={() => setAdding(true)}>
      <Plus size={18} /> Add property
    </button>
  );

  return (
    <>
      <PageHeader title="Properties" subtitle="Everything tied to each home or property: bills, repairs, proof." actions={addButton} />

      {adding && (
        <div className="mb-6">
          <PropertyForm
            onCancel={() => setAdding(false)}
            onSaved={(p) => {
              setAdding(false);
              void reload();
              router.push(`/properties/${encodeURIComponent(p.name)}`);
            }}
          />
        </div>
      )}

      {error && <ErrorNote message={error} />}
      {loading && !data ? (
        <Spinner />
      ) : data?.items.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {data.items.map((p) => (
            <Link key={p.name} href={`/properties/${encodeURIComponent(p.name)}`} className="card block p-5 hover:border-accent">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                  <Building2 size={20} />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{p.name}</p>
                  {p.address ? (
                    <p className="flex items-center gap-1 truncate text-sm text-muted">
                      <MapPin size={12} /> {p.address}
                    </p>
                  ) : (
                    <p className="text-sm text-muted">
                      {p.count} record{p.count === 1 ? "" : "s"} · {p.schedules} recurring
                    </p>
                  )}
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
                <p className="text-xs text-muted">
                  {p.address && `${p.count} records · ${p.schedules} recurring`}
                  {!p.address && p.lastAt && `Last: ${formatDate(p.lastAt)}`}
                </p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        !adding && (
          <Empty
            title="No properties yet"
            body="Add your home or rental (like “Oak Grove”) to keep its HOA, utilities, insurance and repairs together."
            action={
              canWrite ? (
                <button className="btn-primary" onClick={() => setAdding(true)}>
                  <Plus size={18} /> Add your first property
                </button>
              ) : undefined
            }
          />
        )
      )}
    </>
  );
}
