import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Aggressive no-cache on ALL HTML pages and API routes
  const pathname = request.nextUrl.pathname;
  // Only skip _next/static assets (they have content hashes so caching is fine)
  if (!pathname.startsWith("/_next/static")) {
    response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate, max-age=0, s-maxage=0, proxy-revalidate");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
    response.headers.set("Surrogate-Control", "no-store");
    response.headers.set("Vary", "*");
  }

  // Add version header so we can verify the correct build is served
  response.headers.set("X-MQ-Build", "v6-play-route-" + Date.now().toString(36));

  return response;
}

export const config = {
  matcher: ["/((?!_next/image|favicon.ico).*)"],
};
