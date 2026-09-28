"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, Zap } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { DOC_KIND_LABELS, formatMoney, minorToInput, parseMoney, STATUS_LABELS, todayInput, toDateInput, TYPE_LABELS } from "@/lib/format";
import { useApi, useSuggestions } from "@/lib/hooks";
import type { Capture, CaptureType, DocumentKind, ReimbursementStatus, Template } from "@/lib/types";
import { FilePicker, PendingFiles, uploadFiles } from "./Attachments";
import { ErrorNote, Field, SuggestInput } from "./ui";
import { useWorkspace } from "./WorkspaceContext";

// Money first (most common), then the "save anything" types.
const TYPES: CaptureType[] = ["payment", "expense", "deposit", "document", "place", "idea", "note", "link"];
const MONEY = new Set<CaptureType>(["payment", "expense", "deposit", "idea"]);
const PURCHASE = new Set<CaptureType>(["payment", "expense"]);
const COUNTERPARTY_LABEL: Partial<Record<CaptureType, string>> = {
  payment: "Paid to",
  expense: "Merchant",
  deposit: "Payer",
  idea: "Store / brand",
};

type PlaceKind = "restaurant" | "stay" | "sight" | "shop" | "other";
type IdeaKind = "product" | "design" | "gift" | "other";
type IdeaStatus = "want" | "done" | "dropped";

export interface FormState {
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
  owedAmount: string;
  submittedAt: string;
  reimbursedAmount: string;
  reimbursedAt: string;
  checkNumber: string;
  bankAccount: string;
  cleared: boolean;
  returnBy: string;
  warrantyUntil: string;
  reminderDays: string;
  docKind: DocumentKind;
  docReference: string;
  expiresAt: string;
  placeKind: PlaceKind;
  address: string;
  mapUrl: string;
  visited: boolean;
  rating: string;
  ideaKind: IdeaKind;
  ideaStatus: IdeaStatus;
  paidBy: string;
  privateItem: boolean;
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
    organization: c?.organization ?? r?.organization ?? "",
    status: r?.status ?? "to_submit",
    owedAmount: minorToInput(r?.amountOwedMinor),
    submittedAt: toDateInput(r?.submittedAt),
    reimbursedAmount: minorToInput(r?.amountReimbursedMinor),
    reimbursedAt: toDateInput(r?.reimbursedAt),
    checkNumber: c?.deposit?.checkNumber ?? "",
    bankAccount: c?.deposit?.bankAccount ?? "",
    cleared: c?.deposit?.cleared ?? false,
    returnBy: toDateInput(c?.returnBy),
    warrantyUntil: toDateInput(c?.warrantyUntil),
    reminderDays: c?.reminderDaysBefore != null ? String(c.reminderDaysBefore) : "",
    docKind: c?.document?.kind ?? "other",
    docReference: c?.document?.reference ?? "",
    expiresAt: toDateInput(c?.document?.expiresAt),
    placeKind: c?.place?.kind ?? "restaurant",
    address: c?.place?.address ?? "",
    mapUrl: c?.place?.mapUrl ?? "",
    visited: c?.place?.visited ?? false,
    rating: c?.place?.rating ? String(c.place.rating) : "",
    ideaKind: c?.idea?.kind ?? "product",
    ideaStatus: c?.idea?.status ?? "want",
    paidBy: c?.paidBy ?? "",
    privateItem: c?.visibility === "private",
    ...prefill,
  };
}

const blank = (s: string) => (s.trim() === "" ? null : s.trim());

function defaultTitle(s: FormState) {
  const who = s.counterparty.trim();
  switch (s.type) {
    case "payment":
      return who ? `Payment to ${who}` : "Payment";
    case "expense":
      return who ? `Expense at ${who}` : "Expense";
    case "deposit":
      return who ? `Check from ${who}` : "Check deposit";
    case "document":
      return DOC_KIND_LABELS[s.docKind];
    case "place":
      return s.address.trim().split(",")[0] || "Place to remember";
    case "idea":
      return s.url ? s.url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0] : "Idea";
    case "link":
      return s.url ? s.url.replace(/^https?:\/\//, "").slice(0, 80) : "Saved link";
    default:
      return "Untitled note";
  }
}

