"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Pencil, SkipForward, StopCircle } from "lucide-react";
import { FilePicker, PendingFiles, uploadFiles } from "@/components/Attachments";
import { ScheduleForm } from "@/components/ScheduleForm";
import { CaptureList, Empty, ErrorNote, Field, PageHeader, Section, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { daysUntil, formatDate, formatMoney, frequencyLabel, minorToInput, parseMoney, relativeDue, todayInput } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { Capture, Schedule } from "@/lib/types";

function PayForm({ s, onDone, onCancel }: { s: Schedule; onDone: () => void; onCancel: () => void }) {
  const [paidAt, setPaidAt] = useState(todayInput());
  const [amount, setAmount] = useState(minorToInput(s.amountMinor));
  const [method, setMethod] = useState(s.method ?? "");
  const [confirmation, setConfirmation] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const uploaded = await uploadFiles(files);
      await api.post(`/recurring/${s._id}/pay`, {
        paidAt,
        amountMinor: parseMoney(amount),
        method: method || undefined,
        confirmationNumber: confirmation || undefined,
        attachmentIds: uploaded.map((a) => a._id),
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not record payment");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="card mb-6 space-y-4 border-accent/40 p-4">
      <p className="font-medium">Record payment due {formatDate(s.nextDueDate)}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Paid on">
          <input type="date" className="input" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} required />
        </Field>
        <Field label={`Amount (${s.currency})`}>
          <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Method">
          <input className="input" value={method} onChange={(e) => setMethod(e.target.value)} />
        </Field>
        <Field label="Confirmation #">
          <input className="input" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
        </Field>
      </div>
      <div>
        <span className="label">Proof</span>
        <FilePicker onFiles={(f) => setFiles((p) => [...p, ...f])} disabled={busy} />
        <PendingFiles files={files} onRemove={(i) => setFiles((p) => p.filter((_, j) => j !== i))} />
      </div>
      {error && <ErrorNote message={error} />}
      <div className="flex gap-2">
        <button className="btn-primary" disabled={busy}>
          {busy && <Loader2 size={16} className="animate-spin" />} Save payment
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function SchedulePage({ params }: PageProps<"/recurring/[id]">) {
  const { id } = use(params);
  const router = useRouter();
  const { data: s, error, loading, reload } = useApi<Schedule & { history: Capture[] }>(`/recurring/${id}`);
  const [mode, setMode] = useState<"view" | "pay" | "edit">("view");

  if (loading && !s) return <Spinner />;
  if (error) return <ErrorNote message={error} />;
  if (!s) return null;

  if (mode === "edit") {
    return (
      <>
        <PageHeader title="Edit schedule" />
        <ScheduleForm
          schedule={s}
          onSaved={() => {
            setMode("view");
            void reload();
          }}
        />
      </>
    );
  }

  const overdue = daysUntil(s.nextDueDate) < 0;
  const skip = async () => {
    if (!confirm(`Skip the payment due ${formatDate(s.nextDueDate)}?`)) return;
    await api.post(`/recurring/${s._id}/skip`);
    void reload();
  };
  const stop = async () => {
    if (!confirm("Stop this schedule? Its payment history is kept.")) return;
    await api.del(`/recurring/${s._id}`);
    router.push("/recurring");
  };

  return (
    <>
      <PageHeader
        title={s.title}
        subtitle={[s.counterparty, frequencyLabel(s.frequency), s.property].filter(Boolean).join(" · ")}
      />

      <div className="card mb-6 flex flex-wrap items-center gap-4 p-4">
        <div className="flex-1">
          <p className="text-sm text-muted">{s.active ? "Next due" : "Stopped"}</p>
          {s.active && (
            <p className={`text-lg font-semibold ${overdue ? "text-danger" : ""}`}>
              {formatDate(s.nextDueDate)} <span className="text-sm font-normal">({relativeDue(s.nextDueDate)})</span>
            </p>
          )}
        </div>
        {s.amountMinor != null && <p className="text-xl font-semibold tabular-nums">{formatMoney(s.amountMinor, s.currency)}</p>}
      </div>

      {mode === "pay" ? (
        <PayForm
          s={s}
          onCancel={() => setMode("view")}
          onDone={() => {
            setMode("view");
            void reload();
          }}
        />
      ) : (
        <div className="mb-6 flex flex-wrap gap-2">
          {s.active && (
            <button className="btn-primary" onClick={() => setMode("pay")}>
              <CheckCircle2 size={16} /> Mark paid
            </button>
          )}
          {s.active && (
            <button className="btn-secondary" onClick={() => void skip()}>
              <SkipForward size={16} /> Skip
            </button>
          )}
          <button className="btn-secondary" onClick={() => setMode("edit")}>
            <Pencil size={16} /> Edit
          </button>
          {s.active && (
            <button className="btn-danger ml-auto" onClick={() => void stop()}>
              <StopCircle size={16} /> Stop
            </button>
          )}
        </div>
      )}

      {s.notes && (
        <Section title="Notes">
          <p className="card whitespace-pre-wrap p-4 text-sm">{s.notes}</p>
        </Section>
      )}

      <Section title="Payment history">
        {s.history.length ? <CaptureList items={s.history} /> : <Empty title="No payments recorded yet" />}
      </Section>
    </>
  );
}
