# Design

The visual system for Workount. Read [PRODUCT.md](PRODUCT.md) for the strategy this serves, and [docs/CONTEXT.md](docs/CONTEXT.md) for the vocabulary — the words are load-bearing here too.

## Theme

**An instrument chassis with one live signal.**

The surface is achromatic — chroma exactly `0` at every step of the neutral ramp, in both themes. No warm tint, no cool tint, no "subtle" hue in the greys. This is deliberate and it is the whole idea: because the chassis carries *no* color, the single azure signal is the only chromatic thing on screen, and the eye finds it instantly across a gym, at arm's length, at a glance between sets.

Spending color anywhere else devalues it. The signal marks exactly three things — **the set you are on, the timer that is running, and a record that was just broken** — and nothing else in the app is ever allowed to use it.

The signal is azure, not blue-as-in-dashboard. The hue (245) is deliberately cyan-leaning and the chassis around it is dead neutral, so it reads as an instrument indicator lamp rather than a SaaS accent — the anti-reference PRODUCT.md rules out is *purple-gradient blue on tinted cards*, which this is the opposite of. Azure at hue 245 also sits as far from that reflex as a blue can while staying unambiguously blue.

Both themes are designed, not derived. Dark is the default and the one tuned first (a garage at 6am, the phone the brightest object in the room). Light is a real second design for glare — pure white, maximum ink, not an inverted dark theme.

## Color

OKLCH throughout. Every pair below was checked numerically against WCAG 2.2; the ratios are recorded, not estimated.

### Dark (default)

| Role | OKLCH | Hex | Use |
|---|---|---|---|
| `bg` | `oklch(0.130 0 0)` | `#070707` | The chassis. Page background. |
| `surface` | `oklch(0.175 0 0)` | `#101010` | Grouped regions, the set list. |
| `raised` | `oklch(0.225 0 0)` | `#1c1c1c` | Inputs, steppers, the sheet. |
| `line` | `oklch(0.300 0 0)` | `#2e2e2e` | Rules and borders. Hairlines, never boxes. |
| `ink` | `oklch(0.970 0 0)` | `#f5f5f5` | Readouts and primary text. **18.4:1** |
| `ink-muted` | `oklch(0.730 0 0)` | `#a8a8a8` | Labels, units, secondary text. **8.4:1** |
| `ink-faint` | `oklch(0.600 0 0)` | `#808080` | Completed/settled rows, disabled. **5.1:1** |
| `signal` | `oklch(0.696 0.17 245)` | `#17a5fe` | Live only. Active set, running timer, new PR. **7.5:1** |
| `danger` | `oklch(0.680 0.19 27)` | `#f75e54` | Commit failure, discard. **6.4:1** |
| `warn` | `oklch(0.800 0.14 80)` | `#edb345` | Stale draft, unsaved. **10.6:1** |
| `ok` | `oklch(0.780 0.15 150)` | `#67d283` | Committed. Used once, at finish. **10.6:1** |

### Light

| Role | OKLCH | Hex | Use |
|---|---|---|---|
| `bg` | `oklch(1 0 0)` | `#ffffff` | Pure white. Not off-white, not cream. |
| `surface` | `oklch(0.975 0 0)` | `#f7f7f7` | |
| `raised` | `oklch(0.945 0 0)` | `#ededed` | |
| `line` | `oklch(0.885 0 0)` | `#d9d9d9` | |
| `ink` | `oklch(0.180 0 0)` | `#121212` | **18.8:1** |
| `ink-muted` | `oklch(0.460 0 0)` | `#585858` | **7.1:1** |
| `ink-faint` | `oklch(0.580 0 0)` | `#7a7a7a` | **4.3:1** — large text and UI only, never body. |
| `signal` | `oklch(0.520 0.132 245)` | `#006eaf` | **5.5:1**, and 5.5:1 for white text on the fill. |
| `danger` | `oklch(0.520 0.21 27)` | `#c50516` | **6.2:1** |
| `warn` | `oklch(0.550 0.14 80)` | `#9b6500` | **4.9:1** |
| `ok` | `oklch(0.500 0.13 150)` | `#137738` | **5.7:1** |

**Strategy: Restrained.** The signal never exceeds ~5% of pixels on any screen. Warmup sets are dimmed to `ink-faint` and never signal-colored — they don't count, and the interface says so before you read a word.

**The signal is never decorative.** Not on headings, not on icons, not on borders for emphasis, not as a hover tint. If something is not *live*, it is grey.

## Typography

**IBM Plex Sans** for interface text, **IBM Plex Mono** for every number. One superfamily, two members, paired on a genuine contrast axis (grotesque against monospace) rather than two sans faces that clash by being nearly alike.

Plex was drawn for technical and engineering contexts, which is exactly what this is. It also keeps the app off Inter, the default that would immediately make it read as the SaaS dashboard PRODUCT.md rules out.