function toPayload(s: FormState, isNew: boolean) {
  const money = MONEY.has(s.type);
  const purchase = PURCHASE.has(s.type);
  const payload: Record<string, unknown> = {
    type: s.type,
    title: s.title.trim() || defaultTitle(s),
    notes: blank(s.notes),
    tags: s.tags.split(",").map((t) => t.trim()).filter(Boolean),
    category: blank(s.category),
    property: blank(s.property),
    trip: blank(s.trip),
    organization: blank(s.organization),
    counterparty: blank(s.counterparty),
    url: blank(s.url),
    occurredAt: s.occurredAt || null,
    amountMinor: money ? (parseMoney(s.amount) ?? null) : null,
    currency: s.currency || "USD",
    returnBy: purchase ? s.returnBy || null : null,
    warrantyUntil: purchase ? s.warrantyUntil || null : null,
    reminderDaysBefore: s.reminderDays ? Number(s.reminderDays) : null,
    payment: s.type === "payment" ? { method: blank(s.method), confirmationNumber: blank(s.confirmationNumber) } : null,
    expense:
      s.type === "expense"
        ? {
            project: blank(s.project),
            paymentMethod: blank(s.method),
            reimbursable: s.reimbursable,
            reimbursement: s.reimbursable
              ? {
                  status: s.status,
                  amountOwedMinor: parseMoney(s.owedAmount) ?? null,
                  submittedAt: s.submittedAt || null,
                  amountReimbursedMinor: parseMoney(s.reimbursedAmount) ?? 0,
                  reimbursedAt: s.reimbursedAt || null,
                }
              : null,
          }
        : null,
    deposit:
      s.type === "deposit" ? { checkNumber: blank(s.checkNumber), bankAccount: blank(s.bankAccount), cleared: s.cleared } : null,
    document:
      s.type === "document" ? { kind: s.docKind, reference: blank(s.docReference), expiresAt: s.expiresAt || null } : null,
    place:
      s.type === "place"
        ? {
            kind: s.placeKind,
            address: blank(s.address),
            mapUrl: blank(s.mapUrl),
            visited: s.visited,
            rating: s.rating ? Number(s.rating) : null,
          }
        : null,
    idea: s.type === "idea" ? { kind: s.ideaKind, status: s.ideaStatus } : null,
    paidBy: purchase && s.paidBy ? s.paidBy : null,
    visibility: s.privateItem ? "private" : "workspace",
  };
  if (isNew) {
    // Creation ignores explicit nulls; strip them to keep the request tidy.
    for (const k of Object.keys(payload)) if (payload[k] === null) delete payload[k];
  }
  return payload;
}

