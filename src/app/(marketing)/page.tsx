import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  Flame,
  History,
  Split,
  Timer,
  TrendingUp,
  WifiOff,
} from "lucide-react";

import { GoogleSignInButton } from "@/app/sign-in/google-sign-in-button";
import { LandingNav } from "@/components/marketing/landing-nav";
import { PlayerMock } from "@/components/marketing/player-mock";
import { Wordmark } from "@/components/marketing/wordmark";
import { StandaloneRedirect } from "@/components/pwa/standalone-redirect";
import { siteUrl } from "@/lib/site/url";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Landing");

  return {
    // The tab title carries the claim, not the category: "Workount" alone tells
    // a stranger with eleven tabs open nothing at all.
    title: `Workount — ${t("hero.titleTop")}`,
    description: t("hero.body"),
    alternates: { canonical: siteUrl() },
    openGraph: {
      title: `${t("hero.titleTop")} ${t("hero.titleBottom")}`,
      description: t("hero.body"),
      url: siteUrl(),
      siteName: "Workount",
      type: "website",
    },
    twitter: { card: "summary_large_image" },
  };
}

/**
 * `/` — the landing page (ticket 025, ADR-0007).
 *
 * Public: `isPublicPath` lets an anonymous request through, and home lives at
 * `/home`. It deliberately does **not** read the session. A signed-in visitor
 * sees the same page and, on pressing the CTA, is bounced onward by
 * `/sign-in`'s own `if (user) redirect("/home")` — the right destination with
 * no auth round trip added to the one page a stranger loads first.
 */
