import { getTranslations } from "next-intl/server";

import { PROGRAM_DESCRIPTION_MAX, PROGRAM_NAME_MAX } from "@/lib/validation/program";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/**
 * The name + description fields shared by the create form (`/programs/new`) and
 * the edit disclosure (`/programs/[id]`). One component so the two forms can't
 * drift — the HTML `required` / `maxLength` bounds must stay in lockstep with
 * the Zod schema, and keeping the markup in a single place is how they do.
 *
 * `defaults` prefills the edit form; omitted, the create form starts blank and
 * focuses the name field.
 */
export async function ProgramFields({
  defaults,
}: {
  defaults?: { name: string; description: string };
}) {
  const t = await getTranslations("Programs");
  const isEdit = defaults !== undefined;

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="text-sm font-medium">
          {t("nameLabel")}
        </label>
        <Input
          id="name"
          name="name"
          required
          maxLength={PROGRAM_NAME_MAX}
          autoComplete="off"
          autoFocus={!isEdit}
          placeholder={isEdit ? undefined : t("namePlaceholder")}
          defaultValue={defaults?.name}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className="flex items-baseline gap-2">
          <span className="text-sm font-medium">{t("descriptionLabel")}</span>
          <span className="text-ink-muted text-xs">
            {t("descriptionOptional")}
          </span>
        </label>
        <Textarea
          id="description"
          name="description"
          rows={3}
          maxLength={PROGRAM_DESCRIPTION_MAX}
          placeholder={isEdit ? undefined : t("descriptionPlaceholder")}
          defaultValue={defaults?.description}
        />
      </div>
    </>
  );
}
