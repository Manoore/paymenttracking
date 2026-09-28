"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ExternalLink, Link2, Pencil, Trash2, X } from "lucide-react";
import { AttachmentPanel } from "@/components/Attachments";
import { CaptureForm } from "@/components/CaptureForm";
import { ErrorNote, PageHeader, Section, Spinner, StatusBadge, TypeBadge, TypeIcon } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate, formatMoney, STATUS_LABELS, TYPE_LABELS, todayInput } from "@/lib/format";
import { useApi, useDebounced } from "@/lib/hooks";
import type { Capture, CaptureDetail, CaptureSummary, Paged, ReimbursementStatus } from "@/lib/types";

function Detail({ label, value }: { label: string; value?: React.ReactNode }) {
  if (value === undefined || value === null || value === "" || value === false) return null;
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 break-words">{value}</dd>
    </div>
  );
}

function LinkedRow({ c, onUnlink }: { c: CaptureSummary; onUnlink?: () => void }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <TypeIcon type={c.type} size={16} />
      <Link href={`/captures/${c._id}`} className="min-w-0 flex-1 hover:underline">
        <p className="truncate text-sm font-medium">{c.title}</p>
        <p className="text-xs text-muted">
          {TYPE_LABELS[c.type]} · {formatDate(c.occurredAt)}
        </p>
      </Link>
      {c.amountMinor != null && <span className="text-sm tabular-nums">{formatMoney(c.amountMinor, c.currency)}</span>}
      {onUnlink && (
        <button aria-label="Unlink" onClick={onUnlink} className="p-1 text-muted hover:text-danger">
          <X size={16} />
        </button>
      )}
    </div>
  );
}

