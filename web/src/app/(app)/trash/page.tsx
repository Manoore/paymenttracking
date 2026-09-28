"use client";

import { useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { Empty, ErrorNote, PageHeader, Spinner, TypeIcon } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { Capture } from "@/lib/types";

export default function TrashPage() {
  const { data, error, loading, reload } = useApi<{ items: (Capture & { deletedAt: string })[] }>("/captures/trash");
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (id: string, action: "restore" | "forever") => {
    if (action === "forever" && !confirm("Delete forever? This also removes its attachments and cannot be undone.")) return;
    setBusy(id);
    try {
      if (action === "restore") await api.post(`/captures/${id}/restore`);
      else await api.del(`/captures/${id}/permanent`);
      await reload();
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader title="Trash" subtitle="Deleted records stay here until you restore them or delete them forever." />
      {error && <ErrorNote message={error} />}
      {loading && !data ? (
        <Spinner />
      ) : data?.items.length ? (
        <div className="card divide-y divide-border overflow-hidden">
          {data.items.map((c) => (
            <div key={c._id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <TypeIcon type={c.type} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{c.title}</p>
                <p className="text-sm text-muted">
                  Deleted {formatDate(c.deletedAt)}
                  {c.amountMinor != null && ` · ${formatMoney(c.amountMinor, c.currency)}`}
                </p>
              </div>
              <button className="btn-secondary min-h-9 py-1.5" disabled={busy === c._id} onClick={() => void act(c._id, "restore")}>
                <RotateCcw size={14} /> Restore
              </button>
              <button className="btn-ghost min-h-9 py-1.5 text-danger" disabled={busy === c._id} onClick={() => void act(c._id, "forever")}>
                <Trash2 size={14} /> Delete forever
              </button>
            </div>
          ))}
        </div>
      ) : (
        <Empty title="Trash is empty" />
      )}
    </>
  );
}
