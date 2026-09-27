"use client";

import { useRef, useState } from "react";
import { Camera, Download, FileText, Loader2, Trash2, Upload, X } from "lucide-react";
import { api, fileUrl } from "@/lib/api";
import { formatBytes } from "@/lib/format";
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

/** Gallery + upload for an existing record. */
export function AttachmentPanel({
  captureId,
  attachments,
  onChange,
}: {
  captureId: string;
  attachments: Attachment[];
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Attachment | null>(null);

  const add = async (files: File[]) => {
    setBusy(true);
    setError(null);
    try {
      await uploadFiles(files, captureId);
      onChange();
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
            </div>
          ))}
        </div>
      )}
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
