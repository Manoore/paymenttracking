import { NextResponse, type NextRequest } from "next/server";
import { REFRESH_COOKIE, backend, clearRefreshCookie, sameOrigin, setRefreshCookie } from "@/lib/server/session";

/** Exchange the httpOnly refresh cookie for a fresh short-lived access token. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: { message: "Bad origin" } }, { status: 403 });
  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) return NextResponse.json({ error: { message: "Not signed in" } }, { status: 401 });

  const { status, data } = await backend("/auth/refresh", { refreshToken }, req.headers.get("user-agent"));
  if (status !== 200) {
    const res = NextResponse.json({ error: { message: "Session expired" } }, { status: 401 });
    if (status === 401) clearRefreshCookie(res);
    return res;
  }
  const res = NextResponse.json({ accessToken: data.accessToken });
  setRefreshCookie(res, data.refreshToken);
  return res;
}
