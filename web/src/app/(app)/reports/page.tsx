"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Empty, ErrorNote, Field, PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { formatMoney, TYPE_LABELS } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { CaptureType } from "@/lib/types";

const GROUPS = {
  category: "Category",
  property: "Property",
  trip: "Trip / project",
  organization: "Organization",
  counterparty: "Payee / merchant",
  month: "Month",
  type: "Type",
} as const;

interface Row {
  key: string;
  groupKey: string; // case-insensitive grouping key from the API
  currency: string;
  type: CaptureType;
  totalMinor: number;
  count: number;
}

function startOfYear() {
  return `${new Date().getFullYear()}-01-01`;
}

export default function ReportsPage() {
  const [groupBy, setGroupBy] = useState<keyof typeof GROUPS>("category");
  const [type, setType] = useState<string>("payment,expense");
  const [from, setFrom] = useState(startOfYear());
  const [to, setTo] = useState("");
  const filters = { type, from, to: to || undefined };
  const { data, error, loading } = useApi<{ rows: Row[] }>("/reports/summary", { groupBy, ...filters });

  // Merge rows that differ only by type so each group shows one total per currency.
  const merged = new Map<string, { key: string; currency: string; totalMinor: number; count: number }>();
  for (const r of data?.rows ?? []) {
    const k = `${r.groupKey}|${r.currency}`;
    const display = groupBy === "type" ? (TYPE_LABELS[r.key as CaptureType] ?? r.key) : r.key;
    const cur = merged.get(k) ?? { key: display, currency: r.currency, totalMinor: 0, count: 0 };
    cur.totalMinor += r.totalMinor;
    cur.count += r.count;
    merged.set(k, cur);
  }
  const rows = [...merged.values()].sort((a, b) =>
    groupBy === "month" ? b.key.localeCompare(a.key) : b.totalMinor - a.totalMinor,
  );
  const max = Math.max(1, ...rows.map((r) => r.totalMinor));
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.currency, (totals.get(r.currency) ?? 0) + r.totalMinor);

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Totals by category, property, trip or month. Export anything to CSV."
        actions={
          <button
            className="btn-secondary"
            onClick={() => void api.download("/reports/export.csv", filters, `capture-hub-${from || "all"}.csv`)}
          >
            <Download size={16} /> Export CSV
          </button>
        }
      />

      <div className="card mb-6 grid gap-4 p-4 sm:grid-cols-4">
        <Field label="Group by">
          <select className="input" value={groupBy} onChange={(e) => setGroupBy(e.target.value as keyof typeof GROUPS)}>
            {Object.entries(GROUPS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Include">
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="payment,expense">Money out (payments + expenses)</option>
            <option value="payment">Payments</option>
            <option value="expense">Expenses</option>
            <option value="deposit">Deposits</option>
          </select>
        </Field>
        <Field label="From">
          <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>

      {error && <ErrorNote message={error} />}
      {loading && !data ? (
        <Spinner />
      ) : rows.length ? (
        <>
          <div className="mb-4 flex flex-wrap gap-3">
            {[...totals.entries()].map(([cur, total]) => (
              <div key={cur} className="card px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-muted">Total ({cur})</p>
                <p className="text-xl font-semibold tabular-nums">{formatMoney(total, cur)}</p>
              </div>
            ))}
          </div>
          <div className="card divide-y divide-border">
            {rows.map((r) => (
              <div key={r.key + r.currency} className="px-4 py-3">
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <span className="truncate font-medium">{r.key}</span>
                  <span className="shrink-0 tabular-nums">
                    {formatMoney(r.totalMinor, r.currency)} <span className="text-sm text-muted">· {r.count}</span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${(r.totalMinor / max) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <Empty title="No amounts in this range" />
      )}
    </>
  );
}
