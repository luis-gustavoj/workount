# 023 — Session player UX refactor: rest sheet, editable sets, unclamped last-time

**Blocked by:** 012, 013 · **Blocks:** —

## Goal

Fix three usability problems in the session player (`src/app/(app)/session/session-player.tsx`), the screen used one-handed, mid-set, in a gym. Identified from a screenshot and confirmed with the user:

1. The rest timer sits as a bar between the header and the scrolling set list, competing for attention with the thing the user actually needs while resting.
2. Logged sets are read-only (only the warmup flag can be toggled) — a mis-entered weight or rep count can't be corrected without finishing and going elsewhere, and there's no way to undo a mistaken extra log.
3. The "Last time" reference — described in `docs/CONTEXT.md` as "the entire mechanism of progressive overload" — gets clipped to an ellipsis because its `flex-1` span splits row width 50/50 with the performed-value span regardless of content length.

## Context for whoever picks this up

The app has a deliberate visual system (`DESIGN.md`: achromatic OKLCH chassis, one azure "signal" color reserved for exactly three live states, IBM Plex Sans/Mono, hairlines-not-cards, no shadows/gradients/celebration copy). **Evolve it where it's genuinely limiting** (DESIGN.md already names "the sheet" as a `raised`-surface, 8px-radius use case — bottom sheets were anticipated, just not built) — don't invent a new palette or typefaces, and don't touch screens outside the session player.

No backend/RPC or migration changes anywhere in this ticket: `finishSession` (`src/lib/session/commit.ts`) builds `commit_session`'s payload from the **live** draft at the moment Finish is confirmed, so any edit or delete made to the client-side IndexedDB draft before that point flows through with zero server-side changes.

## Scope

### 1. Rest timer → persistent, non-modal bottom sheet

Docks at the screen bottom while a rest is active/overtime, slides up on start and away on end. The entry deck (weight/reps steppers + Log button) stays visible and interactive above it at all times — never hidden, never dimmed.

**Restructure the flex column, don't use `position: fixed` or a modal.** The existing three-band layout is plain nested flexbox, which is what already keeps the entry deck pinned to the bottom for free:

- Remove the current conditional `<RestTimer>` render between the top band and the scrolling middle band (`session-player.tsx` lines ~389-399).
- Add a `BottomDock` wrapper after the middle band, containing **`EntryDeck` first, then the new `RestSheet` below it** — normal-flow siblings in that DOM order. Mounting the sheet grows the dock's total height and pushes everything above it up automatically — no transform math, no JS measurement.
- Move the safe-area-inset bottom padding (`pb-[calc(env(safe-area-inset-bottom)+1rem)]`, currently on the entry deck) onto the outer `BottomDock` wrapper, so it always sits beneath whichever element is last, without a conditional branch.
- Do **not** reuse the existing shadcn `Sheet` (`src/components/ui/sheet.tsx`) — it's a Radix-`Dialog`-based modal (scrim, focus trap, `aria-modal`), the wrong tool since the entry deck must stay interactive underneath/alongside it.

New file `src/app/(app)/session/rest-sheet.tsx` — chrome + presence wrapper around the existing `RestTimer` (whose internal ring/readout/±15s/Done-resting logic is untouched):

