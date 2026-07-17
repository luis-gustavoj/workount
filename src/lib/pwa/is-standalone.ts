/**
 * Whether the app is currently running installed (standalone), rather than
 * in a browser tab. `display-mode: standalone` covers Android/desktop;
 * `navigator.standalone` is iOS Safari's older, pre-standard equivalent,
 * which `matchMedia` doesn't report there.
 */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}
