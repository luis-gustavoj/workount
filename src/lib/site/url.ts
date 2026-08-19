/**
 * The absolute origin this app is served from.
 *
 * Needed by everything that has to emit a URL a *crawler or a chat client* will
 * follow rather than a browser already on the page: `metadataBase`, the
 * canonical link, the Open Graph image, `robots.txt`, `sitemap.xml`. Relative
 * URLs are fine in the app itself and are not this module's business.
 *
 * Resolution order:
 *   1. `NEXT_PUBLIC_SITE_URL` — set it once the custom domain exists. This is
 *      the only one that can be *right*; the rest are best-effort fallbacks.
 *   2. `VERCEL_PROJECT_PRODUCTION_URL` — the project's stable production
 *      hostname, identical across preview and production builds. Preferred over
 *      `VERCEL_URL`, which is the *per-deployment* hostname and would put an
 *      ephemeral preview URL into a production canonical tag.
 *   3. localhost on the dev port, so `next dev` and `next build` both produce
 *      parseable absolute URLs instead of throwing.
 *
 * Vercel's env vars carry no scheme, hence the prefix.
 */
const DEV_ORIGIN = "http://localhost:8888";

export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return stripTrailingSlash(explicit);

  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelHost) return `https://${stripTrailingSlash(vercelHost)}`;

  return DEV_ORIGIN;
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}
