import { NextResponse, type NextRequest } from "next/server";
import { REFRESH_COOKIE, backend, clearRefreshCookie, sameOrigin } from "@/lib/server/session";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: { message: "Bad origin" } }, { status: 403 });
  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value;
  if (refreshToken) await backend("/auth/logout", { refreshToken }).catch(() => null);
  const res = new NextResponse(null, { status: 204 });
  clearRefreshCookie(res);
  return res;
}
