import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/site/url";

/**
 * Served at `/sitemap.xml`. Two entries, because two pages are public — the
 * rest of the app is behind the auth guard and has nothing to offer a crawler.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();

  return [
    { url: base, changeFrequency: "monthly", priority: 1 },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
