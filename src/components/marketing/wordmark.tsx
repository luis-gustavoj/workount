/**
 * The wordmark. There is no logo file in the repo — the app has always
 * identified itself by setting its own name in Plex Sans — so this is that,
 * with the one mark the brand actually owns: the azure signal, as a single
 * indicator dot. DESIGN.md forbids decorative signal *in the app*; the
 * exemption in ADR-0007 is what allows it here, and this is the only place on
 * the page it appears without meaning "live".
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={`flex items-center gap-2 text-[0.9375rem] font-semibold tracking-tight text-ink ${className ?? ""}`}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-signal" />
      Workount
    </span>
  );
}
