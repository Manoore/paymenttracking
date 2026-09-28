import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/signup", "/welcome"];

/**
 * Signed-out visitors see the landing page at "/" and are sent to /login for
 * any app page. Signed-in users get the dashboard at "/". Real authorization
 * is enforced by the API; this only routes.
 */
export function proxy(req: NextRequest) {
  const signedIn = req.cookies.has("ch_rt");
  const { pathname, search } = req.nextUrl;

  if (!signedIn && pathname === "/") return NextResponse.rewrite(new URL("/welcome", req.url));

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  if (!signedIn && !isPublic) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  if (signedIn && (pathname === "/login" || pathname === "/signup")) return NextResponse.redirect(new URL("/", req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|icon|apple-icon|.*\\.(?:png|svg|jpg|ico)$).*)"],
};
