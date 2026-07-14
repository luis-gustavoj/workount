# Product

## Register

product

## Platform

web

## Users

People who follow a written strength-training program and log every set of it — they already know what a superset, a rep range, and an e1RM are, and the app never has to explain those words to them.

Their context is the constraint. They open this on a phone, one-handed, mid-set, sometimes with a barbell loaded in front of them and sweat on the screen. The gym has no signal. Training hours are unpredictable: the same person opens it in a dim garage at 6am and under fluorescent lights at noon.

The job is progressive overload: *see what I lifted last time, beat it, record that I did.*

Today the users are the author and their friends. The intent is to open it to strangers eventually, so first-run and empty states have to teach someone their first program — but the working screens must not slow down the expert to do it.

## Product Purpose

Track training **programs** (the plan) and log training **sessions** (the performance), keeping the two permanently distinct so that editing next month's plan can never rewrite what you did last month.

Success is the acceptance test in SPEC §6: build a program, follow it, train a full session in airplane mode, kill the browser mid-workout, reopen to find it exactly where you left it, then finish and see it committed. Step 6 is the one that matters.

## Positioning

The session player never needs a network, because it was never designed to want one. Every other training app treats offline as a degraded mode to survive; here it is simply the normal case.

## Brand Personality

Quiet, precise, unsentimental. An instrument, not a coach.

The app reports the number and gets out of the way. It does not congratulate, encourage, or editorialize. A PR is *marked*, not celebrated — the fact is the reward, and a lifter who just hit one does not need an app to tell them it was good.

The nearest reference is Braun and Vitsœ: an industrial-design restraint where the readout is the interface, labels are small and exact, everything sits on a strict grid, and a single signal color is spent sparingly on the one thing that is live right now.

## Anti-references

- **The generic SaaS dashboard.** Rounded cards floating on cream, soft wide shadows, a hero row of stat tiles, purple gradients. The default output of every design tool, and the exact shape this must not take.
- **Apple Fitness gloss.** Glassmorphism, rainbow rings, animated gradients, heavy blur. Consumer-lifestyle polish applied to what is really a logbook.
- Neon-on-black lifting apps were not named as an anti-reference but are ruled out anyway: electric green on pure black with angular type is the category reflex.

## Design Principles

**The set you're on is the only thing on screen.** Everything that is not the current set is either one level quieter or not rendered. The session player is the product; the rest of the app exists to get you into it.

**Instrument, not coach.** State the number. No praise, no exclamation marks, no motivational copy. The strongest thing the app can say about a 5kg PR is the digit that changed.

**Plan and performance are different objects, and the UI must never blur them.** A *workout* is edited; a *session* happened. Anywhere the interface lets those two words touch, it is wrong.

**Offline is not an error state.** The player shows no spinner, no "reconnecting", no apology for having no signal. It never had one and never wanted one. The only network moments the user ever sees are start and finish.

**Nothing that requires precision.** One hand, sweat, poor light, a resting heart rate of 140. If a control needs a steady thumb, it is the wrong control.

## Accessibility & Inclusion

WCAG 2.2 AA, enforced rather than aspired to: 4.5:1 for body text, 3:1 for large text and UI components, verified numerically rather than by eye.

Session-player controls are ≥44px. The rest timer must never rely on color alone to communicate state — it carries a numeric readout and a shape change as well. Every animation has a `prefers-reduced-motion` alternative. The app must be fully usable at 390px with one thumb.
