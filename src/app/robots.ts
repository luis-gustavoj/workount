import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/site/url";

/**
 * Served at `/robots.txt`. `src/proxy.ts` excludes that path from the auth
 * matcher, so it is reachable without a session — a crawler being redirected
 * to `/sign-in` when it asks for robots.txt is exactly the kind of thing that
 * looks fine locally and fails silently in production.
 *
 * Only the two public pages are crawlable. Everything else redirects to
 * `/sign-in` for an anonymous request anyway, so this is not what protects it —
 * it just stops crawlers from spending their budget discovering that.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/privacy"],
      disallow: [
        "/home",
        "/session",
        "/programs",
        "/history",
        "/settings",
        "/sign-in",
        "/auth",
      ],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
