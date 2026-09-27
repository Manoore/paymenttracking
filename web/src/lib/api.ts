"use client";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

// Access token lives only in memory; refreshed through the httpOnly-cookie session route.
let accessToken: string | null = null;
let accessExp = 0;
let inflight: Promise<string> | null = null;

function decodeExp(token: string) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return (payload.exp ?? 0) * 1000;
  } catch {
    return 0;
  }
}

export function setAccessToken(token: string | null) {
  accessToken = token;
  accessExp = token ? decodeExp(token) : 0;
}

function goToLogin() {
  if (typeof window === "undefined") return;
  const next = window.location.pathname + window.location.search;
  window.location.href = `/login${next && next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`;
}

async function getToken(force = false): Promise<string> {
  if (!force && accessToken && Date.now() < accessExp - 30_000) return accessToken;
  // One refresh at a time: the backend rotates refresh tokens on every use.
  inflight ??= fetch("/api/session/token", { method: "POST" })
    .then(async (res) => {
      if (!res.ok) throw new ApiError(401, "Session expired");
      const { accessToken: t } = await res.json();
      setAccessToken(t);
      return t as string;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function fileUrl(relative?: string) {
  return relative ? `${API_BASE}${relative}` : "";
}

type Query = Record<string, string | number | boolean | undefined | null>;

export function qs(query?: Query) {
  if (!query) return "";
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

async function request<T>(method: string, path: string, body?: unknown, retried = false): Promise<T> {
  let token: string;
  try {
    token = await getToken();
  } catch {
    goToLogin();
    throw new ApiError(401, "Session expired");
  }
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined && !isForm ? { "Content-Type": "application/json" } : {}),
    },
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
  });
  if (res.status === 401 && !retried) {
    await getToken(true).catch(() => null);
    return request<T>(method, path, body, true);
  }
  if (res.status === 401) {
    goToLogin();
    throw new ApiError(401, "Session expired");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data?.error?.message ?? `Request failed (${res.status})`, data?.error?.details);
  }
  if (res.status === 204) return undefined as T;
  const type = res.headers.get("content-type") ?? "";
  return (type.includes("application/json") ? res.json() : res.blob()) as Promise<T>;
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>("GET", path + qs(query)),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  del: (path: string) => request<void>("DELETE", path),
  upload: <T>(path: string, form: FormData) => request<T>("POST", path, form),
  download: async (path: string, query: Query | undefined, filename: string) => {
    const blob = await request<Blob>("GET", path + qs(query));
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: filename });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};

export async function logout() {
  setAccessToken(null);
  await fetch("/api/session/logout", { method: "POST" }).catch(() => null);
  window.location.href = "/login";
}
