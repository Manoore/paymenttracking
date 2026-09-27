"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { minorToInput, parseMoney, todayInput, toDateInput } from "@/lib/format";
import { useSuggestions } from "@/lib/hooks";
import type { Schedule } from "@/lib/types";
import { ErrorNote, Field, SuggestInput } from "./ui";

const FREQS = [
  { label: "Monthly", unit: "month", interval: 1 },
  { label: "Quarterly", unit: "month", interval: 3 },
  { label: "Every 6 months", unit: "month", interval: 6 },
  { label: "Yearly", unit: "year", interval: 1 },
  { label: "Weekly", unit: "week", interval: 1 },
  { label: "Every 2 weeks", unit: "week", interval: 2 },
] as const;

export function ScheduleForm({ schedule, onSaved }: { schedule?: Schedule; onSaved?: () => void }) {
  const router = useRouter();
  const [s, setS] = useState({
    title: schedule?.title ?? "",
    counterparty: schedule?.counterparty ?? "",
    amount: minorToInput(schedule?.amountMinor),
    currency: schedule?.currency ?? "USD",
    category: schedule?.category ?? "",
    property: schedule?.property ?? "",
    method: schedule?.method ?? "",
    notes: schedule?.notes ?? "",
    freq: String(
      Math.max(0, FREQS.findIndex((f) => f.unit === schedule?.frequency.unit && f.interval === schedule?.frequency.interval)),
    ),
    nextDueDate: schedule ? toDateInput(schedule.nextDueDate) : todayInput(),
    reminderDaysBefore: String(schedule?.reminderDaysBefore ?? 3),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const counterparties = useSuggestions("counterparty");
  const categories = useSuggestions("category");
  const properties = useSuggestions("property");

  const bind = (k: keyof typeof s) => ({
    value: s[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setS((p) => ({ ...p, [k]: e.target.value })),
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const f = FREQS[Number(s.freq)];
    const body = {
      title: s.title.trim() || s.counterparty.trim() || "Recurring payment",
      counterparty: s.counterparty.trim() || null,
      amountMinor: parseMoney(s.amount) ?? null,
      currency: s.currency || "USD",
      category: s.category.trim() || null,
      property: s.property.trim() || null,
      method: s.method.trim() || null,
      notes: s.notes.trim() || null,
      frequency: { unit: f.unit, interval: f.interval },
      nextDueDate: s.nextDueDate,
      reminderDaysBefore: Number(s.reminderDaysBefore) || 0,
    };
    try {
      if (schedule) {
        await api.patch(`/recurring/${schedule._id}`, body);
        onSaved?.();
      } else {
        const created = await api.post<Schedule>("/recurring", body);
        router.push(`/recurring/${created._id}`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-6">
      <div className="card grid gap-4 p-4 sm:grid-cols-2">
        <Field label="Name">
          <input className="input" placeholder="e.g. Oak Grove HOA dues" required {...bind("title")} />
        </Field>
        <Field label="Paid to">
          <SuggestInput id="sched-cp" values={counterparties} {...bind("counterparty")} />
        </Field>
        <Field label="Usual amount">
          <div className="flex gap-2">
            <input className="input" inputMode="decimal" placeholder="0.00" {...bind("amount")} />
            <input className="input w-20 uppercase" maxLength={3} aria-label="Currency" {...bind("currency")} />
          </div>
        </Field>
        <Field label="How often">
          <select className="input" {...bind("freq")}>
            {FREQS.map((f, i) => (
              <option key={f.label} value={i}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Next due date">
          <input type="date" className="input" required {...bind("nextDueDate")} />
        </Field>
        <Field label="Remind me (days before)">
          <input type="number" min={0} max={60} className="input" {...bind("reminderDaysBefore")} />
        </Field>
        <Field label="Category">
          <SuggestInput id="sched-cat" values={categories} {...bind("category")} />
        </Field>
        <Field label="Property">
          <SuggestInput id="sched-prop" values={properties} {...bind("property")} />
        </Field>
        <Field label="Payment method">
          <input className="input" placeholder="Autopay, ACH…" {...bind("method")} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <textarea className="input min-h-20" placeholder="Account #, portal URL…" {...bind("notes")} />
        </Field>
      </div>
      {error && <ErrorNote message={error} />}
      <div className="flex gap-2">
        <button className="btn-primary" disabled={saving}>
          {saving && <Loader2 size={16} className="animate-spin" />} {schedule ? "Save changes" : "Create schedule"}
        </button>
        <button type="button" className="btn-ghost" onClick={() => (schedule ? onSaved?.() : router.back())}>
          Cancel
        </button>
      </div>
    </form>
  );
}
