import { type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on every request path except:
     *  - _next/static, _next/image — build assets
     *  - static image files — no session to refresh
     *  - PWA / metadata files served from the app root — favicon, the service
     *    worker (sw.js), the web manifest, robots.txt, sitemap.xml. These MUST
     *    be excluded: SPEC §5 makes this a PWA, and a service worker or manifest
     *    that gets a 307 redirect to /sign-in instead of its real body fails to
     *    register, silently breaking offline install.
     *
     * Everything else (including API routes and pages) passes through the auth
     * refresh + guard. Public pages are allowlisted inside `isPublicPath`, not
     * here, so the token still refreshes on them.
     */
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
