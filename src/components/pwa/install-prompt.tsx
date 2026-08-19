"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import {
  detectPlatform,
  shouldShowInstallBanner,
  type InstallPlatform,
} from "@/lib/pwa/install-prompt";
import { hasTabBar, TAB_BAR_HEIGHT } from "@/lib/nav/routes";
import { isStandalone } from "@/lib/pwa/is-standalone";
import { Button } from "@/components/ui/button";

const DISMISSED_KEY = "workount:install-dismissed";

// Chrome/Edge/etc. fire this instead of installing immediately, and expect
// `preventDefault()` + a later `.prompt()` call from our own UI.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
};

/**
 * Ticket 019: install prompt shown non-annoyingly — once, dismissible, never
 * again. iOS Safari never fires `beforeinstallprompt` (no programmatic
 * install API exists there), so it gets static "Add to Home Screen"
 * instructions instead of a button; every other platform waits for the
 * browser's own event before offering to install.
 *
 * Platform/standalone/dismissed are read via lazy `useState` initializers
 * (matching `rest-sheet.tsx`'s `usePrefersReducedMotion`), not set from an
 * effect — the effect below exists only to subscribe to the
 * `beforeinstallprompt` event, which genuinely can't be known any other way.
 */
export function InstallPrompt() {
  const t = useTranslations("Pwa");
  const pathname = usePathname();
  const [platform] = useState<InstallPlatform>(() =>
    typeof navigator === "undefined" ? "other" : detectPlatform(navigator.userAgent),
  );
  const [standalone] = useState(isStandalone);
  const [dismissed, setDismissed] = useState(() =>
    typeof localStorage === "undefined"
      ? true
      : localStorage.getItem(DISMISSED_KEY) === "1",
  );
  const [deferredEvent, setDeferredEvent] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredEvent(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () =>
      window.removeEventListener(
        "beforeinstallprompt",
        onBeforeInstallPrompt,
      );
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
  };

  const install = async () => {
    await deferredEvent?.prompt();
    dismiss();
  };

  const show = shouldShowInstallBanner({
    platform,
    isStandalone: standalone,
    dismissed,
    hasInstallEvent: deferredEvent !== null,
  });

  if (!show) return null;

  return (
    <div
      className="fixed inset-x-0 z-20 border-t border-line bg-raised px-4 py-3"
      // Sit above the bottom tab bar rather than over it. On screens without a
      // bar — sign-in, the session player — the offset is zero and this pins to
      // the bottom exactly as it always did.
      style={{ bottom: hasTabBar(pathname) ? TAB_BAR_HEIGHT : 0 }}
    >
      <div className="mx-auto flex w-full max-w-[480px] items-center gap-3">
        <p className="flex-1 text-sm text-ink">
          {platform === "ios" ? t("iosInstructions") : t("body")}
        </p>
        {platform !== "ios" && (
          <Button size="sm" onClick={install}>
            {t("install")}
          </Button>
        )}
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={t("dismiss")}
          onClick={dismiss}
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}
