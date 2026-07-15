# ADR-0005 — i18n is a UI-layer concern; locale is a profile setting

**Status:** Accepted · 2026-07-14

## Context

Workount must ship in **English and Brazilian Portuguese (`pt-BR`)** from day one. i18n surfaced after the spec and tickets were written, so it has to slot into the existing plan rather than reshape it. Decided pre-implementation (only ticket 001, the scaffold, is built), which is the cheapest this decision will ever be.

Three properties of *this* app narrow the design sharply:

- It is **private, behind Google-only auth ([ADR-0003](0003-google-only-auth.md)), and a PWA** (ticket 019). There is no SEO, no anonymous traffic, and no shareable public URL. The usual reason to put a locale in the URL — crawlable, linkable, per-locale pages — **does not apply**.
- The exercise **`name` is the identity key for all progress tracking** (ticket 004): translating it naively would split a user's progression chart in two.
- The **session player is offline-first ([ADR-0001](0001-offline-first-session-player.md))**: it prefetches a *bundle* and makes zero network calls. Every string a lifter sees mid-session must already be in that bundle.

## Decision

**Treat i18n as a presentation-layer concern. Nothing about the *domain* becomes locale-aware; only the rendering does.**

### 1. No `[locale]` URL segment. Locale is a per-user setting.

Locale is **`profiles.locale`**, read server-side on every render. There is no `app/[locale]/…` routing, no locale middleware rewrite, and the ticket-001 scaffold is left structurally intact. On the **pre-auth surface** (the Google sign-in screen) there is no profile yet, so locale falls back to a **cookie + `Accept-Language`**.

Rejected: the `[locale]` path segment. It exists to serve SEO, anonymous visitors, and shareable localized links — Workount has none of the three. It would cost a restructure of every route, `Link`, and `redirect` for zero benefit here.

### 2. `next-intl` in "without i18n routing" mode.

Server- and client-component support, and an `Intl` wrapper for number/date formatting — which `pt-BR` genuinely needs (`1.234,5` vs `1,234.5`, date order). The routing middleware is unused, consistent with decision 1.

### 3. UI chrome and enums are translated. Catalog exercise names are not.

- **UI copy** (buttons, labels, `"Last time:"`, errors) → message catalog.
- **Enums** — `muscle_group` (chest, back, quads…) and `equipment` (barbell, dumbbell, cable…), a closed set of ~18 values — stay in the DB as **stable English keys** and are translated as **display labels** in the message catalog (`muscle_group.chest → "Peito"`). The database value never changes.
- **The 60 seeded exercise names** ship **untranslated in both locales** for the MVP (Option B). Reasons: the name is the identity key and must stay stable regardless; **custom exercises are free-text and can never be translated** (a user types "Rosca Scott" in their own language), so the picker is bilingual-in-practice no matter what; and BR lifting culture is heavily English-borrowed. A `exercise_translations` table was considered and **deferred** — it would add a table, its RLS, a join in the picker RPC *and* the offline bundle builder, and 60 hand-authored translations, to solve a problem users may not have.

### 4. `profiles.locale`, folded into the initial migration.

```
locale text NOT NULL DEFAULT 'en'   -- 'en' | 'pt-BR', CHECK-constrained
```

Mirrors `weight_unit` exactly — a *display* preference stored on the profile. RLS is already covered by the existing `profiles` policy (`id = auth.uid()`); **no new policy**. Because ticket 003 (`0001_init.sql`) is not yet built, the column goes **into that migration**, not a follow-on. The value is **seeded at profile-creation time** from `Accept-Language` (the Google-auth `handle_new_user` path), so the stored locale is honest from the first render rather than defaulting to `'en'` for a Portuguese speaker.

## Consequences

**Good.**
- i18n stays out of the data model. No schema churn beyond one column; the RPCs, views, and the offline bundle are untouched.
- The offline constraint is satisfied for free: message catalogs are bundled into the JS at build time, so they are available with zero network. Exercise names in the bundle are the untranslated base names, so the bundle builder needs no change.
- Reversible: adding `exercise_translations` later is additive and touches only the picker/bundle read path — no migration of existing data.

**Accepted costs.**
- **The exercise picker is mixed-language.** A `pt-BR` user sees translated chrome and enum labels around English catalog names ("Barbell Bench Press") and their own Portuguese customs. Judged normal for this audience, not broken.
- **A user who creates "Supino Reto" as a custom instead of using the global "Barbell Bench Press" splits their own bench progression.** This is the *existing* custom-vs-global overlap risk (ticket 004), not one i18n introduces — but Portuguese-preferring users make it marginally more likely. Left as-is.
- Every screen ticket (006–018) must author its copy **through the catalog from the start**. Retrofitting hardcoded strings later is the failure mode; the i18n foundation (ticket 022) is therefore sequenced **before** the screen work.
