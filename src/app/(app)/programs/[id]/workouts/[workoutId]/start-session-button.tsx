"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { startSession } from "@/lib/session/start";

/**
 * Starts a session from this workout (ticket 011's `startSession`) and hands
 * off to `/session` (ticket 012). This is the only place in the app that
 * calls `startSession` — everywhere downstream of this click runs with zero
 * network calls, per ADR-0001.
 */
export function StartSessionButton({ workoutId }: { workoutId: string }) {
  const t = useTranslations("WorkoutDetail");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        type="button"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              await startSession(createClient(), workoutId);
              router.push("/session");
            } catch {
              setError(t("startSessionError"));
            }
          });
        }}
      >
        {t("startSession")}
      </Button>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
