"use client";

import { useState } from "react";
import { CheckCircle2, KeyRound, Loader2, ScanText, Trash2, XCircle } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { ProviderId, ProviderInfo, ReaderSettings as Settings } from "@/lib/reader";
import { ErrorNote, Field, Section, Spinner } from "./ui";

/** Profile → Document reading: choose an AI provider, paste its API key, pick a model. */
export function ReaderSettings() {
  const settings = useApi<Settings>("/workspaces/current/reader");
  const providers = useApi<{ providers: ProviderInfo[] }>("/reader/providers");
  const [editing, setEditing] = useState(false);

  if (!settings.data || !providers.data) return <Section title="Document reading (AI)">{settings.error ? <ErrorNote message={settings.error} /> : <Spinner />}</Section>;
  const s = settings.data;

  return (
    <Section title="Document reading (AI)">
      <div className="card space-y-4 p-4">
        <div className="flex gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <ScanText size={20} />
          </span>
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium">Fill in forms from photos, screenshots and PDFs</p>
            <p className="text-muted">
              When you attach a receipt or bill, the AI provider you choose reads the amount, date, payee and confirmation number.
              You always check before saving. Files are sent to that provider using your own API key.
            </p>
          </div>
        </div>

        {s.configured && !editing && (
          <div className="rounded-lg border border-border p-3 text-sm">
            <p className="flex flex-wrap items-center gap-2">
              <CheckCircle2 size={16} className="text-ok" />
              <span className="font-medium">{s.providerLabel}</span>
              <span className="text-muted">· {s.model}</span>
              <span className="font-mono text-xs text-muted">{s.keyHint}</span>
            </p>
            <p className="mt-1 text-muted">
              {s.autoRead ? "Reads automatically when you attach a file" : "Reads only when you tap “Read with AI”"} · {s.usedThisMonth}/{s.monthlyLimit} reads
              this month
            </p>
            {s.baseUrl && <p className="mt-1 break-all text-xs text-muted">{s.baseUrl}</p>}
          </div>
        )}

        {!s.configured && !editing && (
          <p className="text-sm text-muted">
            Not set up{s.canManage ? "." : ". Ask the owner of this space to add an API key."}
          </p>
        )}

        {s.canManage &&
          (editing ? (
            <ReaderForm
              settings={s}
              providers={providers.data.providers}
              onCancel={() => setEditing(false)}
              onSaved={() => {
                setEditing(false);
                void settings.reload();
              }}
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" onClick={() => setEditing(true)}>
                <KeyRound size={16} /> {s.configured ? "Change provider, key or model" : "Set up with an API key"}
              </button>
              {s.configured && (
                <button
                  className="btn-ghost text-danger"
                  onClick={async () => {
                    if (!confirm("Remove the API key? Files will no longer be read automatically.")) return;
                    await api.del("/workspaces/current/reader");
                    void settings.reload();
                  }}
                >
                  <Trash2 size={16} /> Remove key
                </button>
              )}
            </div>
          ))}
      </div>
    </Section>
  );
}

const OTHER = "__other__";

