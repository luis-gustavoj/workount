import type { MetadataRoute } from "next";

/**
 * Ticket 019. Next's `app/manifest.ts` convention serves this at
 * `/manifest.webmanifest` and wires the `<link rel="manifest">` tag
 * automatically — no static `public/manifest.json` to keep in sync.
 *
 * Colours are DESIGN.md's dark-theme chassis (`--bg`) and signal (`--signal`)
 * — dark is the app's tuned default (a garage at 6am).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Workount",
    short_name: "Workount",
    description: "Track your training programs and log your sessions.",
    // Not "/" — that is the public landing page (ADR-0007). An installed app
    // must open into the app itself, and `/home` being redirect-guarded is
    // also what keeps sw.js from ever caching marketing HTML as the shell.
    start_url: "/home",
    // Without this, scope defaults to the start_url's directory — which would
    // put the landing page and the privacy policy OUTSIDE the installed app,
    // so following a link to either would kick the user out into a browser tab.
    scope: "/",
    // Spelled out rather than left implicit. An absent `id` defaults to the
    // resolved start_url, which makes the app's identity hostage to a routing
    // change: editing start_url again would orphan every existing install
    // instead of updating it. "/home" is exactly today's implicit value, so
    // stating it changes nothing now and pins it from here on.
    id: "/home",
    display: "standalone",
    background_color: "#070707",
    theme_color: "#070707",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
