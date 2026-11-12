import { getTranslations } from "next-intl/server";

import { logCardio } from "@/lib/session/cardio-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/**
 * "Log cardio" (ADR-0008): one form, submitted once the run is over. The
 * session id is minted per render so a double-submit of the same form upserts
 * the same session instead of logging it twice.
 */
export async function CardioLogForm({ workoutId }: { workoutId: string }) {
  const t = await getTranslations("Programs");

  return (
    <section id="log" className="flex flex-col gap-3 border-t border-line pt-5">
      <h2 className="text-sm font-medium">{t("logCardioTitle")}</h2>
      <form action={logCardio} className="flex flex-col gap-3">
        <input type="hidden" name="id" value={crypto.randomUUID()} />
        <input type="hidden" name="workoutId" value={workoutId} />
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="cardio-duration" className="text-sm font-medium">
              {t("durationMinutes")}
            </label>
            <Input id="cardio-duration" name="durationMinutes" inputMode="decimal" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="cardio-distance" className="text-sm font-medium">
              {t("distanceKm")}{" "}
              <span className="text-ink-muted font-normal">· {t("descriptionOptional")}</span>
            </label>
            <Input id="cardio-distance" name="distanceKm" inputMode="decimal" />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="cardio-rpe" className="text-sm font-medium">
            {t("rpe")} <span className="text-ink-muted font-normal">· {t("descriptionOptional")}</span>
          </label>
          <Input id="cardio-rpe" name="rpe" inputMode="decimal" className="w-24" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="cardio-notes" className="text-sm font-medium">
            {t("sessionNotes")}{" "}
            <span className="text-ink-muted font-normal">· {t("descriptionOptional")}</span>
          </label>
          <Textarea id="cardio-notes" name="notes" maxLength={4000} />
        </div>
        <Button type="submit" className="self-start">
          {t("logCardioSubmit")}
        </Button>
      </form>
    </section>
  );
}
