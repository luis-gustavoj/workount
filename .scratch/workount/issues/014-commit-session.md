# 014 — `commit_session` and the finish flow

**Blocked by:** 012 · **Blocks:** 015, 016, 017, 019

## Goal

Turn a finished draft into permanent history, **atomically**, **idempotently**, and **without ever destroying the local copy before the server confirms**.

This is the last ticket of the core app. When it lands, the thing works end to end.

## Scope

### `commit_session(p_payload jsonb) → uuid`

The **only** write path for a finished session.

- Takes the whole session + all its sets as one JSON payload.
- Inserts them **in a single transaction**. A half-written session — the row exists but the sets don't — is worse than no session at all, because the user believes it saved.
- **Upserts on the client-generated `sessions.id`** (from 011). A commit that succeeds on the server but whose response is lost to a flaky connection *will* be retried by the client, and that retry must not produce a second copy of the workout. `ON CONFLICT (id) DO UPDATE` on the session; delete-then-reinsert the sets for that session id.
- Sets `status = 'completed'`, `completed_at`, `duration_seconds`.
- **Snapshots** `target_rep_min` / `target_rep_max` onto each set ([ADR-0002](../../../docs/adr/0002-sessions-snapshot-their-prescription.md)) and denormalizes `exercise_id`. The draft already carries both.
- Rejects a payload whose `user_id` isn't `auth.uid()`. `SECURITY INVOKER`, so RLS applies.

### The finish flow (`src/lib/session/commit.ts`)

1. User taps **Finish**. Show a summary first: duration, total volume, sets completed, any PRs hit. Give them the chance to notice they forgot to log the last set.
2. Call `commit_session`.
3. **On success** → clear the IndexedDB draft, navigate to the session in history.
4. **On failure** → **keep the draft**, surface a retry banner. Do not throw the user's workout away because the network was down when they tapped a button.

## The rule that must not be broken

**The draft is deleted only after the server has confirmed the write.** Not before, not optimistically, not in a `finally`. A user who finishes a session in a basement, gets a network error, and loses an hour of training will not use this app again — and they'd be right not to.

## Acceptance

- Finish a session → exactly **one** `sessions` row (`completed`) and **N** `session_sets` rows.
- **Call `commit_session` twice with the same payload → still one session, still N sets.** This is the idempotency assertion; write it as a test.
- Finish while offline → the commit fails, the **draft survives**, a retry banner shows. Go back online, retry, it saves.
- Force a mid-transaction failure (e.g. a bad set row) → **nothing** is written. No orphan session row.
- Sets carry the snapshotted rep range and the denormalized `exercise_id`.
- **Now edit the program**: change bench from 3×8 to 4×6, then delete an exercise from the workout. Reopen the session in history. **It is unchanged.** If it isn't, ADR-0002 has been violated somewhere and everything downstream is built on sand.
