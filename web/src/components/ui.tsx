"use client";

import Link from "next/link";
import { FileBadge, FileText, Landmark, Lightbulb, Link2, Loader2, MapPin, Paperclip, Receipt, StickyNote, Wallet } from "lucide-react";
import { formatDate, formatMoney, STATUS_LABELS, TYPE_LABELS } from "@/lib/format";
import type { Capture, CaptureType, ReimbursementStatus } from "@/lib/types";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted" role="status">
      <Loader2 className="animate-spin" size={18} /> {label}…
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return <div className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{message}</div>;
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const TYPE_ICON: Record<CaptureType, typeof FileText> = {
  note: StickyNote,
  link: Link2,
  payment: Wallet,
  expense: Receipt,
  deposit: Landmark,
  document: FileBadge,
  place: MapPin,
  idea: Lightbulb,
};

export function TypeIcon({ type, size = 18 }: { type: CaptureType; size?: number }) {
  const Icon = TYPE_ICON[type] ?? FileText;
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
      <Icon size={size} />
    </span>
  );
}

export function TypeBadge({ type }: { type: CaptureType }) {
  return <span className="chip bg-surface-2 text-muted">{TYPE_LABELS[type]}</span>;
}

const STATUS_STYLE: Record<ReimbursementStatus, string> = {
  to_submit: "bg-warn-soft text-warn",
  submitted: "bg-accent-soft text-accent",
  partial: "bg-accent-soft text-accent",
  reimbursed: "bg-ok-soft text-ok",
};

export function StatusBadge({ status }: { status: ReimbursementStatus }) {
  return <span className={`chip ${STATUS_STYLE[status]}`}>{STATUS_LABELS[status]}</span>;
}

export function CaptureRow({ c }: { c: Capture }) {
  const date = c.occurredAt ?? c.createdAt;
  const meta = [c.counterparty, c.organization ?? c.expense?.reimbursement?.organization, c.property, c.trip, c.category].filter(Boolean).join(" · ");
  return (
    <Link href={`/captures/${c._id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
      <TypeIcon type={c.type} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium">{c.title}</p>
          {c.attachmentIds?.length > 0 && <Paperclip size={14} className="shrink-0 text-muted" aria-label="Has attachments" />}
        </div>
        <p className="truncate text-sm text-muted">
          {formatDate(date)}
          {meta && ` · ${meta}`}
        </p>
        {(c.expense?.reimbursable || c.type === "deposit" || !c.filed) && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {!c.filed && <span className="chip bg-warn-soft text-warn">Inbox</span>}
            {c.expense?.reimbursable && c.expense.reimbursement?.status && <StatusBadge status={c.expense.reimbursement.status} />}
            {c.type === "deposit" && (
              <span className={`chip ${c.deposit?.cleared ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"}`}>
                {c.deposit?.cleared ? "Cleared" : "Not cleared"}
              </span>
            )}
          </div>
        )}
      </div>
      {c.amountMinor != null && (
        <span className="shrink-0 font-medium tabular-nums">{formatMoney(c.amountMinor, c.currency)}</span>
      )}
    </Link>
  );
}

export function CaptureList({ items }: { items: Capture[] }) {
  return (
    <div className="card divide-y divide-border overflow-hidden">
      {items.map((c) => (
        <CaptureRow key={c._id} c={c} />
      ))}
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
  className = "",
  suggested = false,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  className?: string;
  /** Value was filled in by document reading; the user should check it. */
  suggested?: boolean;
}) {
  return (
    <label className={`block ${className} ${suggested ? "[&_.input]:border-accent [&_.input]:bg-accent-soft/40" : ""}`}>
      <span className="label flex items-center gap-2">
        {label}
        {suggested && <span className="chip bg-accent-soft text-accent">✨ Suggested — check</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

/** Text input with native autocomplete from previously used values. */
export function SuggestInput({
  id,
  values,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { id: string; values: string[] }) {
  return (
    <>
      <input className="input" list={`${id}-list`} autoComplete="off" {...props} />
      <datalist id={`${id}-list`}>
        {values.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
    </>
  );
}
