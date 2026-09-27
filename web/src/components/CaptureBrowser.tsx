"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download, Search, SlidersHorizontal, X } from "lucide-react";
import { api } from "@/lib/api";
import { STATUS_LABELS, TYPE_LABELS } from "@/lib/format";
import { useApi, useDebounced, useSuggestions } from "@/lib/hooks";
import type { Capture, Paged } from "@/lib/types";
import { CaptureList, Empty, ErrorNote, Spinner } from "./ui";

const FILTER_KEYS = ["type", "from", "to", "category", "counterparty", "property", "trip", "tag", "reimbursementStatus", "cleared"] as const;

/**
 * Search + filter list backed by URL params, so any filtered view can be
 * bookmarked or shared between devices. `fixed` params (e.g. inbox) always apply.
 */
export function CaptureBrowser({ fixed = {}, showFilters = true }: { fixed?: Record<string, string>; showFilters?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [open, setOpen] = useState(false);
  const debouncedQ = useDebounced(q);
  const page = Number(params.get("page") ?? 1);

  const current: Record<string, string> = {};
  for (const k of FILTER_KEYS) {
    const v = params.get(k);
    if (v) current[k] = v;
  }
  const activeCount = Object.keys(current).length;

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== "page") next.delete("page");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  useEffect(() => {
    if ((params.get("q") ?? "") !== debouncedQ) setParam("q", debouncedQ || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ]);

  const query = { ...current, ...fixed, q: debouncedQ, page, limit: 30 };
  const { data, error, loading } = useApi<Paged<Capture>>("/captures", query);

  const categories = useSuggestions("category");
  const properties = useSuggestions("property");
  const trips = useSuggestions("trip");
  const counterparties = useSuggestions("counterparty");

  const select = (k: string, label: string, options: [string, string][]) => (
    <label className="block">
      <span className="label">{label}</span>
      <select className="input" value={current[k] ?? ""} onChange={(e) => setParam(k, e.target.value || null)}>
        <option value="">Any</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
  const pairs = (vals: string[]) => vals.map((v) => [v, v] as [string, string]);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div>
      <div className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="input pl-10"
            type="search"
            placeholder="Search payee, property, notes, confirmation #…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search"
          />
        </div>
        {showFilters && (
          <button className="btn-secondary" onClick={() => setOpen(!open)} aria-expanded={open}>
            <SlidersHorizontal size={18} />
            <span className="hidden sm:inline">Filters</span>
            {activeCount > 0 && <span className="chip bg-accent text-white dark:text-bg">{activeCount}</span>}
          </button>
        )}
        <button
          className="btn-secondary"
          title="Export these results to CSV"
          onClick={() => void api.download("/reports/export.csv", { ...current, ...fixed, q: debouncedQ }, "capture-hub-export.csv")}
        >
          <Download size={18} />
          <span className="hidden sm:inline">CSV</span>
        </button>
      </div>

      {showFilters && open && (
        <div className="card mb-4 grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {select("type", "Type", Object.entries(TYPE_LABELS))}
          <label className="block">
            <span className="label">From</span>
            <input type="date" className="input" value={current.from ?? ""} onChange={(e) => setParam("from", e.target.value || null)} />
          </label>
          <label className="block">
            <span className="label">To</span>
            <input type="date" className="input" value={current.to ?? ""} onChange={(e) => setParam("to", e.target.value || null)} />
          </label>
          {select("category", "Category", pairs(categories))}
          {select("counterparty", "Payee / merchant / payer", pairs(counterparties))}
          {select("property", "Property", pairs(properties))}
          {select("trip", "Trip / project", pairs(trips))}
          {select("reimbursementStatus", "Reimbursement", Object.entries(STATUS_LABELS))}
          {select("cleared", "Deposit", [
            ["false", "Not cleared"],
            ["true", "Cleared"],
          ])}
          {activeCount > 0 && (
            <button className="btn-ghost self-end" onClick={() => router.replace(pathname)}>
              <X size={16} /> Clear filters
            </button>
          )}
        </div>
      )}

      {error && <ErrorNote message={error} />}
      {loading && !data ? (
        <Spinner />
      ) : data && data.items.length ? (
        <>
          <p className="mb-2 text-sm text-muted">
            {data.total} result{data.total === 1 ? "" : "s"}
          </p>
          <div className={loading ? "opacity-60" : ""}>
            <CaptureList items={data.items} />
          </div>
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-3 text-sm">
              <button className="btn-secondary" disabled={page <= 1} onClick={() => setParam("page", String(page - 1))}>
                Previous
              </button>
              <span className="text-muted">
                Page {page} of {totalPages}
              </span>
              <button className="btn-secondary" disabled={page >= totalPages} onClick={() => setParam("page", String(page + 1))}>
                Next
              </button>
            </div>
          )}
        </>
      ) : (
        <Empty title={q || activeCount ? "No matches" : "Nothing here yet"} body={q ? "Try a different word or clear filters." : undefined} />
      )}
    </div>
  );
}