**Every numeral in the app is monospaced and tabular.** Weights, reps, the timer, volume, e1RM. This is not a stylistic preference: a proportional `1` is narrower than a `0`, so a counting-down timer *jitters* on every tick and a column of weights fails to align. `font-variant-numeric: tabular-nums` everywhere, no exceptions.

Fixed rem scale, ratio ~1.2. Product UI is viewed at a consistent DPI; fluid `clamp()` headings serve marketing pages, not tools.

| Token | Size / line-height | Weight | Use |
|---|---|---|---|
| `readout-xl` | 3.5rem / 1 | 600, mono | The rest timer. |
| `readout-l` | 2.25rem / 1 | 600, mono | Weight and reps being entered. |
| `readout-m` | 1.25rem / 1.2 | 500, mono | Logged sets, volume, last-time reference. |
| `title` | 1.375rem / 1.25 | 600, sans | Exercise name. |
| `body` | 1rem / 1.5 | 400, sans | Prose, notes, empty states. |
| `label` | 0.8125rem / 1.3 | 500, sans | Field labels, set numbers. |
| `micro` | 0.6875rem / 1.2 | 500, sans, `0.06em` | Units (kg, reps), status words. Sparingly. |

Uppercase tracked micro-text is a real Braun idiom (`kg`, `REPS`, `SET 3 OF 4`) and is used for *units and machine state only* — never as a decorative eyebrow above a section heading.

## Layout

Mobile-first, designed at **390px**. Desktop is a centered 480px column on the same grid; it is a courtesy, not a target.

**Rules, not cards.** Structure comes from 1px hairlines and space, not from bordered, shadowed, rounded containers floating on a tinted background. Cards are the SaaS-dashboard tell; a set list is a *list*, and it should look like one. Nested cards never appear.

The session player uses a fixed three-band layout so nothing reflows under your thumb mid-set:

- **Top** — exercise name, position in the workout, prescription. Static.
- **Middle** — the set list: what you've done, what's next, what you did last time. The only scrolling region.
- **Bottom** — the entry deck: weight, reps, log. Thumb-height, fixed, above the safe-area inset. Never scrolls away.

Spacing scale: `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64`. Radii: `4px` on inputs and steppers, `8px` on the entry deck and sheets, full pill on nothing. Cards top out at 12px — but there are no cards.

Touch targets are ≥44px, and the primary log button is 56px.

## Motion

Functional only. Motion carries information or it does not exist. There is no scroll-reveal, no page-load choreography, no decorative transition anywhere in this app.

- Durations `150–220ms`, easing `cubic-bezier(0.22, 1, 0.36, 1)` (ease-out-quart). No bounce, no elastic.
- **The rest timer** is the one place motion is load-bearing: a ring depletes as time runs out. It is driven from `restEndsAt` (epoch ms) and derived on render — never a decrementing counter, which drifts or freezes exactly when the screen locks. The ring is a redundant encoding, not the message: the numeric readout and a state word carry it without color or shape.
- **A logged set** settles in place — 160ms, opacity and a 2px rise. It does not fly, bounce, or celebrate.
- **A new PR** turns the readout `signal` and holds. That is the entire celebration.

`prefers-reduced-motion: reduce` replaces the ring depletion with a stepped numeric update and every transition with an instant state change. Nothing becomes unusable and nothing becomes invisible.

## Components

Every interactive component ships with default, hover, focus-visible, active, disabled, and where relevant loading and error. Half a component is not a component.

- **Stepper** — the weight/reps control. Big `−` / `+` at 44px minimum, a tabular readout between them, hold-to-repeat. Weight steps by 2.5kg by default (the smallest plate pair), reps by 1. Direct entry via a numeric keypad on tap. This exists because a native number input with 16px spinners is unusable with a chalked thumb.
- **SetRow** — one performed set. Set number, weight × reps, and the last-time reference in `ink-muted` beside it. Warmups render at `ink-faint` with a `w` marker, never a color, never counted.
- **RestTimer** — `restEndsAt`-derived. Depleting ring, monospaced readout, ±15s at 44px. Vibrates and sounds at zero.
- **Banner** — the commit-failure state. Sits above the entry deck, `danger`, with a Retry action. The draft is never destroyed while this is on screen.
- **EmptyState** — teaches. The one place the app is allowed to use sentences.

Icons: **Lucide**, one set, no mixing.

## What this system refuses

Recorded because these are the failures the design is defined against:

- Cards with soft wide shadows on a tinted background.
- Gradient text, glassmorphism, backdrop blur as decoration.
- A stat-tile hero row (big number, small label, ×4).
- Color as the only carrier of any state, anywhere.
- Any celebration copy. "Great job!" is a bug report.
- Proportional numerals.
