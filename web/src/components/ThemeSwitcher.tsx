"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { ACCENT_KEY, ACCENTS, THEME_KEY as KEY, type AccentId, type ThemePref } from "@/lib/theme";

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function apply(pref: ThemePref) {
  const dark = pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

const OPTIONS: { value: ThemePref; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
  { value: "dark", label: "Dark", icon: Moon },
];

export function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const [pref, setPref] = useState<ThemePref>("system");

  useEffect(() => {
    // Read the saved choice after mount (localStorage isn't available during SSR).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPref(readPref());
  }, []);

  const choose = (p: ThemePref) => {
    setPref(p);
    try {
      localStorage.setItem(KEY, p);
    } catch {}
    apply(p);
  };

  return (
    <div role="radiogroup" aria-label="Color theme" className="inline-flex rounded-lg border border-border bg-surface p-1">
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={pref === value}
          title={label}
          onClick={() => choose(value)}
          className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium ${
            pref === value ? "bg-accent-soft text-accent" : "text-muted hover:text-text"
          }`}
        >
          <Icon size={16} />
          {!compact && label}
        </button>
      ))}
    </div>
  );
}

function applyAccent(id: AccentId) {
  const root = document.documentElement;
  if (id === "indigo") root.removeAttribute("data-accent");
  else root.setAttribute("data-accent", id);
}

function readAccent(): AccentId {
  try {
    const v = localStorage.getItem(ACCENT_KEY);
    return (ACCENTS.find((a) => a.id === v)?.id ?? "indigo") as AccentId;
  } catch {
    return "indigo";
  }
}

/** Five colour palettes for buttons, highlights and the Home header. Saved on this device. */
export function AccentPicker() {
  const [accent, setAccent] = useState<AccentId>("indigo");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAccent(readAccent());
  }, []);
  const choose = (id: AccentId) => {
    setAccent(id);
    try {
      localStorage.setItem(ACCENT_KEY, id);
    } catch {}
    applyAccent(id);
  };
  return (
    <div role="radiogroup" aria-label="Accent colour" className="flex flex-wrap gap-2">
      {ACCENTS.map((a) => (
        <button
          key={a.id}
          type="button"
          role="radio"
          aria-checked={accent === a.id}
          onClick={() => choose(a.id)}
          className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm font-medium ${
            accent === a.id ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface text-muted hover:text-text"
          }`}
        >
          <span className="h-6 w-6 rounded-full" style={{ backgroundImage: `linear-gradient(135deg, ${a.from}, ${a.to})` }} />
          {a.label}
        </button>
      ))}
    </div>
  );
}
