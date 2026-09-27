import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login"];

/** Redirect signed-out visitors to /login. Real authorization is enforced by the API. */
export function proxy(req: NextRequest) {
  const signedIn = req.cookies.has("ch_rt");
  const isPublic = PUBLIC_PATHS.some((p) => req.nextUrl.pathname.startsWith(p));
  if (!signedIn && !isPublic) {
    const url = new URL("/login", req.url);
    if (req.nextUrl.pathname !== "/") url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }
  if (signedIn && req.nextUrl.pathname === "/login") return NextResponse.redirect(new URL("/", req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|icon|apple-icon|.*\.(?:png|svg|jpg|ico)$).*)"],
};
