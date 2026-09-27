"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { minorToInput, parseMoney, STATUS_LABELS, todayInput, toDateInput, TYPE_LABELS } from "@/lib/format";
import { useSuggestions } from "@/lib/hooks";
import type { Capture, CaptureType, ReimbursementStatus } from "@/lib/types";
import { FilePicker, PendingFiles, uploadFiles } from "./Attachments";
import { ErrorNote, Field, SuggestInput } from "./ui";

const TYPES: CaptureType[] = ["payment", "expense", "deposit", "note", "link"];
const FINANCE = new Set<CaptureType>(["payment", "expense", "deposit"]);
const COUNTERPARTY_LABEL: Partial<Record<CaptureType, string>> = {
  payment: "Paid to",
  expense: "Merchant",
  deposit: "Payer",
};

interface FormState {
  type: CaptureType;
  title: string;
  amount: string;
  currency: string;
  occurredAt: string;
  counterparty: string;
  category: string;
  property: string;
  trip: string;
  tags: string;
  notes: string;
  url: string;
  method: string;
  confirmationNumber: string;
  project: string;
  reimbursable: boolean;
  organization: string;
  status: ReimbursementStatus;
  submittedAt: string;
  reimbursedAmount: string;
  reimbursedAt: string;
  checkNumber: string;
  bankAccount: string;
  cleared: boolean;
}

function initialState(c?: Capture, prefill?: Partial<FormState>): FormState {
  const r = c?.expense?.reimbursement;
  return {
    type: c?.type ?? "payment",
    title: c?.title ?? "",
    amount: minorToInput(c?.amountMinor),
    currency: c?.currency ?? "USD",
    occurredAt: c ? toDateInput(c.occurredAt) : todayInput(),
    counterparty: c?.counterparty ?? "",
    category: c?.category ?? "",
    property: c?.property ?? "",
    trip: c?.trip ?? "",
    tags: (c?.tags ?? []).join(", "),
    notes: c?.notes ?? "",
    url: c?.url ?? "",
    method: c?.payment?.method ?? c?.expense?.paymentMethod ?? "",
    confirmationNumber: c?.payment?.confirmationNumber ?? "",
    project: c?.expense?.project ?? "",
    reimbursable: c?.expense?.reimbursable ?? false,
    organization: r?.organization ?? "",
    status: r?.status ?? "to_submit",
    submittedAt: toDateInput(r?.submittedAt),
    reimbursedAmount: minorToInput(r?.amountReimbursedMinor),
    reimbursedAt: toDateInput(r?.reimbursedAt),
    checkNumber: c?.deposit?.checkNumber ?? "",
    bankAccount: c?.deposit?.bankAccount ?? "",
    cleared: c?.deposit?.cleared ?? false,
    ...prefill,
  };
}

const blank = (s: string) => (s.trim() === "" ? null : s.trim());

