import { NextResponse, type NextRequest } from "next/server";
import { backend, sameOrigin, setRefreshCookie } from "@/lib/server/session";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: { message: "Bad origin" } }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const { status, data } = await backend("/auth/login", body, req.headers.get("user-agent"));
  if (status !== 200) return NextResponse.json(data, { status });
  const res = NextResponse.json({ accessToken: data.accessToken, user: data.user });
  setRefreshCookie(res, data.refreshToken);
  return res;
}
