// Shared by the server layout (inline script) and the client ThemeSwitcher,
// so it must not live in a "use client" module.
export type ThemePref = "light" | "system" | "dark";
export const THEME_KEY = "ch-theme";

export const ACCENTS = [
  { id: "indigo", label: "Indigo", from: "#4f46e5", to: "#7c3aed" },
  { id: "ocean", label: "Ocean", from: "#0e7490", to: "#0ea5e9" },
  { id: "sunset", label: "Sunset", from: "#dc4a2e", to: "#f59e0b" },
  { id: "grape", label: "Grape", from: "#9333ea", to: "#db2777" },
  { id: "forest", label: "Forest", from: "#15803d", to: "#0d9488" },
] as const;
export type AccentId = (typeof ACCENTS)[number]["id"];
export const ACCENT_KEY = "ch-accent";

/**
 * Runs before first paint (inlined in <head>) so the page never flashes the
 * wrong colors. Resolves "system" to light/dark and keeps following the OS,
 * and applies the saved accent palette.
 */
export const themeInitScript = `(function(){try{var d=document.documentElement;var ac=localStorage.getItem("${ACCENT_KEY}");if(ac&&ac!=="indigo")d.dataset.accent=ac;var p=localStorage.getItem("${THEME_KEY}")||"system";var m=window.matchMedia("(prefers-color-scheme: dark)");var a=function(){var r=p==="system"?(m.matches?"dark":"light"):p;d.dataset.theme=r;};a();m.addEventListener("change",function(){if((localStorage.getItem("${THEME_KEY}")||"system")==="system")a();});}catch(e){}})();`;