- `bg-raised` + `border-t border-line` (hairline, not a floating box) + `rounded-t-lg` only (flush to the screen's bottom edge).
- Slide animation without new dependencies: a small local presence hook (`entering` → `open` → `leaving` → `closed`) driving `translate-y-full` ↔ `translate-y-0` over `180ms cubic-bezier(0.22,1,0.36,1)` (DESIGN.md's `150-220ms` motion band). Stays mounted through its own exit transition rather than unmounting instantly on `endRest()`.
- Keep the **last non-null** `{restEndsAt, restStartedAt, restNotifiedAt}` triple in a `ref` so content doesn't blank out mid-slide when the store nulls those fields on `endRest()`.
- `role="status" aria-live="polite"` — not a dialog, no focus trap, no `aria-modal`.
- Reduced motion: Tailwind's `motion-reduce:` variant disables the transition; collapse the exit-wait to `0ms` under `prefers-reduced-motion` so nothing is left in a stuck half-state.
- `session-player.tsx` renders `<RestSheet restEndsAt={draft.restEndsAt} restStartedAt={draft.restStartedAt ?? draft.restEndsAt} restNotifiedAt={draft.restNotifiedAt} />` unconditionally — `RestSheet` decides show/hide itself.
- `rest-timer.tsx`'s outer `className` (currently `border-line bg-surface flex items-center justify-between gap-3 border-b px-4 py-3`) moves to `RestSheet`'s shell; `RestTimer` renders its inner content only.

### 2. Inline set editing (edit weight/reps, plus delete)

**Trigger**: in `set-row.tsx`, wrap the performed-value + last-time content (not the whole row, not nested inside the existing warmup-toggle button) in its own `<button>`, shown only for already-logged rows (`performed` present) that aren't already being edited. Tapping it calls a new `onStartEdit` callback.

**State**: `editingSetNumber: number | null` lives in `SessionPlayer` (sibling to the existing `finishState` machine), not in `SetRow` — only one row edits at a time. Reset to `null` on `goToExercise`, on Save, on Cancel, and on any delete in the current exercise (renumbering can shift which logical set a stale `editingSetNumber` points at).

**Edit surface**, reusing the existing `Stepper` component:

```
Weight <Stepper>   Reps <Stepper>       (seeded from performed.weight/reps)
[Delete] .......... [Cancel] [Save]
```

- Save (`Button` default variant) calls `onSave({ weight, reps })` → `updateSet(...)`, then clears edit state.
- Cancel (`Button` outline) discards, no store write.
- Delete (`Button` destructive` variant, already exists in `button.tsx`) does **not** fire immediately: it swaps the action row into a one-step confirm (`[Cancel] [Confirm delete]`) — lighter than the full Finish `Dialog`, heavier than a bare tap.
- The existing warmup-toggle button is untouched in behavior, just hidden while that row is in edit mode.
- On entering edit mode, move focus to the weight `Stepper`'s input.
- Seed the Steppers' local state by keying the edit block on `s.setNumber` (same remount-to-reset trick `EntryDeck` already uses).

**Store actions** (`src/lib/session/store.ts`), following the existing `mapExercise` + `commit` pattern used by `toggleWarmup`:

```ts
updateSet: (workoutExerciseId: string, setNumber: number, patch: { weight?: number; reps?: number }) => Promise<void>;
```
Maps the matching set, spreads `patch` in place. Does **not** touch `completedAt` — editing corrects a mistake, it isn't re-performing the set.

```ts
deleteSet: (workoutExerciseId: string, setNumber: number) => Promise<void>;
```
Filters out the set, then **renumbers remaining sets to 1..N** — required because `logSet` mints the next `setNumber` as `sets.length + 1`; without renumbering, deleting a middle set (`[1,2,3]` → delete #2 → `[1,3]`, length 2) would make the next logged set collide with #3. Additionally: if the deleted set was the last one and a rest is currently running, clear `restEndsAt`/`restStartedAt`/`restNotifiedAt` too — a rest auto-started by a set that no longer exists shouldn't keep counting. Deleting an earlier, non-last set leaves any active rest untouched.

### 3. Last-time layout fix (never clamp)

Root cause in `set-row.tsx` (~lines 52-63): both the performed-value and last-time spans are `min-w-0 flex-1`, splitting width 50/50 regardless of content; `truncate` on the last-time span is what clips it.

Fix, two parts:

1. **Drop the "Last time: " sentence prefix** in favor of DESIGN.md's label-over-readout idiom (already used by `Stepper`'s `WEIGHT (KG)` caption and the top band's `SET 3 OF 4`): a small uppercase `ink-muted` micro-label ("Last time") stacked above a plain `{weight} × {reps}` mono readout, no words in the numeral run.
2. **`shrink-0` instead of `flex-1`**, right-aligned, sized to content — remove `truncate` entirely from this span. If a defensive last-resort truncation is ever needed, it belongs on the performed-value span, never on last-time.

Keep `lastTimeNone` ("No last time yet") rendered in the value slot under the same "Last time" label (sans, not mono — it's a sentence, not a numeral), so the column's shape doesn't jump between states.

Worth an eyeball check at 390px with a long value once built (e.g. `137.5 × 12` on both sides) — font-metrics vary slightly by browser; only an implausible worst case (4-digit weight + 2-digit reps on both sides simultaneously) gets tight.

## Files to change

| File | Change |
|---|---|
| `src/app/(app)/session/session-player.tsx` | Remove conditional `<RestTimer>`; add `BottomDock` wrapper (`EntryDeck` then `RestSheet`, safe-area padding moved here); add `editingSetNumber` state + `updateSet`/`deleteSet` wiring; reset edit state on `goToExercise`/delete; swap `lastTime` sentence formatter for the new label+value pair. |
| `src/app/(app)/session/rest-sheet.tsx` (new) | Presence/animation wrapper + chrome hosting `RestTimer`. |
| `src/app/(app)/session/rest-timer.tsx` | Strip outer wrapper classes (chrome moves to `RestSheet`); internal ring/readout/controls logic unchanged. |
| `src/app/(app)/session/set-row.tsx` | Fix last-time layout (stacked, `shrink-0`, no `truncate`); add tap-to-edit trigger + edit-mode branch (Steppers + Save/Cancel/Delete/Confirm-delete), gated on new props; hide warmup-toggle while editing. |
| `src/lib/session/store.ts` | Add `updateSet` and `deleteSet` actions; extend `SessionStore` type. |
| `messages/en.json` (`Session` namespace) | Add `lastTimeLabel`, `lastTimeValue`, `editSet` (aria-label, `"Edit set {number}"`), `saveSet`, `cancelEdit`, `deleteSet`, `confirmDeleteSet`. Retire the now-superseded `lastTime` key and the already-dead `lastTimeMultiple`. |

No changes needed to `src/app/globals.css`, `stepper.tsx`, or any backend/migration file.

## Test plan

- `src/lib/session/store.test.ts` (extend): `updateSet` mutates weight/reps without touching `completedAt`, writes through to `idbSet` immediately, no-ops on unknown ids. `deleteSet` renumbers remaining sets 1..N and a subsequent `logSet` produces a non-colliding `setNumber`; deleting the last set while resting clears the rest fields; deleting a non-last set leaves an active rest untouched.
- `src/app/(app)/session/set-row.test.tsx` (new): last-time renders in full with no `truncate` class (regression test with a deliberately long value); tap-to-edit opens Steppers seeded from `performed`; Save calls `onSave` and exits edit mode; Cancel discards; Delete requires a second "Confirm delete" tap; warmup toggle hidden while editing; no edit affordance on the not-yet-performed placeholder row.
- `src/app/(app)/session/rest-sheet.test.tsx` (new, mirroring `rest-timer.test.tsx`'s fake-timer setup): renders nothing when `restEndsAt` is null; renders content when active; content persists through the exit transition on end before unmounting; reduced motion removes it immediately.
- `src/app/(app)/session/session-player.test.tsx` (extend): rest sheet and entry deck both remain interactable simultaneously (e.g. `-15s` still works while the entry deck's weight input is also operable); end-to-end edit flow (tap row → Save → `idbSet` called with updated values) and delete flow (tap row → Delete → Confirm → `idbSet` called with the set removed and remainder renumbered); edit state resets on `goToExercise`.

## Acceptance

- `npm run test` passes for the vitest suites above.
- Log a set → the rest sheet slides up from the bottom while the entry deck stays above it and both are tappable; ±15s and Done-resting work from the sheet.
- Tap a logged set → edit weight/reps → Save; separately → Delete → Confirm — the next logged set gets the right `setNumber`.
- Log a set with a long last-time reference (e.g. `137.5 × 12`) and confirm it never clips, at a 390px viewport.
- `prefers-reduced-motion` (e.g. via browser dev tools emulation) doesn't leave the sheet in a stuck state.
