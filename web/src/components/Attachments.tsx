"use client";

import { useRef, useState } from "react";
import { Camera, Download, FileText, Loader2, Trash2, Upload, X, ScanText } from "lucide-react";
import { api, fileUrl } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { isReadable, readAttachment, type Extraction } from "@/lib/reader";
import { useWorkspace } from "./WorkspaceContext";
import { prepareForUpload } from "@/lib/image";
import type { Attachment } from "@/lib/types";

const ACCEPT = "image/*,application/pdf";

/** Buttons for "take photo" (opens camera on phones) and "choose file". */
export function FilePicker({ onFiles, disabled }: { onFiles: (files: File[]) => void; disabled?: boolean }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length) onFiles(files);
  };
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className="btn-secondary md:hidden" disabled={disabled} onClick={() => cameraRef.current?.click()}>
        <Camera size={18} /> Take photo
      </button>
      <button type="button" className="btn-secondary" disabled={disabled} onClick={() => fileRef.current?.click()}>
        <Upload size={18} /> Add screenshot / PDF
      </button>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={handle} />
      <input ref={fileRef} type="file" accept={ACCEPT} multiple hidden onChange={handle} />
    </div>
  );
}

export function PendingFiles({ files, onRemove }: { files: File[]; onRemove: (i: number) => void }) {
  if (!files.length) return null;
  return (
    <ul className="mt-3 space-y-2">
      {files.map((f, i) => (
        <li key={`${f.name}-${i}`} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
          <FileText size={16} className="text-muted" />
          <span className="min-w-0 flex-1 truncate">{f.name}</span>
          <span className="text-muted">{formatBytes(f.size)}</span>
          <button type="button" aria-label={`Remove ${f.name}`} onClick={() => onRemove(i)} className="text-muted hover:text-danger">
            <X size={16} />
          </button>
        </li>
      ))}
    </ul>
  );
}

export async function uploadFiles(files: File[], captureId?: string) {
  if (!files.length) return [];
  const form = new FormData();
  if (captureId) form.append("captureId", captureId);
  for (const f of files) form.append("files", await prepareForUpload(f));
  const res = await api.upload<{ items: Attachment[] }>("/attachments", form);
  return res.items;
}

const FIELD_LABELS: [keyof Extraction, string][] = [
  ["counterparty", "Payee / merchant"],
  ["amount", "Amount"],
  ["date", "Date"],
  ["dueDate", "Due date"],
  ["expiresAt", "Expires"],
  ["confirmationNumber", "Confirmation #"],
  ["checkNumber", "Check #"],
  ["category", "Category"],
];

