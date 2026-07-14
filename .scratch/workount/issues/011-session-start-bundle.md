# 011 — Session start: prefetch the bundle to IndexedDB

**Blocked by:** 009, 010 · **Blocks:** 012

## Goal

Starting a session fetches **everything the player will ever need**, in one round trip, and writes it to IndexedDB. After this call returns, the app can go offline for two hours and lose nothing.

Read [ADR-0001](../../../docs/adr/0001-offline-first-session-player.md) before starting. The design only works if this ticket is done properly — everything downstream assumes the bundle is complete.

## Scope

`startSession(workoutId)` in `src/lib/session/start.ts`:

1. **Generate the session `id` client-side** (`crypto.randomUUID()`). This is what makes the eventual commit idempotent — do not let the database mint it.
2. Fetch, in one go:
   - the workout's `workout_exercises` (sets, rep range, rest, notes, superset group, position),
   - the exercise metadata (name, muscle group, equipment),
   - `profiles.default_rest_seconds` — **resolved now**, because offline we can't go and look it up,
   - `get_last_performance(program_id, exercise_ids)` (010).
3. Write the whole thing to IndexedDB (`idb-keyval`) under a single `activeDraft` key.
4. **Best-effort** `INSERT sessions (id, status='active', started_at)`. If it fails (already offline, flaky), **swallow the error and continue** — the finish commit upserts the same id, so the session is not lost. Its only purpose is letting the server know a session is open, which powers the forgot-to-finish reminder (020).

## The draft shape

Type it properly in `src/lib/session/types.ts` and treat it as a **versioned persisted format** — add a `version: 1` field now. You *will* change this shape later, and when you do, there will be a user mid-session with the old shape in their IndexedDB. Without a version field you have no way to migrate them and their workout is gone.

The draft holds, per exercise: the prescription, the last-performance reference, and a `sets[]` array of what the user has actually logged so far (empty at start).

## Rest values must be resolved into the draft

Store the **effective** rest seconds per exercise (`rest_seconds ?? default_rest_seconds`), not the nullable original. Offline, there is nothing to fall back *to*. Resolve the inheritance at start time and bake the number in.

## Acceptance

- Start a session → IndexedDB holds a complete draft: prescription, exercise names, effective rest, last-performance, `version: 1`.
- **Go offline, reload the page → the draft is still there and fully readable.** This is the ticket.
- Start with the network already down: the `sessions` insert fails, and the draft is created anyway. The user can still train.
- An exercise never performed before has an empty last-performance and does not crash the player.
