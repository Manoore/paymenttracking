import { NextResponse, type NextRequest } from "next/server";
import { apiUrl, sameOrigin, setRefreshCookie } from "@/lib/server/session";

/**
 * Changing the password revokes every refresh token, so this route forwards the
 * request and stores the fresh refresh token in the httpOnly cookie.
 */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: { message: "Bad origin" } }, { status: 403 });
  const authorization = req.headers.get("authorization");
  if (!authorization) return NextResponse.json({ error: { message: "Not signed in" } }, { status: 401 });

  const res = await fetch(apiUrl("/auth/change-password"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authorization },
    body: JSON.stringify(await req.json().catch(() => ({}))),
    cache: "no-store",
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) return NextResponse.json(data, { status: res.status });
  const out = NextResponse.json({ accessToken: data.accessToken });
  setRefreshCookie(out, data.refreshToken);
  return out;
}
