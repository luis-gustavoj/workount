/**
 * Registers `public/sw.js` (ticket 019). Fire-and-forget from a client
 * component effect — a failed registration (unsupported browser, dev server
 * without HTTPS) just means no offline shell, not a broken app.
 */
export function registerServiceWorker(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
      console.error("Service worker registration failed", error);
    });
  });
}
