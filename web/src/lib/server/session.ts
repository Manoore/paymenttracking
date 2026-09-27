import "server-only";
import { NextResponse, type NextRequest } from "next/server";

/**
 * The web app never exposes the refresh token to JavaScript. It lives in an
 * httpOnly cookie on the Vercel domain; the browser trades it for a short-lived
 * access token via /api/session/token and then calls the Render API directly.
 */
export const REFRESH_COOKIE = "ch_rt";
const MAX_AGE = 30 * 24 * 60 * 60;

export function apiUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) throw new Error("NEXT_PUBLIC_API_URL is not set");
  return `${base.replace(/\/$/, "")}/api/v1${path}`;
}

export function setRefreshCookie(res: NextResponse, token: string) {
  res.cookies.set(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export function clearRefreshCookie(res: NextResponse) {
  res.cookies.set(REFRESH_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

/** Reject cross-site POSTs to session endpoints (defence in depth on top of SameSite=Lax). */
export function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

export async function backend(path: string, body: unknown, userAgent?: string | null) {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(userAgent ? { "User-Agent": userAgent } : {}) },
    body: JSON.stringify(body ?? {}),
    cache: "no-store",
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, data };
}
