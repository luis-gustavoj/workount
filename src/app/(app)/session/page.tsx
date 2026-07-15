import { SessionPlayer } from "@/app/(app)/session/session-player";

/**
 * `/session` — the session player (ticket 012, ADR-0001). No params, no
 * server-fetched data: everything it needs already lives in the IndexedDB
 * draft written by `startSession` (ticket 011), and the player itself must
 * make zero network calls for the rest of the session.
 */
export default function SessionPage() {
  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <SessionPlayer />
    </main>
  );
}