/** One-tap starting points built from what you record most often. */
function Templates({ onPick }: { onPick: (t: Template) => void }) {
  const { data } = useApi<{ items: Template[] }>("/captures/templates");
  if (!data?.items.length) return null;
  return (
    <div>
      <span className="label flex items-center gap-1.5">
        <Zap size={14} className="text-accent" /> Quick start from a recent one
      </span>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
        {data.items.map((t) => (
          <button
            key={t.label + t.values.type}
            type="button"
            onClick={() => onPick(t)}
            className="shrink-0 rounded-lg border border-border bg-surface px-3 py-2 text-left text-sm hover:border-accent"
          >
            <span className="block font-medium">{t.label}</span>
            <span className="text-xs text-muted">
              {TYPE_LABELS[t.values.type!]}
              {t.values.amountMinor != null && ` · ${formatMoney(t.values.amountMinor, t.values.currency)}`}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Stars({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === String(n)}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          onClick={() => onChange(value === String(n) ? "" : String(n))}
          className={`text-2xl leading-none ${Number(value) >= n ? "text-warn" : "text-border"}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export function CaptureForm({
  capture,
  prefill,
  onSaved,
  initialFiles = [],
}: {
  capture?: Capture;
  prefill?: Partial<FormState>;
  onSaved?: (c: Capture) => void;
  initialFiles?: File[];
}) {
  const router = useRouter();
  const { isFamily, members, user, workspace } = useWorkspace();
  const [s, setS] = useState<FormState>(() => initialState(capture, prefill));
  const [files, setFiles] = useState<File[]>(initialFiles);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFollowUps, setShowFollowUps] = useState(Boolean(capture?.returnBy || capture?.warrantyUntil));
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

  const applyTemplate = (t: Template) => {
    const v = t.values;
    setS((p) => ({
      ...p,
      type: v.type ?? p.type,
      title: v.title ?? "",
      counterparty: v.counterparty ?? "",
      amount: minorToInput(v.amountMinor),
      currency: v.currency ?? p.currency,
      category: v.category ?? "",
      property: v.property ?? "",
      trip: v.trip ?? "",
      organization: v.organization ?? "",
      method: v.method ?? "",
      reimbursable: v.reimbursable ?? false,
      occurredAt: todayInput(),
    }));
  };

  const money = MONEY.has(s.type);
  const purchase = PURCHASE.has(s.type);

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
      {isNew && <Templates onPick={applyTemplate} />}

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
          <span className="label">{s.type === "place" || s.type === "idea" ? "Photos / screenshots" : "Proof / attachments"}</span>
          <FilePicker onFiles={(f) => setFiles((p) => [...p, ...f])} disabled={saving} />
          <PendingFiles files={files} onRemove={(i) => setFiles((p) => p.filter((_, j) => j !== i))} />
        </div>
      )}

      <div className="card grid gap-4 p-4 sm:grid-cols-2">
        {s.type === "document" && (
          <>
            <Field label="Kind of document">
              <select className="input" {...text("docKind")}>
                {Object.entries(DOC_KIND_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Expires / renews on" hint="We'll remind you before this date">
              <input type="date" className="input" {...text("expiresAt")} />
            </Field>
            <Field label="Reference" hint="Last 4 digits only. Don't store full ID numbers.">
              <input className="input" maxLength={40} placeholder="…4821" {...text("docReference")} />
            </Field>
          </>
        )}

        {s.type === "place" && (
          <>
            <Field label="Kind of place">
              <select className="input" {...text("placeKind")}>
                <option value="restaurant">Restaurant / food</option>
                <option value="stay">Hotel / stay</option>
                <option value="sight">Sight / activity</option>
                <option value="shop">Shop</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Address or area">
              <input className="input" placeholder="e.g. Pike Place, Seattle" {...text("address")} />
            </Field>
            <Field label="Map link" hint="Paste a Google/Apple Maps link">
              <input className="input" type="url" inputMode="url" placeholder="https://maps…" {...text("mapUrl")} />
            </Field>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-5 w-5" checked={s.visited} onChange={(e) => set("visited", e.target.checked)} />
                Been there
              </label>
              {s.visited && <Stars value={s.rating} onChange={(v) => set("rating", v)} />}
            </div>
          </>
        )}

        {s.type === "idea" && (
          <>
            <Field label="Kind of idea">
              <select className="input" {...text("ideaKind")}>
                <option value="product">Product to buy</option>
                <option value="design">Design inspiration</option>
                <option value="gift">Gift idea</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Status">
              <select className="input" {...text("ideaStatus")}>
                <option value="want">Want / open</option>
                <option value="done">Bought / done</option>
                <option value="dropped">Dropped</option>
              </select>
            </Field>
            <Field label="Link" className="sm:col-span-2">
              <input className="input" type="url" inputMode="url" placeholder="https://" {...text("url")} />
            </Field>
          </>
        )}

        {money && (
          <>
            <Field label={s.type === "idea" ? "Price (optional)" : "Amount"}>
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
        {s.type !== "document" && (
          <Field label={s.type === "place" || s.type === "idea" ? "Saved on" : "Date"}>
            <input type="date" className="input" {...text("occurredAt")} />
          </Field>
        )}
        <Field label="Title" hint={money ? "Optional. We'll name it from the details if blank." : undefined}>
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
        {purchase && (
          <Field label="Property">
            <SuggestInput id="property" values={properties} placeholder="e.g. Oak Grove" {...text("property")} />
          </Field>
        )}
        {s.type !== "deposit" && s.type !== "document" && (
          <Field label="Trip / project">
            <SuggestInput id="trip" values={trips} {...text("trip")} />
          </Field>
        )}
        <Field label="Organization" hint="Club, employer, person or group this is for">
          <SuggestInput id="org" values={orgs} placeholder="India Club, Work…" {...text("organization")} />
        </Field>
        {purchase && (
          <Field label="Payment method">
            <SuggestInput id="method" values={methods} placeholder="ACH, Visa, Zelle…" {...text("method")} />
          </Field>
        )}
        {isFamily && purchase && (
          <Field label="Paid by" hint="So your family knows it's taken care of">
            <select className="input" value={s.paidBy || user?.id || ""} onChange={(e) => set("paidBy", e.target.value)}>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                  {m.userId === user?.id ? " (me)" : ""}
                </option>
              ))}
            </select>
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
        {isFamily && (
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" className="h-5 w-5" checked={s.privateItem} onChange={(e) => set("privateItem", e.target.checked)} />
            Only me: hide this from others in {workspace?.name}
          </label>
        )}
        <Field label="Tags" hint="Comma separated" className="sm:col-span-2">
          <input className="input" placeholder="tax-2026, receipts" {...text("tags")} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <textarea className="input min-h-24" {...text("notes")} />
        </Field>
      </div>

      {purchase && (
        <div className="card p-4">
          <button
            type="button"
            className="flex w-full items-center justify-between font-medium"
            aria-expanded={showFollowUps}
            onClick={() => setShowFollowUps(!showFollowUps)}
          >
            <span>Return window & warranty</span>
            <ChevronDown size={18} className={`transition-transform ${showFollowUps ? "rotate-180" : ""}`} />
          </button>
          {showFollowUps && (
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field label="Return by">
                <input type="date" className="input" {...text("returnBy")} />
              </Field>
              <Field label="Warranty until">
                <input type="date" className="input" {...text("warrantyUntil")} />
              </Field>
              <Field label="Remind me (days before)" hint="Default: 3 for returns, 14 for warranty">
                <input type="number" min={0} max={120} className="input" {...text("reminderDays")} />
              </Field>
            </div>
          )}
        </div>
      )}

      {s.type === "document" && (
        <div className="card p-4">
          <Field label="Remind me (days before expiry)" hint="Default: 30 days">
            <input type="number" min={0} max={120} className="input sm:w-40" {...text("reminderDays")} />
          </Field>
        </div>
      )}

      {s.type === "expense" && (
        <div className="card space-y-4 p-4">
          <label className="flex items-center gap-2 font-medium">
            <input type="checkbox" className="h-5 w-5" checked={s.reimbursable} onChange={(e) => set("reimbursable", e.target.checked)} />
            Someone owes me for this (reimbursable or split)
          </label>
          {s.reimbursable && (
            <div className="grid gap-4 sm:grid-cols-2">
              <p className="text-sm text-muted sm:col-span-2">
                Owed by: <span className="font-medium text-text">{s.organization.trim() || "set Organization above"}</span>
              </p>
              <Field label="Amount owed to me" hint="Leave blank for the full amount. For a split, enter their share.">
                <input className="input" inputMode="decimal" placeholder={s.amount || "Full amount"} {...text("owedAmount")} />
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
                <Field label="Submitted / asked on">
                  <input type="date" className="input" {...text("submittedAt")} />
                </Field>
              )}
              {(s.status === "partial" || s.status === "reimbursed") && (
                <>
                  <Field label="Amount paid back">
                    <input className="input" inputMode="decimal" {...text("reimbursedAmount")} />
                  </Field>
                  <Field label="Paid back on">
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
