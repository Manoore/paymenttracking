"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ExternalLink, Lightbulb, MapPin, Plus } from "lucide-react";
import { Empty, ErrorNote, PageHeader, Spinner } from "@/components/ui";
import { useWorkspace } from "@/components/WorkspaceContext";
import { fileUrl } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { Capture, Paged } from "@/lib/types";

type Item = Capture & { thumbUrl?: string | null };
type Tab = "places" | "ideas";

const PLACE_KINDS: [string, string][] = [
  ["restaurant", "🍽️ Food"],
  ["stay", "🏨 Stays"],
  ["sight", "📸 Sights"],
  ["shop", "🛍️ Shops"],
  ["other", "Other"],
];
const IDEA_KINDS: [string, string][] = [
  ["product", "Products"],
  ["design", "Design"],
  ["gift", "Gifts"],
  ["other", "Other"],
];

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium ${
        active ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface text-muted hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}

function Thumb({ item, icon: Icon }: { item: Item; icon: typeof MapPin }) {
  return item.thumbUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={fileUrl(item.thumbUrl)} alt="" className="aspect-[4/3] w-full object-cover" loading="lazy" />
  ) : (
    <div className="flex aspect-[4/3] w-full items-center justify-center bg-surface-2 text-muted">
      <Icon size={32} />
    </div>
  );
}

