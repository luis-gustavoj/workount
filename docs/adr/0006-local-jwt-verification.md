# ADR-0006 — Auth is verified locally from the JWT, not confirmed with the auth server

**Status:** Accepted · 2026-08-19

## Context

Every signed-in screen change was costing **three sequential round trips to Supabase Auth** before anything could render:

| Where | Call |
|---|---|
| `src/middleware.ts` (now `src/proxy.ts`) | `supabase.auth.getUser()` — the route guard |
| `(app)/layout.tsx` | `supabase.auth.getUser()` — narrow the user, self-heal the profile |
| the page itself | `supabase.auth.getUser()` — scope its own queries |

`getUser()` is not a local operation. It sends the access token to `/auth/v1/user` and waits for the auth server to confirm it. Three of those, serially, before the first byte of the page — on a phone, on gym wifi. Combined with the app having **no `loading.tsx` anywhere** (so Next held the previous screen on the display for the whole wait), navigation felt broken rather than slow: the tap appeared to do nothing, then the screen jumped.

The Supabase docs' standing advice — "never trust `getSession()` on the server, use `getUser()`" — is about a real hazard: `getSession()` returns whatever is in the cookie **without checking the signature**, so a forged cookie reads as a valid user. That advice predates asymmetric signing keys.

This project's Supabase instance **signs access tokens with ES256** and publishes a JWKS:

```
GET /auth/v1/.well-known/jwks.json
{"keys":[{"alg":"ES256","kty":"EC","crv":"P-256","use":"sig", ...}]}
```

## Decision

**Verify the access token's signature locally with `auth.getClaims()`, and dedupe that call per request with React's `cache()`.**

### 1. `getClaims()` instead of `getUser()`, everywhere on the server

`getClaims()` verifies the ES256 signature with WebCrypto against the project's public key. It is not `getSession()` — a forged or tampered cookie fails the signature check and is rejected, which is the entire hazard the standing advice exists to prevent.

The key set is fetched once per server process and cached in auth-js's module-level `GLOBAL_JWKS`, shared across every per-request client instance. After the first request, verification is arithmetic.

Called with no argument, `getClaims()` reads the session underneath — **which is still where token refresh happens**. The proxy keeps refreshing and rewriting auth cookies exactly as before. Passing it a token read directly from the cookie would skip that; don't.

### 2. Claims are mapped through one gate: `userFromClaims`

A verified signature is not the same as "this is a signed-in user". `src/lib/auth/claims.ts` rejects anything whose `role` is not `authenticated` — **the project's own anon key is a validly-signed JWT for the same project** and would otherwise verify perfectly — and fails closed on a missing `sub`.

### 3. One auth read per request, via `cache()`

`getCurrentUser()` in `src/lib/auth/current-user.ts` is wrapped in React `cache()`, so the layout and the page it renders share a single call instead of making one each. `cache()` is per-request by construction; nothing leaks between users.

### 4. The profile self-heal moves out of the layout

Ticket 005's "recreate a missing `profiles` row" lived in `(app)/layout.tsx`, which meant a `profiles` SELECT on **every navigation** to check for a row that is essentially always present. It moves to `/auth/callback` — sign-in is the moment a profile can actually be missing. Once per session, not once per screen.

## Consequences

**Good.**
- Auth costs ~0 network hops per navigation instead of 3. Combined with the `loading.tsx` skeletons added alongside this, a tap paints immediately.
- The security property that mattered is preserved: a forged cookie is still rejected, now by signature check rather than by asking.
- One helper (`getCurrentUser`) is the single way the server learns who is signed in — previously the same six-line `getUser()` block was copy-pasted into eleven files.

**Accepted costs.**
- **Revocation is delayed by up to one access-token lifetime** (Supabase default: 1 hour). A user who is deleted, banned, or signed out elsewhere keeps passing the guard until their token expires. This is **not new exposure**: Postgres validates the same JWT the same way for RLS, so the database already honoured that token for exactly as long. What changes is that the app layer no longer catches it earlier than the data layer does. For a single-user training log this is immaterial; if Workount ever grows a "sign out all devices" feature that must take effect instantly, this ADR is the thing to revisit.
- Local verification depends on the project keeping **asymmetric** signing keys. If the project is ever reverted to the legacy shared HS256 secret, `getClaims()` silently falls back to a `getUser()` round trip — correct, but the performance win quietly disappears. auth-js handles this transparently; there is nothing to break, only something to notice.
