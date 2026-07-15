import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { createProgram } from "@/app/(app)/programs/actions";
import { ProgramFields } from "@/app/(app)/programs/program-fields";
import { Button } from "@/components/ui/button";

/**
 * `/programs/new` — create a program (ticket 006). A plain `<form action>` that
 * posts to the `createProgram` Server Action, so it works without client JS
 * (CLAUDE.md: Server Actions for mutations). The HTML `required` / `maxLength`
 * attributes mirror the Zod schema, giving inline feedback before submit while
 * Zod stays the authoritative boundary.
 */
export default async function NewProgramPage() {
  const t = await getTranslations("Programs");

  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-col gap-6 px-4 py-8">
      <Button asChild variant="ghost" size="sm" className="-ml-2 self-start">
        <Link href="/programs">
          <ChevronLeft className="size-4" />
          {t("back")}
        </Link>
      </Button>

      <h1 className="text-[1.375rem] leading-tight font-semibold">
        {t("newTitle")}
      </h1>

      <form action={createProgram} className="flex flex-col gap-5">
        <ProgramFields />

        <div className="flex items-center gap-2">
          <Button type="submit">{t("create")}</Button>
          <Button asChild variant="ghost">
            <Link href="/programs">{t("cancel")}</Link>
          </Button>
        </div>
      </form>
    </main>
  );
}
