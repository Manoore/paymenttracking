"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { ErrorNote, Field } from "./ui";

export interface SavedProperty {
  id?: string;
  name: string;
  address?: string;
  notes?: string;
}

/** Add or edit a property (name, address, notes). Renaming updates every record that uses it. */
export function PropertyForm({
  property,
  onSaved,
  onCancel,
}: {
  property?: SavedProperty;
  onSaved: (p: SavedProperty) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(property?.name ?? "");
  const [address, setAddress] = useState(property?.address ?? "");
  const [notes, setNotes] = useState(property?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = { name: name.trim(), address: address.trim() || null, notes: notes.trim() || null };
    try {
      const saved = property?.id
        ? await api.patch<SavedProperty>(`/properties/${property.id}`, body)
        : await api.post<SavedProperty>("/properties", body);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="card space-y-4 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Property name" hint="Short name you'll pick on bills, e.g. “Oak Grove” or “Home”">
          <input className="input" required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Address (optional)">
          <input className="input" autoComplete="street-address" value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <Field label="Notes (optional)" hint="HOA contact, parcel #, insurance policy…" className="sm:col-span-2">
          <textarea className="input min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      {property?.id && name.trim() !== property.name && (
        <p className="text-sm text-muted">Renaming also updates every payment, expense and bill that uses “{property.name}”.</p>
      )}
      {error && <ErrorNote message={error} />}
      <div className="flex gap-2">
        <button className="btn-primary" disabled={busy || !name.trim()}>
          {busy && <Loader2 size={16} className="animate-spin" />} {property?.id ? "Save" : "Add property"}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