/** What document reading found in one file, with a button to copy it into empty fields. */
function ReadingCard({ x, onApply, applying }: { x: Extraction; onApply?: () => void; applying: boolean }) {
  const rows = FIELD_LABELS.filter(([k]) => x[k] !== null && x[k] !== "");
  return (
    <div className="mt-2 rounded-lg border border-accent/40 bg-accent-soft/40 p-3 text-sm">
      <p className="mb-2 flex items-center gap-2 font-medium text-accent">
        <ScanText size={16} /> Found in this file{x.confidence === "low" ? " (hard to read, so check it)" : ""}
      </p>
      {rows.length ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {rows.map(([k, label]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{label}</dt>
              <dd className="break-words">{k === "amount" ? `${x.currency ?? ""} ${Number(x.amount).toFixed(2)}`.trim() : String(x[k])}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-muted">No amounts or dates found. The text is now searchable.</p>
      )}
      {onApply && rows.length > 0 && (
        <button type="button" className="btn-secondary mt-3 min-h-9 py-1.5" disabled={applying} onClick={onApply}>
          {applying && <Loader2 size={14} className="animate-spin" />} Fill empty fields on this record
        </button>
      )}
    </div>
  );
}

/** Gallery + upload for an existing record. */
export function AttachmentPanel({
  captureId,
  attachments,
  onChange,
  onApplyReading,
}: {
  captureId: string;
  attachments: Attachment[];
  onChange: () => void;
  /** Copy a reading into the record's empty fields. */
  onApplyReading?: (x: Extraction) => Promise<void>;
}) {
  const { reader } = useWorkspace();
  const [readingId, setReadingId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const readOne = async (a: Attachment) => {
    setReadingId(a._id);
    setReadError(null);
    try {
      await readAttachment(a._id);
      onChange();
    } catch (e) {
      setReadError(e instanceof Error ? e.message : "Could not read this file");
    } finally {
      setReadingId(null);
    }
  };
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Attachment | null>(null);

  const add = async (files: File[]) => {
    setBusy(true);
    setError(null);
    try {
      const created = await uploadFiles(files, captureId);
      onChange();
      // Same as New capture: read the first readable new file straight away.
      const first = created.find((a) => isReadable(a) && !a.extraction);
      if (first && reader?.configured && reader.autoRead) void readOne(first);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (a: Attachment) => {
    if (!confirm(`Remove ${a.filename}?`)) return;
    await api.del(`/attachments/${a._id}`);
    onChange();
  };

  return (
    <div>
      {attachments.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {attachments.map((a) => (
            <div key={a._id} className="group relative overflow-hidden rounded-lg border border-border bg-surface-2">
              <button type="button" onClick={() => setPreview(a)} className="block aspect-[4/3] w-full">
                {a.mimeType.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fileUrl(a.url)} alt={a.filename} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <span className="flex h-full flex-col items-center justify-center gap-2 text-muted">
                    <FileText size={28} />
                    <span className="text-xs">PDF</span>
                  </span>
                )}
              </button>
              <div className="flex items-center gap-1 border-t border-border bg-surface px-2 py-1.5 text-xs">
                <span className="min-w-0 flex-1 truncate" title={a.filename}>
                  {a.filename}
                </span>
                <a href={`${fileUrl(a.url)}&download=1`} aria-label="Download" className="p-1 text-muted hover:text-text">
                  <Download size={14} />
                </a>
                <button type="button" aria-label="Remove" onClick={() => void remove(a)} className="p-1 text-muted hover:text-danger">
                  <Trash2 size={14} />
                </button>
              </div>
              {reader?.configured && isReadable(a) && !a.extraction && (
                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-1 border-t border-border bg-surface px-2 py-1.5 text-xs font-medium text-accent hover:bg-accent-soft"
                  disabled={readingId !== null}
                  onClick={() => void readOne(a)}
                >
                  {readingId === a._id ? <Loader2 size={12} className="animate-spin" /> : <ScanText size={12} />}
                  {readingId === a._id ? "Reading…" : "Read with AI"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {readError && <p className="mb-3 text-sm text-danger [overflow-wrap:anywhere]">{readError}</p>}
      {attachments
        .filter((a) => a.extraction?.fields)
        .slice(0, 1)
        .map((a) => (
          <ReadingCard
            key={a._id}
            x={a.extraction!.fields}
            applying={applying}
            onApply={
              onApplyReading
                ? async () => {
                    setApplying(true);
                    try {
                      await onApplyReading(a.extraction!.fields);
                    } finally {
                      setApplying(false);
                    }
                  }
                : undefined
            }
          />
        ))}
      <FilePicker onFiles={(f) => void add(f)} disabled={busy} />
      {busy && (
        <p className="mt-2 flex items-center gap-2 text-sm text-muted">
          <Loader2 size={14} className="animate-spin" /> Uploading…
        </p>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      {preview && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4"
          role="dialog"
          aria-label={preview.filename}
          onClick={() => setPreview(null)}
        >
          <div className="mb-3 flex items-center justify-between text-white">
            <span className="truncate text-sm">{preview.filename}</span>
            <button className="p-2" aria-label="Close preview">
              <X />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center" onClick={(e) => e.stopPropagation()}>
            {preview.mimeType.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fileUrl(preview.url)} alt={preview.filename} className="max-h-full max-w-full object-contain" />
            ) : (
              <iframe src={fileUrl(preview.url)} title={preview.filename} className="h-full w-full rounded bg-white" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
