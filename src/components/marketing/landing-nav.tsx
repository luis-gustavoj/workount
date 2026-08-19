import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Wordmark } from "./wordmark";

/**
 * The sticky landing-page nav.
 *
 * Sticky within the marketing scroll container, not the document — the root
 * layout's body does not scroll (see `(marketing)/layout.tsx`), so `position:
 * sticky` here resolves against that container. It works out the same on
 * screen; it is only worth knowing if you ever wonder why `top-0` is enough.
 *
 * There is no hamburger. Three anchors do not justify a menu, a menu would be
 * the only piece of client-side state on an otherwise static page, and on a
 * phone the section links are the least valuable thing in the bar anyway — so
 * below `md` they simply drop and the sign-in link stays.
 */
export async function LandingNav() {
  const t = await getTranslations("Landing");
  const tSignIn = await getTranslations("SignIn");

  const sections = [
    { href: "#what-it-does", label: t("nav.benefits") },
    { href: "#how-it-works", label: t("nav.howItWorks") },
    { href: "#faq", label: t("nav.faq") },
  ];

  return (
    <header className="sticky top-0 z-30">
      {/* Opaque rather than blurred. A backdrop-filter over a page this dark
          buys almost nothing visually and costs a compositing layer that
          repaints on every scroll frame — on the mid-range Android this page
          is most likely to be opened on, that is the difference between a
          smooth scroll and a sticky one. */}
      <div className="border-b border-line bg-bg/95">
        <nav
          aria-label={t("nav.label")}
          className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-5"
        >
          <Link
            href="/"
            className="rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Wordmark />
          </Link>

          <ul className="ml-auto hidden items-center gap-7 md:flex">
            {sections.map((section) => (
              <li key={section.href}>
                <a
                  href={section.href}
                  className="rounded-sm text-sm text-ink-muted transition-colors outline-none hover:text-ink focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>

          {/* A link, not the OAuth button. The hero and the closing CTA fire
              sign-in directly; this one is the escape hatch for someone who
              already has an account and just wants the door — and /sign-in
              bounces them straight to /home if they are already signed in. */}
          <Link
            href="/sign-in"
            className="ml-auto rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink transition-colors outline-none hover:bg-raised focus-visible:ring-3 focus-visible:ring-ring/50 md:ml-0"
          >
            {tSignIn("continueWithGoogle")}
          </Link>
        </nav>
      </div>
    </header>
  );
}
