// Shared by the server layout (inline script) and the client ThemeSwitcher,
// so it must not live in a "use client" module.
export type ThemePref = "light" | "system" | "dark";
export const THEME_KEY = "ch-theme";

/**
 * Runs before first paint (inlined in <head>) so the page never flashes the
 * wrong colors. Resolves "system" to light/dark and keeps following the OS.
 */
export const themeInitScript = `(function(){try{var p=localStorage.getItem("${THEME_KEY}")||"system";var m=window.matchMedia("(prefers-color-scheme: dark)");var a=function(){var r=p==="system"?(m.matches?"dark":"light"):p;document.documentElement.dataset.theme=r;};a();m.addEventListener("change",function(){if((localStorage.getItem("${THEME_KEY}")||"system")==="system")a();});}catch(e){}})();`;
