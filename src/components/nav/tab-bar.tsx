"use client";

import { Clock, Dumbbell, House, Settings } from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { hasTabBar, isTabActive, TABS } from "@/lib/nav/routes";

const ICONS = {
  "/": House,
  "/programs": Dumbbell,
  "/history": Clock,
  "/settings": Settings,
} as const;

/**
 * The contents of one tab, rendered *inside* its `<Link>` so it can read
 * `useLinkStatus()` — which is only meaningful for a descendant of the link it
 * describes.
 *
 * `pending` is why this component exists. Even with a `loading.tsx` on every
 * route, the tap itself needs an answer before the next screen's skeleton
 * arrives; without it the bar sits inert for the duration of the round trip and
 * the tap reads as ignored.
 */
function TabContents({
  active,
  label,
  Icon,
}: {
  active: boolean;
  label: string;
  Icon: (typeof ICONS)[keyof typeof ICONS];
}) {
  const { pending } = useLinkStatus();
  // Light the tab the moment it is tapped, before its route resolves. The
  // destination is already known — waiting for the server to confirm it is
  // what made this app feel unresponsive in the first place.
  const lit = active || pending;

  return (
    <span
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-1 pt-2 pb-1.5 transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
        // DESIGN.md: the signal is never decorative and never appears on
        // icons — it marks live things only (the active set, a running timer,
        // a new PR). Selection here is carried by luminance and weight, plus
        // the rule above the tab, so it is never colour alone.
        lit ? "text-ink" : "text-ink-faint",
        pending && "animate-pulse",
      )}
    >
      {/* The indicator rule. Rendered always, transparent when inactive, so
          the row's height never changes as selection moves. */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-x-0 top-0 h-0.5 rounded-full transition-colors duration-150",
          lit ? "bg-ink" : "bg-transparent",
        )}
      />
      <Icon className="size-5" strokeWidth={lit ? 2.25 : 1.75} />
      <span className={cn("text-[0.6875rem] leading-none", lit && "font-medium")}>
        {label}
      </span>
    </span>
  );
}

/**
 * The bottom tab bar — the app's primary navigation (SPEC §4).
 *
 * It lives at the bottom because this is a phone held one-handed in a gym: the
 * thumb reaches the bottom of the screen and not the top. It replaced a top
 * header that also carried identity and sign-out; both moved to Settings,
 * which bought back ~110px of vertical space on the screens that need it.
 *
 * A client component for two reasons: it needs `usePathname` to know which tab
 * is current, and `useLinkStatus` to answer a tap immediately.
 */
export function TabBar() {
  const t = useTranslations("Shell");
  const pathname = usePathname();

  if (!hasTabBar(pathname)) return null;

  return (
    <nav
      aria-label={t("primaryNav")}
      // Solid, not translucent: DESIGN.md refuses backdrop blur as decoration,
      // and this bar sits in the flex column rather than floating over
      // content, so there is nothing to see through it.
      className="shrink-0 border-t border-line bg-bg"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex w-full max-w-[480px] items-stretch">
        {TABS.map((tab) => {
          const active = isTabActive(tab.href, pathname);
          const Icon = ICONS[tab.href];
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              // min-h-14: touch targets are >=44px (DESIGN.md).
              className="relative flex min-h-14 flex-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <TabContents
                active={active}
                label={t(tab.labelKey)}
                Icon={Icon}
              />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
