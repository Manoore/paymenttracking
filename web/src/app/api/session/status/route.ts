import { NextResponse } from "next/server";
import { apiUrl } from "@/lib/server/session";

export async function GET() {
  try {
    const res = await fetch(apiUrl("/auth/status"), { cache: "no-store" });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json({ error: { message: "API unreachable" } }, { status: 502 });
  }
}