function ReaderForm({
  settings,
  providers,
  onCancel,
  onSaved,
}: {
  settings: Settings;
  providers: ProviderInfo[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [provider, setProvider] = useState<ProviderId>(settings.provider ?? "openai");
  const info = providers.find((p) => p.id === provider)!;
  const sameProvider = provider === settings.provider;
  const [model, setModel] = useState(sameProvider ? (settings.model ?? info.defaultModel) : info.defaultModel);
  // A saved model that isn't in the curated list shows as "Other…" with its name.
  const [customModel, setCustomModel] = useState(Boolean(model) && !info.models.includes(model));
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl ?? "");
  const [apiKey, setApiKey] = useState("");
  const [autoRead, setAutoRead] = useState(settings.autoRead);
  const [limit, setLimit] = useState(String(settings.monthlyLimit));
  const [busy, setBusy] = useState<"test" | "save" | null>(null);
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const changeProvider = (p: ProviderId) => {
    setProvider(p);
    const next = providers.find((x) => x.id === p)!;
    const m = p === settings.provider ? (settings.model ?? next.defaultModel) : next.defaultModel;
    setModel(m);
    setCustomModel(Boolean(m) && !next.models.includes(m));
    setTest(null);
  };
  const body = () => ({
    provider,
    model: model.trim() || undefined,
    baseUrl: info.needsBaseUrl ? baseUrl.trim() || null : undefined,
    apiKey: apiKey.trim() || undefined,
    autoRead,
    monthlyLimit: Number(limit) || 200,
  });

  const run = async (kind: "test" | "save") => {
    setBusy(kind);
    setError(null);
    try {
      if (kind === "test") setTest(await api.post<{ ok: boolean; message: string }>("/workspaces/current/reader/test", body()));
      else {
        await api.put("/workspaces/current/reader", body());
        onSaved();
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <span className="label">Provider</span>
        <div className="flex flex-wrap gap-2" role="radiogroup">
          {providers.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={provider === p.id}
              onClick={() => changeProvider(p.id)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                provider === p.id ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface text-muted hover:text-text"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="API key" hint={sameProvider && settings.keyHint ? `Saved: ${settings.keyHint}. Leave blank to keep it.` : info.keyHint}>
          <input
            className="input font-mono"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={sameProvider && settings.keyHint ? "••••••••" : "Paste your key"}
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setTest(null);
            }}
          />
        </Field>
        <Field
          label="Model"
          hint={info.models.length ? "Choose “Other” to use a model that isn't in the list" : "Model name at your provider"}
        >
          {info.models.length > 0 && (
            <select
              className="input"
              value={customModel ? OTHER : model}
              onChange={(e) => {
                if (e.target.value === OTHER) {
                  setCustomModel(true);
                  setModel("");
                } else {
                  setCustomModel(false);
                  setModel(e.target.value);
                }
                setTest(null);
              }}
            >
              {info.models.map((m) => (
                <option key={m} value={m}>
                  {m}
                  {m === info.defaultModel ? " (recommended)" : ""}
                </option>
              ))}
              <option value={OTHER}>Other… (type a model name)</option>
            </select>
          )}
          {(customModel || info.models.length === 0) && (
            <input
              className={`input ${info.models.length ? "mt-2" : ""}`}
              value={model}
              autoFocus={customModel}
              onChange={(e) => setModel(e.target.value)}
              placeholder="exact model name, e.g. gpt-5.1"
            />
          )}
        </Field>
        {info.needsBaseUrl && (
          <Field label="Service URL" hint="The OpenAI-style API base, e.g. https://openrouter.ai/api/v1" className="sm:col-span-2">
            <input className="input" type="url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://" />
          </Field>
        )}
        <Field label="Monthly limit (reads)" hint="Protects against surprise bills. Re-reading the same file is free.">
          <input className="input" type="number" min={1} value={limit} onChange={(e) => setLimit(e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 self-center text-sm">
          <input type="checkbox" className="h-5 w-5" checked={autoRead} onChange={(e) => setAutoRead(e.target.checked)} />
          Read automatically when I attach a file
        </label>
      </div>
      {test && (
        <p className={`flex items-center gap-2 text-sm ${test.ok ? "text-ok" : "text-danger"}`}>
          {test.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />} {test.message}
        </p>
      )}
      {error && <ErrorNote message={error} />}
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={busy !== null} onClick={() => void run("save")}>
          {busy === "save" && <Loader2 size={16} className="animate-spin" />} Save
        </button>
        <button className="btn-secondary" disabled={busy !== null} onClick={() => void run("test")}>
          {busy === "test" && <Loader2 size={16} className="animate-spin" />} Test key
        </button>
        <button className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <p className="text-xs text-muted">Your key is encrypted on the server and never shown again in full.</p>
    </div>
  );
}