export default async function LandingPage() {
  const t = await getTranslations("Landing");

  const benefits = [
    {
      icon: WifiOff,
      title: t("benefits.networkTitle"),
      body: t("benefits.networkBody"),
      wide: true,
    },
    {
      icon: History,
      title: t("benefits.lastTimeTitle"),
      body: t("benefits.lastTimeBody"),
    },
    {
      icon: Flame,
      title: t("benefits.warmupsTitle"),
      body: t("benefits.warmupsBody"),
    },
    {
      icon: Timer,
      title: t("benefits.timerTitle"),
      body: t("benefits.timerBody"),
    },
    {
      icon: TrendingUp,
      title: t("benefits.numbersTitle"),
      body: t("benefits.numbersBody"),
    },
    {
      icon: Split,
      title: t("benefits.separationTitle"),
      body: t("benefits.separationBody"),
      full: true,
    },
  ];

  const steps = [
    { n: "01", title: t("how.step1Title"), body: t("how.step1Body") },
    { n: "02", title: t("how.step2Title"), body: t("how.step2Body") },
    { n: "03", title: t("how.step3Title"), body: t("how.step3Body") },
  ];

  // Listed rather than generated from a range: next-intl types message keys,
  // and a template-literal key would need a cast that turns a missing
  // translation from a build error into a runtime one.
  const faqs = [
    { q: t("faq.q1"), a: t("faq.a1") },
    { q: t("faq.q2"), a: t("faq.a2") },
    { q: t("faq.q3"), a: t("faq.a3") },
    { q: t("faq.q4"), a: t("faq.a4") },
    { q: t("faq.q5"), a: t("faq.a5") },
    { q: t("faq.q6"), a: t("faq.a6") },
  ];

  return (
    <>
      {/* An installed launch never belongs on the pitch — see the component. */}
      <StandaloneRedirect />

      <a
        href="#content"
        className="sr-only rounded-lg bg-raised px-4 py-2 text-sm text-ink focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:ring-3 focus:ring-ring/50"
      >
        {t("skipToContent")}
      </a>

      <LandingNav />

      <main id="content" className="flex flex-col">
        {/* ---------------------------------------------------------- Hero */}
        <section className="marketing-glow px-5 pt-16 pb-20 sm:pt-24">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-14 lg:flex-row lg:items-center lg:gap-16">
            <div className="flex max-w-xl flex-col items-center text-center lg:items-start lg:text-left">
              {/* clamp() headings are explicitly a marketing thing in
                  DESIGN.md's typography section — the app's fixed rem scale is
                  for a tool viewed at a consistent distance, which this is not. */}
              <h1 className="text-[clamp(2.25rem,6vw,3.75rem)] leading-[1.05] font-semibold tracking-[-0.02em] text-balance text-ink">
                {t("hero.titleTop")}
                <br />
                <span className="text-ink-muted">{t("hero.titleBottom")}</span>
              </h1>

              <p className="mt-6 max-w-lg text-[1.0625rem] leading-relaxed text-pretty text-ink-muted">
                {t("hero.body")}
              </p>

              <div className="mt-9 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row lg:items-start">
                <div className="w-full sm:w-auto sm:min-w-[15rem]">
                  <GoogleSignInButton />
                </div>
                <a
                  href="#how-it-works"
                  className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-line px-5 text-sm font-medium text-ink transition-colors outline-none hover:bg-raised focus-visible:ring-3 focus-visible:ring-ring/50 sm:w-auto"
                >
                  {t("hero.secondaryCta")}
                </a>
              </div>

              <p className="mt-4 max-w-sm text-xs leading-relaxed text-ink-faint">
                {t("hero.reassurance")}
              </p>
            </div>

            <div className="flex justify-center lg:ml-auto">
              <PlayerMock />
            </div>
          </div>
        </section>

        <hr className="marketing-rule mx-auto w-full max-w-6xl" />

        {/* ------------------------------------------------------ Benefits */}
        <section id="what-it-does" className="scroll-mt-14 px-5 py-20 sm:py-24">
          <div className="mx-auto w-full max-w-6xl">
            <h2 className="text-[clamp(1.75rem,4vw,2.5rem)] leading-tight font-semibold tracking-[-0.02em] text-ink">
              {t("benefits.title")}
            </h2>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {benefits.map(({ icon: Icon, title, body, wide, full }) => (
                <article
                  key={title}
                  className={`marketing-card flex flex-col gap-3 p-6 ${
                    full ? "md:col-span-3" : wide ? "md:col-span-2" : ""
                  }`}
                >
                  <Icon
                    aria-hidden
                    className="size-5 shrink-0 text-ink-faint"
                    strokeWidth={1.75}
                  />
                  <h3 className="text-[1.0625rem] leading-snug font-semibold text-ink">
                    {title}
                  </h3>
                  <p className="max-w-prose text-[0.9375rem] leading-relaxed text-ink-muted">
                    {body}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <hr className="marketing-rule mx-auto w-full max-w-6xl" />

        {/* --------------------------------------------------- How it works */}
        <section id="how-it-works" className="scroll-mt-14 px-5 py-20 sm:py-24">
          <div className="mx-auto w-full max-w-6xl">
            <h2 className="text-[clamp(1.75rem,4vw,2.5rem)] leading-tight font-semibold tracking-[-0.02em] text-ink">
              {t("how.title")}
            </h2>

            <ol className="mt-10 grid gap-4 md:grid-cols-3">
              {steps.map((step) => (
                <li
                  key={step.n}
                  className="marketing-card flex flex-col gap-3 p-6"
                >
                  <span className="font-mono text-xs font-semibold text-signal tabular-nums">
                    {step.n}
                  </span>
                  <h3 className="text-[1.0625rem] leading-snug font-semibold text-ink">
                    {step.title}
                  </h3>
                  <p className="text-[0.9375rem] leading-relaxed text-ink-muted">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <hr className="marketing-rule mx-auto w-full max-w-6xl" />

        {/* ----------------------------------------------------------- FAQ */}
        <section id="faq" className="scroll-mt-14 px-5 py-20 sm:py-24">
          <div className="mx-auto w-full max-w-3xl">
            <h2 className="text-[clamp(1.75rem,4vw,2.5rem)] leading-tight font-semibold tracking-[-0.02em] text-ink">
              {t("faq.title")}
            </h2>

            {/* Native <details>. Keyboard- and screen-reader-correct for free,
                works before hydration, and keeps the page free of client state. */}
            <div className="mt-10 border-t border-line">
              {faqs.map((faq) => (
                <details key={faq.q} className="group border-b border-line">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-[0.9375rem] font-medium text-ink outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                    {faq.q}
                    <span
                      aria-hidden
                      className="shrink-0 text-lg leading-none text-ink-faint transition-transform duration-150 group-open:rotate-45 motion-reduce:transition-none"
                    >
                      +
                    </span>
                  </summary>
                  <p className="max-w-prose pb-5 text-[0.9375rem] leading-relaxed text-ink-muted">
                    {faq.a}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------- Closing CTA */}
        <section className="px-5 pt-4 pb-20 sm:pb-24">
          <div className="marketing-card marketing-glow mx-auto flex w-full max-w-3xl flex-col items-center gap-5 px-6 py-14 text-center">
            <h2 className="text-[clamp(1.5rem,3.5vw,2rem)] leading-tight font-semibold tracking-[-0.02em] text-ink">
              {t("cta.title")}
            </h2>
            <p className="max-w-md text-[0.9375rem] leading-relaxed text-pretty text-ink-muted">
              {t("cta.body")}
            </p>
            <div className="mt-2 w-full max-w-[17rem]">
              <GoogleSignInButton />
            </div>
            <p className="max-w-sm text-xs leading-relaxed text-ink-faint">
              {t("hero.reassurance")}
            </p>
          </div>
        </section>
      </main>

      {/* -------------------------------------------------------- Footer */}
      <footer
        aria-label={t("footer.label")}
        className="border-t border-line px-5 py-10"
      >
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 sm:flex-row sm:items-center">
          <Wordmark />

          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 sm:ml-auto">
            <a
              href="#what-it-does"
              className="text-sm text-ink-muted transition-colors hover:text-ink"
            >
              {t("nav.benefits")}
            </a>
            <a
              href="#how-it-works"
              className="text-sm text-ink-muted transition-colors hover:text-ink"
            >
              {t("nav.howItWorks")}
            </a>
            <a
              href="#faq"
              className="text-sm text-ink-muted transition-colors hover:text-ink"
            >
              {t("nav.faq")}
            </a>
            <Link
              href="/privacy"
              className="text-sm text-ink-muted transition-colors hover:text-ink"
            >
              {t("footer.privacy")}
            </Link>
            <a
              href="https://github.com/luis-gustavoj/workount"
              rel="noreferrer noopener"
              target="_blank"
              className="text-sm text-ink-muted transition-colors hover:text-ink"
            >
              {t("footer.source")}
            </a>
          </nav>

          <p className="text-xs text-ink-faint sm:ml-6">
            {t("footer.rights", { year: new Date().getFullYear() })}
          </p>
        </div>
      </footer>
    </>
  );
}
