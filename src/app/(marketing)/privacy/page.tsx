import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { LandingNav } from "@/components/marketing/landing-nav";
import { siteUrl } from "@/lib/site/url";

const REPO_URL = "https://github.com/luis-gustavoj/workount";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Privacy");

  return {
    title: `${t("title")} — Workount`,
    description: t("intro"),
    alternates: { canonical: `${siteUrl()}/privacy` },
  };
}

/**
 * `/privacy` — the privacy policy (ticket 025).
 *
 * It exists because ticket 025 opened the app to strangers. Google OAuth plus
 * stored training data, with users in Brazil and potentially the EU, puts the
 * LGPD and the GDPR in play; a personal app shared with friends could get away
 * without one, and a public landing page cannot.
 *
 * Written to be read, not to be defensible. Every claim on this page is one the
 * schema actually enforces — row-level security on every table, no third-party
 * script inside the app — which is the only reason it can be this short.
 */
export default async function PrivacyPage() {
  const t = await getTranslations("Privacy");

  const sections = [
    { title: t("s1Title"), body: t("s1Body") },
    { title: t("s2Title"), body: t("s2Body") },
    { title: t("s3Title"), body: t("s3Body") },
    { title: t("s4Title"), body: t("s4Body") },
    { title: t("s5Title"), body: t("s5Body") },
    { title: t("s6Title"), body: t("s6Body") },
    { title: t("s7Title"), body: t("s7Body") },
  ];

  // Set NEXT_PUBLIC_CONTACT_EMAIL to publish an address. Unset, the page points
  // at the public repository instead of rendering a dead contact section — a
  // privacy policy with no working way to reach a human is worse than one that
  // sends you somewhere slightly indirect.
  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();

  return (
    <>
      <LandingNav />

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-16">
        <h1 className="text-[clamp(2rem,5vw,2.75rem)] leading-tight font-semibold tracking-[-0.02em] text-ink">
          {t("title")}
        </h1>
        <p className="mt-3 text-xs text-ink-faint">{t("updated")}</p>

        <p className="mt-8 text-[1.0625rem] leading-relaxed text-pretty text-ink-muted">
          {t("intro")}
        </p>

        <div className="mt-12 flex flex-col gap-10">
          {sections.map((section) => (
            <section key={section.title} className="flex flex-col gap-3">
              <h2 className="text-[1.125rem] leading-snug font-semibold text-ink">
                {section.title}
              </h2>
              <p className="text-[0.9375rem] leading-relaxed text-ink-muted">
                {section.body}
              </p>
            </section>
          ))}

          <section className="flex flex-col gap-3">
            <h2 className="text-[1.125rem] leading-snug font-semibold text-ink">
              {t("contactTitle")}
            </h2>
            <p className="text-[0.9375rem] leading-relaxed text-ink-muted">
              {email ? (
                t("contactBody", { email })
              ) : (
                <a
                  href={`${REPO_URL}/issues`}
                  rel="noreferrer noopener"
                  target="_blank"
                  className="text-signal underline underline-offset-4"
                >
                  {`${REPO_URL}/issues`}
                </a>
              )}
            </p>
          </section>
        </div>

        <hr className="marketing-rule my-12" />

        <Link
          href="/"
          className="text-sm text-ink-muted transition-colors hover:text-ink"
        >
          ← {t("back")}
        </Link>
      </main>
    </>
  );
}