function LinkPicker({ selfId, onPick }: { selfId: string; onPick: (id: string) => void }) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const { data } = useApi<Paged<Capture>>(dq.length >= 2 ? "/captures" : null, { q: dq, limit: 8 });
  return (
    <div className="p-3">
      <input className="input" placeholder="Search records to link…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      {data && (
        <div className="mt-2 divide-y divide-border">
          {data.items
            .filter((c) => c._id !== selfId)
            .map((c) => (
              <button key={c._id} className="block w-full px-2 py-2 text-left text-sm hover:bg-surface-2" onClick={() => onPick(c._id)}>
                <span className="font-medium">{c.title}</span>
                <span className="text-muted"> · {TYPE_LABELS[c.type]} · {formatDate(c.occurredAt ?? c.createdAt)}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

export default function CapturePage({ params }: PageProps<"/captures/[id]">) {
  const { id } = use(params);
  const router = useRouter();
  const { data: c, error, loading, reload } = useApi<CaptureDetail>(`/captures/${id}`);
  const [editing, setEditing] = useState(false);
  const [linking, setLinking] = useState(false);
  const [busy, setBusy] = useState(false);

  if (loading && !c) return <Spinner />;
  if (error) return <ErrorNote message={error} />;
  if (!c) return null;

  const patch = async (body: unknown) => {
    setBusy(true);
    try {
      await api.patch(`/captures/${c._id}`, body);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm("Move this record to trash?")) return;
    await api.del(`/captures/${c._id}`);
    router.push("/activity");
  };

  const setLinks = (links: { captureId: string; relation: string }[]) => patch({ links });

  if (editing) {
    return (
      <>
        <PageHeader title={c.filed ? "Edit record" : "File this capture"} />
        <CaptureForm
          capture={c}
          onSaved={() => {
            setEditing(false);
            void reload();
          }}
        />
      </>
    );
  }

  const r = c.expense?.reimbursement;
  const nextStatus: Partial<Record<ReimbursementStatus, ReimbursementStatus>> = {
    to_submit: "submitted",
    submitted: "reimbursed",
    partial: "reimbursed",
  };

  return (
    <>
      <div className="mb-6 flex items-start gap-3">
        <TypeIcon type={c.type} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <TypeBadge type={c.type} />
            {!c.filed && <span className="chip bg-warn-soft text-warn">Inbox</span>}
            {c.visibility === "private" && <span className="chip bg-surface-2 text-muted">Private</span>}
          </div>
          <h1 className="mt-1 break-words text-2xl font-semibold tracking-tight">{c.title}</h1>
          {c.amountMinor != null && <p className="mt-1 text-xl font-medium tabular-nums">{formatMoney(c.amountMinor, c.currency)}</p>}
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <button className="btn-primary" onClick={() => setEditing(true)}>
          <Pencil size={16} /> {c.filed ? "Edit" : "File it"}
        </button>
        {c.expense?.reimbursable && r?.status && nextStatus[r.status] && (
          <button
            className="btn-secondary"
            disabled={busy}
            onClick={() => {
              const s = nextStatus[r.status!]!;
              void patch({
                expense: {
                  reimbursement: {
                    status: s,
                    ...(s === "submitted" ? { submittedAt: todayInput() } : {}),
                    ...(s === "reimbursed" ? { reimbursedAt: todayInput(), amountReimbursedMinor: c.amountMinor ?? 0 } : {}),
                  },
                },
              });
            }}
          >
            <CheckCircle2 size={16} /> Mark {STATUS_LABELS[nextStatus[r.status]!].toLowerCase()}
          </button>
        )}
        {c.type === "deposit" && !c.deposit?.cleared && (
          <button className="btn-secondary" disabled={busy} onClick={() => void patch({ deposit: { cleared: true } })}>
            <CheckCircle2 size={16} /> Mark cleared
          </button>
        )}
        <button className="btn-danger ml-auto" onClick={() => void remove()}>
          <Trash2 size={16} /> Delete
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div>
          <Section title="Proof & attachments">
            <AttachmentPanel captureId={c._id} attachments={c.attachments} onChange={() => void reload()} />
          </Section>

          {c.notes && (
            <Section title="Notes">
              <p className="card whitespace-pre-wrap p-4 text-sm">{c.notes}</p>
            </Section>
          )}

          <Section title="Linked records" action={<button className="text-sm text-accent" onClick={() => setLinking(!linking)}><Link2 size={14} className="mr-1 inline" />Link</button>}>
            <div className="card divide-y divide-border overflow-hidden">
              {linking && (
                <LinkPicker
                  selfId={c._id}
                  onPick={(pid) => {
                    setLinking(false);
                    if (!c.links.some((l) => l.captureId === pid)) void setLinks([...c.links, { captureId: pid, relation: "related" }]);
                  }}
                />
              )}
              {c.linked.map((l) => (
                <LinkedRow key={l._id} c={l} onUnlink={() => void setLinks(c.links.filter((x) => x.captureId !== l._id))} />
              ))}
              {c.backlinks.map((l) => (
                <LinkedRow key={`b-${l._id}`} c={l} />
              ))}
              {!linking && !c.linked.length && !c.backlinks.length && (
                <p className="px-4 py-3 text-sm text-muted">Link a payment to its property bill, an expense to its trip, or a receipt to its reimbursement.</p>
              )}
            </div>
          </Section>
        </div>

        <aside>
          <dl className="card grid gap-4 p-4 text-sm">
            <Detail label="Date" value={formatDate(c.occurredAt)} />
            <Detail label={c.type === "deposit" ? "Payer" : c.type === "expense" ? "Merchant" : "Paid to"} value={c.counterparty} />
            <Detail label="Category" value={c.category} />
            <Detail label="Property" value={c.property} />
            <Detail label="Trip / project" value={c.trip} />
            <Detail
              label="Organization"
              value={
                (c.organization ?? r?.organization) && (
                  <Link className="text-accent" href={`/activity?organization=${encodeURIComponent(c.organization ?? r?.organization ?? "")}`}>
                    {c.organization ?? r?.organization}
                  </Link>
                )
              }
            />
            <Detail label="Method" value={c.payment?.method ?? c.expense?.paymentMethod} />
            <Detail label="Confirmation #" value={c.payment?.confirmationNumber} />
            <Detail label="Due date" value={formatDate(c.payment?.dueDate)} />
            <Detail
              label="Recurring schedule"
              value={c.payment?.scheduleId && <Link className="text-accent" href={`/recurring/${c.payment.scheduleId}`}>View schedule</Link>}
            />
            {c.expense?.reimbursable && r && (
              <>
                <Detail label="Reimbursement" value={r.status && <StatusBadge status={r.status} />} />
                <Detail label="Submitted" value={formatDate(r.submittedAt)} />
                <Detail label="Amount reimbursed" value={r.amountReimbursedMinor ? formatMoney(r.amountReimbursedMinor, c.currency) : undefined} />
                <Detail label="Reimbursed on" value={formatDate(r.reimbursedAt)} />
              </>
            )}
            <Detail label="Check #" value={c.deposit?.checkNumber} />
            <Detail label="Deposited to" value={c.deposit?.bankAccount} />
            {c.type === "deposit" && <Detail label="Cleared" value={c.deposit?.cleared ? `Yes · ${formatDate(c.deposit.clearedAt)}` : "Not yet"} />}
            <Detail
              label="Link"
              value={
                c.url && (
                  <a className="inline-flex items-center gap-1 text-accent" href={c.url} target="_blank" rel="noreferrer noopener">
                    Open <ExternalLink size={14} />
                  </a>
                )
              }
            />
            <Detail
              label="Tags"
              value={
                c.tags.length > 0 && (
                  <span className="flex flex-wrap gap-1">
                    {c.tags.map((t) => (
                      <Link key={t} href={`/activity?tag=${encodeURIComponent(t)}`} className="chip bg-surface-2 text-muted hover:text-text">
                        #{t}
                      </Link>
                    ))}
                  </span>
                )
              }
            />
            <Detail label="Saved" value={formatDate(c.createdAt, { dateStyle: "medium", timeStyle: "short", timeZone: undefined })} />
          </dl>
        </aside>
      </div>
    </>
  );
}
