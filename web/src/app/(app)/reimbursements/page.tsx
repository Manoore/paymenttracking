"use client";

import Link from "next/link";
import { useState } from "react";
import { Download, Paperclip } from "lucide-react";
import { Empty, ErrorNote, PageHeader, Spinner, StatusBadge } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { Reimbursement } from "@/lib/types";

interface Group {
  key: string;
  currency: string;
  totalMinor: number;
  reimbursedMinor: number;
  outstandingMinor: number;
  items: {
    _id: string;
    title: string;
    counterparty?: string;
    amountMinor?: number;
    occurredAt?: string;
    trip?: string;
    reimbursement?: Reimbursement;
    attachmentCount: number;
  }[];
}

export default function ReimbursementsPage() {
  const [groupBy, setGroupBy] = useState<"organization" | "trip">("organization");
  const [includeDone, setIncludeDone] = useState(false);
  const { data, error, loading } = useApi<{ groups: Group[] }>("/reimbursements", { groupBy, includeDone });

  return (
    <>
      <PageHeader title="Reimbursements" subtitle="Expenses someone owes you back, grouped so you can submit them together." />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-border bg-surface p-1">
          {(["organization", "trip"] as const).map((g) => (
            <button
              key={g}
              onClick={() => setGroupBy(g)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${groupBy === g ? "bg-accent-soft text-accent" : "text-muted"}`}
            >
              By {g === "organization" ? "organization" : "trip"}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={includeDone} onChange={(e) => setIncludeDone(e.target.checked)} /> Include reimbursed
        </label>
      </div>

      {error && <ErrorNote message={error} />}
      {loading && !data ? (
        <Spinner />
      ) : data?.groups.length ? (
        <div className="space-y-6">
          {data.groups.map((g) => (
            <section key={g.key + g.currency} className="card overflow-hidden">
              <div className="flex flex-wrap items-center gap-3 border-b border-border bg-surface-2 px-4 py-3">
                <div className="flex-1">
                  <h2 className="font-semibold">{g.key}</h2>
                  <p className="text-sm text-muted">
                    {formatMoney(g.totalMinor, g.currency)} owed · {formatMoney(g.reimbursedMinor, g.currency)} repaid
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-wide text-muted">Outstanding</p>
                  <p className="text-lg font-semibold tabular-nums">{formatMoney(g.outstandingMinor, g.currency)}</p>
                </div>
                <button
                  className="btn-secondary"
                  onClick={() =>
                    void api.download(
                      "/reports/export.csv",
                      { type: "expense", reimbursable: true, [groupBy]: g.key === "Unassigned" ? undefined : g.key },
                      `reimbursement-${g.key.replace(/\W+/g, "-").toLowerCase()}.csv`,
                    )
                  }
                >
                  <Download size={16} /> CSV
                </button>
              </div>
              <div className="divide-y divide-border">
                {g.items.map((i) => (
                  <Link key={i._id} href={`/captures/${i._id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 truncate font-medium">
                        {i.title}
                        {i.attachmentCount > 0 && <Paperclip size={14} className="text-muted" />}
                      </p>
                      <p className="text-sm text-muted">
                        {formatDate(i.occurredAt)}
                        {i.counterparty && ` · ${i.counterparty}`}
                        {groupBy === "organization" && i.trip && ` · ${i.trip}`}
                      </p>
                    </div>
                    {i.reimbursement?.status && <StatusBadge status={i.reimbursement.status} />}
                    <span className="w-24 text-right font-medium tabular-nums">{formatMoney(i.amountMinor, g.currency)}</span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <Empty
          title="Nothing owed to you"
          body="When you save an expense, tick “Someone owes me for this” to track it here."
          action={<Link href="/new?type=expense" className="btn-primary">Add expense</Link>}
        />
      )}
    </>
  );
}