function PlaceCard({ p }: { p: Item }) {
  const mapHref = p.place?.mapUrl || (p.place?.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.place.address)}` : null);
  return (
    <div className="card overflow-hidden">
      <Link href={`/captures/${p._id}`} className="block">
        <Thumb item={p} icon={MapPin} />
        <div className="p-4 pb-2">
          <p className="truncate font-semibold">{p.title}</p>
          <p className="truncate text-sm text-muted">{[p.place?.address, p.trip].filter(Boolean).join(" · ") || "No address yet"}</p>
          <p className="mt-1 text-sm">
            {p.place?.visited ? (
              <span className="text-ok">
                Been there{p.place.rating ? ` · ${"★".repeat(p.place.rating)}${"☆".repeat(5 - p.place.rating)}` : ""}
              </span>
            ) : (
              <span className="text-accent">Want to go</span>
            )}
          </p>
        </div>
      </Link>
      {mapHref && (
        <a href={mapHref} target="_blank" rel="noreferrer noopener" className="mx-4 mb-3 inline-flex items-center gap-1 text-sm text-accent">
          Open in Maps <ExternalLink size={14} />
        </a>
      )}
    </div>
  );
}

function IdeaCard({ i }: { i: Item }) {
  const status = i.idea?.status ?? "want";
  return (
    <div className="card overflow-hidden">
      <Link href={`/captures/${i._id}`} className="block">
        <Thumb item={i} icon={Lightbulb} />
        <div className="p-4 pb-2">
          <p className="truncate font-semibold">{i.title}</p>
          <p className="truncate text-sm text-muted">
            {[i.counterparty, i.amountMinor != null ? formatMoney(i.amountMinor, i.currency) : null, i.trip].filter(Boolean).join(" · ") ||
              `Saved ${formatDate(i.occurredAt ?? i.createdAt)}`}
          </p>
          <p className="mt-1 text-sm">
            {status === "done" ? <span className="text-ok">Done / bought</span> : status === "dropped" ? <span className="text-muted">Dropped</span> : <span className="text-accent">Want</span>}
          </p>
        </div>
      </Link>
      {i.url && (
        <a href={i.url} target="_blank" rel="noreferrer noopener" className="mx-4 mb-3 inline-flex items-center gap-1 text-sm text-accent">
          Open link <ExternalLink size={14} />
        </a>
      )}
    </div>
  );
}

function PlacesAndIdeas() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab: Tab = params.get("tab") === "ideas" ? "ideas" : "places";
  const { canWrite } = useWorkspace();
  const [kind, setKind] = useState<string | null>(null);
  const [trip, setTrip] = useState<string>("");
  const [state, setState] = useState<"all" | "open" | "done">("all");

  const { data, error, loading } = useApi<Paged<Item>>("/captures", { type: tab === "places" ? "place" : "idea", thumbs: 1, limit: 100 });
  const items = useMemo(() => data?.items ?? [], [data]);
  const trips = useMemo(() => [...new Set(items.map((i) => i.trip).filter(Boolean) as string[])].sort(), [items]);

  const shown = items.filter((i) => {
    if (kind && (tab === "places" ? i.place?.kind ?? "other" : i.idea?.kind ?? "other") !== kind) return false;
    if (trip && i.trip !== trip) return false;
    if (state !== "all") {
      const done = tab === "places" ? Boolean(i.place?.visited) : i.idea?.status === "done";
      if ((state === "done") !== done) return false;
    }
    return true;
  });

  const switchTab = (t: Tab) => {
    setKind(null);
    setTrip("");
    setState("all");
    router.replace(`${pathname}?tab=${t}`, { scroll: false });
  };

  const addHref = `/new?type=${tab === "places" ? "place" : "idea"}`;
  const kinds = tab === "places" ? PLACE_KINDS : IDEA_KINDS;

  return (
    <>
      <PageHeader
        title="Places & ideas"
        subtitle="Restaurants, stays and spots to visit; products, designs and gift ideas to remember."
        actions={
          canWrite && (
            <Link href={addHref} className="btn-primary">
              <Plus size={18} /> {tab === "places" ? "Add place" : "Add idea"}
            </Link>
          )
        }
      />

      <div className="mb-4 inline-flex rounded-lg border border-border bg-surface p-1" role="tablist">
        {(["places", "ideas"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => switchTab(t)}
            className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium ${tab === t ? "bg-accent-soft text-accent" : "text-muted"}`}
          >
            {t === "places" ? <MapPin size={16} /> : <Lightbulb size={16} />} {t === "places" ? "Places" : "Ideas"}
          </button>
        ))}
      </div>

      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
        <Chip active={kind === null} onClick={() => setKind(null)}>
          All
        </Chip>
        {kinds.map(([v, l]) => (
          <Chip key={v} active={kind === v} onClick={() => setKind(kind === v ? null : v)}>
            {l}
          </Chip>
        ))}
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {(["all", "open", "done"] as const).map((s) => (
          <Chip key={s} active={state === s} onClick={() => setState(s)}>
            {s === "all" ? "Any" : tab === "places" ? (s === "open" ? "Want to go" : "Been there") : s === "open" ? "Want" : "Done"}
          </Chip>
        ))}
        {trips.length > 0 && (
          <select className="input min-h-9 w-auto py-1 text-sm" value={trip} onChange={(e) => setTrip(e.target.value)} aria-label="Trip">
            <option value="">All trips</option>
            {trips.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        )}
      </div>

      {error && <ErrorNote message={error} />}
      {loading && !data ? (
        <Spinner />
      ) : shown.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((i) => (tab === "places" ? <PlaceCard key={i._id} p={i} /> : <IdeaCard key={i._id} i={i} />))}
        </div>
      ) : (
        <Empty
          title={items.length ? "Nothing matches these filters" : tab === "places" ? "No places saved yet" : "No ideas saved yet"}
          body={
            items.length
              ? undefined
              : tab === "places"
                ? "Save restaurants, hotels and spots you want to visit: a screenshot, a map link, or just a name."
                : "Save products to buy, design inspiration and gift ideas with a photo or link."
          }
          action={
            canWrite && !items.length ? (
              <Link href={addHref} className="btn-primary">
                <Plus size={18} /> {tab === "places" ? "Add your first place" : "Add your first idea"}
              </Link>
            ) : undefined
          }
        />
      )}
    </>
  );
}

export default function PlacesPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <PlacesAndIdeas />
    </Suspense>
  );
}
