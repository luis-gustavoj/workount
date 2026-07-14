# ADR-0001 — The session player is offline-first; the rest of the app is not

**Status:** Accepted · 2026-07-14

## Context

Sessions happen in gyms. Gyms are basements, they are concrete, they have no signal. If logging a set requires a network round trip, then the set that fails to save is the set you did at the bottom of a stairwell, and the user finds out at the end of the session, when the data is already gone.

The obvious fixes are both bad:
- **Write every set to the server as it happens.** Fails exactly when it matters. Optimistic UI plus a retry queue papers over brief drops but not a 60-minute dead zone.
- **Go full local-first** (local DB as source of truth, sync engine reconciling with the server). Bulletproof, and a large amount of machinery — conflict resolution, tombstones, a sync protocol — to solve a problem this app doesn't really have, because *a session is edited by exactly one person on exactly one device and is never concurrent with anything.*

## Decision

**The active session runs entirely client-side and commits once, at the end.**

- On **start** (with signal, before entering the gym), fetch a **bundle** in one round trip: the workout's prescription, the exercise metadata, and the **last performance** for every exercise in it. Write the bundle to IndexedDB.
- **During** the session, there are *no network calls at all*. Every state change — a set logged, a timer adjusted, an extra set added — writes through to IndexedDB. Closing the browser, locking the phone, or losing signal for an hour loses nothing.
- On **finish**, commit the whole session in **one transactional RPC** (`commit_session`), upserting on a **client-generated session id** so that a retry after a flaky response cannot double-write.

We also do a best-effort `INSERT sessions (status='active')` at start, purely so the server knows a session is open (which is what powers the forgot-to-finish reminder). If that insert fails because we're already offline, nothing breaks — the finish commit upserts the same id.

## Consequences

**Good.** The gym case is a non-issue, without a sync engine. Session state survives a browser crash. The commit is atomic — you never get half a session in the database.

**Accepted costs.**
- **Last performance must be prefetched**, so it's a snapshot from session-start. If you somehow completed another session of the same exercise *during* this one, the reference would be stale. This is not a real scenario.
- **The draft is device-local.** Start a session on your phone and it will not appear on your laptop. Acceptable: nobody changes device mid-workout.
- **IndexedDB is evictable** by the browser under storage pressure. Mitigated by requesting persistent storage (`navigator.storage.persist()`) once the app is installed to the home screen.

## Alternatives rejected

- **Per-set server writes with a retry queue** — the queue still has to survive a browser kill, which means IndexedDB anyway; at that point we've built two-thirds of this design and gained nothing but complexity.
- **Full local-first sync engine** — solving multi-device concurrent editing, a problem we do not have.
