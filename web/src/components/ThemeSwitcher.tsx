"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { THEME_KEY as KEY, type ThemePref } from "@/lib/theme";

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
