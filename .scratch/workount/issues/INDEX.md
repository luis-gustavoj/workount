# Workount — Ticket Index

Work **blockers-first**. Any ticket whose blockers are all `done` can be picked up. Each ticket file is self-contained: a cold agent should be able to execute it having read only that file, [SPEC.md](../../../docs/SPEC.md), and [CONTEXT.md](../../../docs/CONTEXT.md).

**Clear context between tickets.** Each one starts fresh.

## Dependency graph

```
001 scaffold
 └─ 002 supabase-wiring
     └─ 003 schema-and-rls
         ├─ 004 seed-exercise-catalog
         ├─ 005 google-auth            ◀── first vertical slice ends here:
         │                                  you can sign in and see an empty app
         └─ 006 program-crud
             └─ 007 workout-crud
                 └─ 008 exercise-picker      (needs 004)
                     └─ 009 prescription-editor
                         ├─ 010 last-performance-rpc
                         │   └─ 011 session-start-bundle
                         │       └─ 012 session-player-logging
                         │           ├─ 013 rest-timer
                         │           └─ 014 commit-session   ◀── the app now works,
                         │                                       end to end
                         └─ 021 duplicate-program
                             
014 ──┬─ 015 home-screen-resolver
      ├─ 016 history
      └─ 017 analytics-sql
          └─ 018 analytics-ui

014 ──┬─ 019 pwa
      └─ 020 forgot-to-finish-push   (needs 019)

013 ──── 023 session-player-ux-refactor

005 ──── 022 i18n-foundation   ◀── land before 006; screens 006–018
                                    author copy through the catalog
```

## Tickets

| # | Ticket | Blocked by | Phase |
|---|---|---|---|
| 001 | [Scaffold Next.js app and tooling](001-scaffold.md) | — | Foundation |
| 002 | [Wire up Supabase clients and middleware](002-supabase-wiring.md) | 001 | Foundation |
| 003 | [Schema migration with RLS on every table](003-schema-and-rls.md) | 002 | Foundation |
| 004 | [Seed the global exercise catalog](004-seed-exercise-catalog.md) | 003 | Foundation |
| 005 | [Google sign-in and profile creation](005-google-auth.md) | 003 | Foundation |
| 006 | [Program CRUD and "follow this program"](006-program-crud.md) | 003, 005 | Builder |
| 007 | [Workout CRUD within a program](007-workout-crud.md) | 006 | Builder |
| 008 | [Exercise picker with custom exercises](008-exercise-picker.md) | 004, 007 | Builder |
| 009 | [Prescription editor](009-prescription-editor.md) | 008 | Builder |
| 010 | [`get_last_performance` RPC](010-last-performance-rpc.md) | 003 | Session |
| 011 | [Session start — prefetch bundle to IndexedDB](011-session-start-bundle.md) | 009, 010 | Session |
| 012 | [Session player — logging sets](012-session-player-logging.md) | 011 | Session |
| 013 | [Rest timer](013-rest-timer.md) | 012 | Session |
| 014 | [`commit_session` and the finish flow](014-commit-session.md) | 012 | Session |
| 015 | [Home screen resolver](015-home-screen-resolver.md) | 014 | Shell |
| 016 | [Session history](016-history.md) | 014 | Shell |
| 017 | [Analytics views and PR detection (SQL)](017-analytics-sql.md) | 014 | Analytics |
| 018 | [Analytics UI](018-analytics-ui.md) | 017 | Analytics |
| 019 | [PWA — installable, offline shell](019-pwa.md) | 014 | Polish |
| 020 | [Forgot-to-finish push reminder](020-forgot-to-finish-push.md) | 019 | Polish |
| 021 | [Duplicate a program](021-duplicate-program.md) | 009 | Polish |
| 022 | [i18n foundation (en + pt-BR)](022-i18n.md) | 003, 005 | Foundation |
| 023 | [Session player UX refactor: rest sheet, editable sets, unclamped last-time](023-session-player-ux-refactor.md) | 012, 013 | Polish |
| 024 | [Bottom tab bar, start-from-home, and perceived speed](024-navigation-and-perceived-speed.md) | 015, 019, 022 | Polish |

## Two checkpoints worth stopping at

**After 005** — you can sign in. Boring, but it proves the whole stack is wired.

**After 014** — the app *works*: build a program, follow it, train offline, see it saved. **Stop here and actually use it for a week before starting 017/018.** Real sessions reliably change what you want an analytics screen to show, and building charts against imagined data is how you build the wrong charts.
