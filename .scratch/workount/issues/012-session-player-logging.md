# 012 — Session player: logging sets

**Blocked by:** 011 · **Blocks:** 013, 014

## Goal

The screen the whole app exists to serve. Log weight and reps, set by set, with **zero network calls**.

## Context for whoever picks this up

This screen is used **one-handed, sweating, mid-set, with a barbell nearby**. It is not used at a desk. Every design decision follows from that: large tap targets (≥44px), no fiddly controls, no precision required, nothing that punishes a mis-tap. If you find yourself adding a small icon button, stop.

## Scope

`/session` — a client component driven by a Zustand store (`src/lib/session/store.ts`) hydrated from the IndexedDB draft.

Per exercise, show:
- name, prescribed **sets × rep range**, and `notes` if present;
- one row per set, with **weight** and **reps** inputs;
- against each set row, the **last performance** reference: *"Last time: 80 × 8"*. This is the reason the user can decide whether to add weight or add a rep. It is the feature. Give it real visual weight — not grey 11px caption text.

Actions: log a set · add an extra set beyond the target · mark a set as **warmup** · skip an exercise · move between exercises.

**Supersets:** exercises sharing a `superset_group` alternate — a set of A1, a set of A2, then rest. The player drives this order rather than making the user navigate back and forth manually.

## The two hard rules

1. **No `fetch`. None.** If you are adding a network call to this screen, you have broken [ADR-0001](../../../docs/adr/0001-offline-first-session-player.md) and the app now fails in exactly the place it must not. Everything needed is already in the draft from 011.

2. **Every state change writes through to IndexedDB, immediately.** Not debounced-on-a-timer, not on unmount, not on navigate. The phone can die between one set and the next. Write on every mutation.

## Warmups

A set marked warmup is **excluded from volume, e1RM and PRs** — but it still displays, and it does **not** consume one of the prescribed `target_sets`. Bench-pressing the empty bar for 10 is not one of your working sets and it is not a personal record.

## Acceptance

- Log a full workout offline (DevTools → Offline for the whole session): every set, warmups, an extra set, a superset.
- **Kill the browser tab entirely. Reopen `/session`.** Everything is exactly where you left it — every logged set, the current exercise, the lot.
- The last-performance reference shows against each set, and shows *nothing* (gracefully) for a lift never done before.
- Zero network requests fire during the session. Check the network tab; it should be empty.