function defaultTitle(s: FormState) {
  const who = s.counterparty.trim();
  if (s.type === "payment") return who ? `Payment to ${who}` : "Payment";
  if (s.type === "expense") return who ? `Expense at ${who}` : "Expense";
  if (s.type === "deposit") return who ? `Check from ${who}` : "Check deposit";
  if (s.type === "link" && s.url) return s.url.replace(/^https?:\/\//, "").slice(0, 80);
  return "Untitled note";
}

function toPayload(s: FormState, isNew: boolean) {
  const finance = FINANCE.has(s.type);
  const payload: Record<string, unknown> = {
    type: s.type,
    title: s.title.trim() || defaultTitle(s),
    notes: blank(s.notes),
    tags: s.tags.split(",").map((t) => t.trim()).filter(Boolean),
    category: blank(s.category),
    property: blank(s.property),
    trip: blank(s.trip),
    counterparty: blank(s.counterparty),
    url: blank(s.url),
    occurredAt: s.occurredAt || null,
    amountMinor: finance ? (parseMoney(s.amount) ?? null) : null,
    currency: s.currency || "USD",
    payment: s.type === "payment" ? { method: blank(s.method), confirmationNumber: blank(s.confirmationNumber) } : null,
    expense:
      s.type === "expense"
        ? {
            project: blank(s.project),
            paymentMethod: blank(s.method),
            reimbursable: s.reimbursable,
            reimbursement: s.reimbursable
              ? {
                  organization: blank(s.organization),
                  status: s.status,
                  submittedAt: s.submittedAt || null,
                  amountReimbursedMinor: parseMoney(s.reimbursedAmount) ?? 0,
                  reimbursedAt: s.reimbursedAt || null,
                }
              : null,
          }
        : null,
    deposit:
      s.type === "deposit"
        ? { checkNumber: blank(s.checkNumber), bankAccount: blank(s.bankAccount), cleared: s.cleared }
        : null,
  };
  if (isNew) {
    // Creation ignores explicit nulls; strip them to keep the request tidy.
    for (const k of Object.keys(payload)) if (payload[k] === null) delete payload[k];
  }
  return payload;
}

export function CaptureForm({
  capture,
  prefill,
  onSaved,
}: {
  capture?: Capture;
  prefill?: Partial<FormState>;
  onSaved?: (c: Capture) => void;
}) {
  const router = useRouter();
  const [s, setS] = useState<FormState>(() => initialState(capture, prefill));
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isNew = !capture;

  const counterparties = useSuggestions("counterparty");
  const categories = useSuggestions("category");
  const properties = useSuggestions("property");
  const trips = useSuggestions("trip");
  const orgs = useSuggestions("organization");
  const methods = useSuggestions("method");

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setS((p) => ({ ...p, [k]: v }));
  const text = (k: keyof FormState) => ({
    value: s[k] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => set(k, e.target.value as never),
  });

  const finance = FINANCE.has(s.type);

  async function submit(e: React.FormEvent, fileLater = false) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = toPayload(s, isNew);
      if (isNew && fileLater) payload.filed = false;
      const saved = isNew
        ? await api.post<Capture>("/captures", { ...payload, source: files.length ? "upload" : "manual" })
        : await api.patch<Capture>(`/captures/${capture._id}`, { ...payload, filed: true });
      if (files.length) await uploadFiles(files, saved._id);
      if (onSaved) onSaved(saved);
      else router.push(`/captures/${saved._id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-6">
      <div>
        <span className="label">What is it?</span>
        <div className="flex flex-wrap gap-2" role="radiogroup">
          {TYPES.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={s.type === t}
              onClick={() => set("type", t)}
              className={`rounded-full border px-4 py-2 text-sm font-medium ${
                s.type === t ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface text-muted hover:text-text"
              }`}
            >
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {isNew && (
        <div className="card p-4">
          <span className="label">Proof / attachments</span>
          <FilePicker onFiles={(f) => setFiles((p) => [...p, ...f])} disabled={saving} />
          <PendingFiles files={files} onRemove={(i) => setFiles((p) => p.filter((_, j) => j !== i))} />
        </div>
      )}

      <div className="card grid gap-4 p-4 sm:grid-cols-2">
        {finance && (
          <>
            <Field label="Amount">
              <div className="flex gap-2">
                <input className="input" inputMode="decimal" placeholder="0.00" {...text("amount")} />
                <input
                  className="input w-20 uppercase"
                  maxLength={3}
                  aria-label="Currency"
                  value={s.currency}
                  onChange={(e) => set("currency", e.target.value.toUpperCase())}
                />
              </div>
            </Field>
            <Field label={COUNTERPARTY_LABEL[s.type] ?? "Who"}>
              <SuggestInput id="counterparty" values={counterparties} {...text("counterparty")} />
            </Field>
          </>
        )}
        <Field label="Date">
          <input type="date" className="input" {...text("occurredAt")} />
        </Field>
        <Field label="Title" hint={finance ? "Optional. We'll name it from the payee if blank." : undefined}>
          <input className="input" placeholder={defaultTitle(s)} {...text("title")} />
        </Field>
        {s.type === "link" && (
          <Field label="URL" className="sm:col-span-2">
            <input className="input" type="url" inputMode="url" placeholder="https://" {...text("url")} />
          </Field>
        )}
        <Field label="Category">
          <SuggestInput id="category" values={categories} placeholder="HOA, Utilities, Travel…" {...text("category")} />
        </Field>
        {(s.type === "payment" || s.type === "expense") && (
          <Field label="Property">
            <SuggestInput id="property" values={properties} placeholder="e.g. Oak Grove" {...text("property")} />
          </Field>
        )}
        {s.type !== "deposit" && (
          <Field label="Trip / project">
            <SuggestInput id="trip" values={trips} {...text("trip")} />
          </Field>
        )}
        {(s.type === "payment" || s.type === "expense") && (
          <Field label="Payment method">
            <SuggestInput id="method" values={methods} placeholder="ACH, Visa, Zelle…" {...text("method")} />
          </Field>
        )}
        {s.type === "payment" && (
          <Field label="Confirmation #">
            <input className="input" {...text("confirmationNumber")} />
          </Field>
        )}
        {s.type === "deposit" && (
          <>
            <Field label="Check #">
              <input className="input" {...text("checkNumber")} />
            </Field>
            <Field label="Deposited to">
              <input className="input" placeholder="e.g. Chase checking" {...text("bankAccount")} />
            </Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" className="h-5 w-5" checked={s.cleared} onChange={(e) => set("cleared", e.target.checked)} />
              Cleared in my account
            </label>
          </>
        )}
        <Field label="Tags" hint="Comma separated" className="sm:col-span-2">
          <input className="input" placeholder="tax-2026, receipts" {...text("tags")} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <textarea className="input min-h-24" {...text("notes")} />
        </Field>
      </div>

      {s.type === "expense" && (
        <div className="card space-y-4 p-4">
          <label className="flex items-center gap-2 font-medium">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={s.reimbursable}
              onChange={(e) => set("reimbursable", e.target.checked)}
            />
            Someone owes me for this (reimbursable)
          </label>
          {s.reimbursable && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Reimbursed by">
                <SuggestInput id="org" values={orgs} placeholder="Work, India Club…" {...text("organization")} />
              </Field>
              <Field label="Status">
                <select className="input" {...text("status")}>
                  {Object.entries(STATUS_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
              {s.status !== "to_submit" && (
                <Field label="Submitted on">
                  <input type="date" className="input" {...text("submittedAt")} />
                </Field>
              )}
              {(s.status === "partial" || s.status === "reimbursed") && (
                <>
                  <Field label="Amount reimbursed">
                    <input className="input" inputMode="decimal" {...text("reimbursedAmount")} />
                  </Field>
                  <Field label="Reimbursed on">
                    <input type="date" className="input" {...text("reimbursedAt")} />
                  </Field>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {error && <ErrorNote message={error} />}

      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 -mx-4 flex gap-2 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        <button type="submit" className="btn-primary flex-1 md:flex-none" disabled={saving}>
          {saving && <Loader2 size={16} className="animate-spin" />}
          {isNew ? "Save" : "Save changes"}
        </button>
        {isNew && (
          <button type="button" className="btn-secondary" disabled={saving} onClick={(e) => void submit(e, true)}>
            Save to inbox
          </button>
        )}
        <button type="button" className="btn-ghost" onClick={() => router.back()} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export type { FormState };
