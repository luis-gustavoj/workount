"use client";

import { useEffect } from "react";

import { isStandalone } from "@/lib/pwa/is-standalone";
import { persistStorageIfInstalled } from "@/lib/pwa/persist-storage";
import { registerServiceWorker } from "@/lib/pwa/register-service-worker";

/**
 * Ticket 019. Mounted once in the root layout — registers the offline app
 * shell and requests persistent storage. Renders nothing; both effects are
 * fire-and-forget browser-API calls with no UI of their own (the install
 * banner is `InstallPrompt`, kept separate because it does render).
 */
export function PwaShell() {
  useEffect(() => {
    registerServiceWorker();

    void persistStorageIfInstalled({
      isStandalone: isStandalone(),
      storage: navigator.storage,
    });
  }, []);

  return null;
}
