# Workount — Domain Context

The shared vocabulary of this project. Every table name, type name, variable, and piece of UI copy uses these words with these meanings. If a word starts doing two jobs, fix it here first, then in the code.

---

## The distinction the whole app rests on

English uses **"workout"** for two completely different things:

> "I've got a *workout* on Monday" — the **plan**.
> "That was a great *workout*" — the **thing that happened**.

Conflating them is the single easiest way to corrupt this codebase, because the plan is *mutable* and the record of what happened must be *immutable*. So we never use "workout" loosely:

| Term | Means | Mutable? |
|---|---|---|
| **Workout** | The **prescription**. A day within a program: "Push A", scheduled Monday, containing exercises with target sets and rep ranges. A *template*. | Yes — the user edits it freely. |
| **Session** | The **performance**. One instance of actually training: started at 18:04, lasted 52 minutes, these sets at these weights. A *historical fact*. | No — once completed, it never changes. |

You *perform a session* **from** a *workout*. A workout is a noun you edit; a session is a thing that happened to you. In code: `workouts` is the plan, `sessions` is the history. Never `workouts` for both.

> The corollary — and this is [ADR-0002](adr/0002-sessions-snapshot-their-prescription.md) — is that a session must not merely *point* at its workout. If it did, editing "Bench 3×8" to "Bench 4×6" next month would silently rewrite what you did last month. Sessions copy down what they need.

---

## Core nouns

**Exercise** — a movement in the catalog: "Barbell Bench Press", with a muscle group and equipment type. Either **global** (seeded by us, `user_id IS NULL`) or **custom** (created by one user, visible only to them). An exercise is a *definition*, never an instance — it has no sets, weight, or reps.

**Program** — a named training plan the user follows, e.g. "PPL — Summer". Has a name and description; contains workouts. This is the unit of analytics: *all progress is measured within a program*, because comparing your bench across two different programs with different volumes and rep schemes is comparing apples to oranges.

**Active program** — the **one** program the user is currently following (`profiles.active_program_id`). Exactly one, never zero-or-many. It's what the home screen reads to decide what to recommend today. Other programs still exist and keep their history; they're just not being followed.

**Workout** — see above. A day within a program. Has a name ("Push A"), an optional **day of week** (0–6; `NULL` means "unscheduled — do it whenever"), and an ordered list of prescribed exercises.

**Prescription** — what the program *tells you to do*: this exercise, this many sets, this rep range, this rest, these notes. Lives on `workout_exercises`. Contrast with **performance**.

**Session** — see above. A performance. Has a status:
- `active` — in progress right now. Lives primarily in the browser (see **Draft**).
- `completed` — finished and committed. The only status analytics counts.
- `abandoned` — started, never finished, user discarded it.

**Set** — one bout of reps at one weight. Two flavours, and they are *not* the same shape:
- a **prescribed set** is a target (part of `target_sets` × `rep_min..rep_max`) — it has no weight, because the program doesn't know how strong you are;
- a **performed set** is a fact (`session_sets`: 80kg × 8) — it has a weight, because it happened.

**Working set** — a performed set that counts. **Warmup set** — a performed set that does *not* count: excluded from volume and ineligible for PRs. Bench-pressing the empty bar for 10 is not a personal record, and if warmups counted, week one of any program would report fake PRs and a wildly inflated volume curve.

**Superset** — two or more exercises in a workout sharing a `superset_group` (`'A'`, `'B'`…), performed alternately: a set of A1, a set of A2, rest, repeat.

---

## The session-time nouns

**Draft** — the browser-side (IndexedDB) representation of an `active` session. The **source of truth while you are training**. The gym has no signal; the app does not fight this. See [ADR-0001](adr/0001-offline-first-session-player.md).

**Bundle** — everything the session player prefetches at *start* so it can then run with zero network: the prescription, the exercise names, and the last performance. Fetched in one round trip while you still have signal, on the walk to the gym.

**Last performance** — the reference shown next to each set while you're lifting: *what you did last time you performed this exercise, in this program*. "Last time: 80×8, 80×8, 77.5×7." This is the entire mechanism of progressive overload — the user cannot decide whether to add weight or add a rep without it. It's part of the **bundle**, therefore available offline, therefore fetched at start, not looked up mid-set.

**Rest timer** — counts down between sets. Defaults to the exercise's `rest_seconds`, falling back to the user's default of **90s**. Adjustable ±15s. Internally it is an **end timestamp** (`restEndsAt`), never a ticking counter — a counter freezes or drifts when the phone locks the screen, which is precisely when it's running.

---

## The measures

**Volume** — `Σ(weight × reps)` across working sets. Warmups excluded. The headline "did I do more than last time" number.

**Estimated 1RM (e1RM)** — the heaviest single you could theoretically lift, inferred from a set, via **Epley**: `weight × (1 + reps / 30)`. Lets you compare 100kg×5 against 110kg×3 (116.67 vs 121.0 — the triple was stronger). This is what a progression chart plots, *not* raw weight, because raw weight ignores reps and tells you nothing when the rep count moves.

**PR (personal record)** — a best, per exercise. Three kinds, tracked separately: heaviest set, best e1RM, best reps at a given weight. Working sets only.

**Adherence** — sessions completed vs. workouts scheduled, per week. The honest answer to "am I actually following this program."

---

## The language nouns

The app ships in **English** and **Brazilian Portuguese**. i18n is a *presentation-layer* concern only — the domain never becomes locale-aware ([ADR-0005](adr/0005-i18n-is-a-ui-layer-concern.md)).

**Locale** — which language a user sees: `'en'` or `'pt-BR'`. A **display preference**, stored on `profiles.locale`, exactly like `weight_unit` — read at the UI edge, never a dimension of the data. There is **no `[locale]` in the URL**; the app is private and behind auth, so locale lives in the profile (with a cookie + `Accept-Language` fallback on the pre-auth sign-in screen).

**Message catalog** — the translated strings, keyed and resolved by `next-intl`. Holds two things: **UI copy** (buttons, labels, errors) and the **display labels for enums** — `muscle_group` and `equipment` stay in the database as stable English keys (`'chest'`, `'barbell'`) and the catalog turns them into `"Peito"`, `"Barra"`. The DB value is identity; the catalog is display.

**Untranslated by design** — the **60 seeded exercise names** are *not* translated; they read the same in both locales. The `name` is the identity key for all progress tracking, and **custom exercises** are free-text in whatever language the user typed — so the picker is bilingual-in-practice regardless, and a Portuguese speaker who wants a Portuguese name creates a custom exercise. A per-name translation table was deliberately deferred.

---

## Words we deliberately do not use

- **"Routine"**, **"split"**, **"plan"** — all mean *program*. Pick one word; it's `program`.
- **"Log"** as a noun — ambiguous between a session and a set. Use the specific one. ("Log" as a *verb* is fine: you log a set.)
- **"Rep max"** unqualified — always say **e1RM** (estimated) or **true 1RM** (actually attempted). We only ever compute the former.
- **"Workout"** to mean a session. See above, at length.
