"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";

import { LOCALE_COOKIE, LOCALE_COOKIE_OPTIONS, LOCALES } from "@/lib/i18n/locales";
import { createClient } from "@/lib/supabase/server";

// Zod at the boundary (CLAUDE.md): only a known locale reaches the database.
const setLocaleSchema = z.object({ locale: z.enum(LOCALES) });

/**
 * Change the signed-in user's display language (ADR-0005). Mirrors how
 * `weight_unit` is changed: a Zod-validated Server Action that writes one
 * column on the user's own profile row.
 *
 * `profiles.locale` is the source of truth; the `locale` cookie is a render-path
 * mirror, so we write both — the cookie makes the next render read the new
 * language without a database round trip, and `revalidatePath` re-renders the
 * whole tree (the layout's `<html lang>` and every translated string) under it.
 */
export async function setLocale(formData: FormData) {
  const { locale } = setLocaleSchema.parse({ locale: formData.get("locale") });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("profiles")
    .update({ locale })
    .eq("id", user.id);
  if (error) throw error;

  (await cookies()).set(LOCALE_COOKIE, locale, LOCALE_COOKIE_OPTIONS);

  revalidatePath("/", "layout");
}
