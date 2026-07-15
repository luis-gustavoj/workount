/**
 * Vibrate + push notification on rest complete (ticket 013). Both fire
 * reliably only while the page is foregrounded — if the phone is locked the
 * browser will likely suppress or delay them. That's a real platform
 * limitation, not a bug to chase with a service worker or background sync
 * (see the ticket's "notification caveat"); this module is deliberately
 * best-effort and nothing more.
 */

const VIBRATE_DURATION_MS = 200;

/**
 * Requests notification permission up front, once. A no-op once the user
 * has already granted or denied it — re-prompting on every rest timer would
 * be exactly the kind of nagging that gets a permission auto-denied for
 * good.
 */
export function requestRestNotificationPermission(): void {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "default") return;
  void Notification.requestPermission();
}

/**
 * Fires both channels, each independently guarded: a phone with vibration
 * but no granted notification permission (or vice versa) should still get
 * whichever one it can.
 */
export function notifyRestComplete(title: string, body: string): void {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate(VIBRATE_DURATION_MS);
  }
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    new Notification(title, { body });
  }
}
