import { Dumbbell, History, Settings } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { signOut } from "@/lib/auth/actions";
import { profileFromUser } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

/**
 * The signed-in shell. Every route in the `(app)` group renders inside it, so
 * it is the single place that (a) guarantees a user and (b) guarantees that
 * user has a `profiles` row before any child screen reads one.
 *
 * The middleware already redirects unauthenticated requests to `/sign-in`, so
 * the `!user` branch here is belt-and-suspenders — but it also narrows the type
 * for everything below.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("Shell");
  const tHistory = await getTranslations("History");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  // Self-heal (ticket 005). The handle_new_user trigger is the normal path a
  // profile is created, but a signed-in user who somehow has no row must be
  // repaired here, not shown a crash. `maybeSingle` returns null (not an error)
  // when the row is absent, which is exactly the case we recover from.
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  let displayName = profile?.display_name ?? null;
  let avatarUrl = profile?.avatar_url ?? null;
  if (!profile) {
    // Seed locale from Accept-Language on this fallback creation path too, so a
    // Portuguese browser doesn't get an English profile when the trigger missed.
    const seed = profileFromUser(
      user,
      (await headers()).get("accept-language"),
    );
    // ignoreDuplicates so a race with the trigger (or a second tab) is a no-op
    // rather than a unique-violation. RLS permits this insert: the profiles
    // policy allows `id = auth.uid()`, and we are that user.
    await supabase
      .from("profiles")
      .upsert(seed, { onConflict: "id", ignoreDuplicates: true });
    displayName = seed.display_name ?? null;
    avatarUrl = seed.avatar_url ?? null;
  }

  const label = displayName ?? user.email ?? t("signedIn");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[480px] items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {avatarUrl ? (
              // A single remote Google avatar; not worth a next/image
              // remotePatterns entry.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt=""
                width={28}
                height={28}
                // Google's avatar CDN (lh3.googleusercontent.com) returns 403
                // when a cross-origin Referer is sent; without this the image
                // silently breaks, and the initials fallback only covers a null
                // avatar_url, not a failed load.
                referrerPolicy="no-referrer"
                className="size-7 shrink-0 rounded-full border border-line object-cover"
              />
            ) : (
              <span
                aria-hidden
                className="grid size-7 shrink-0 place-items-center rounded-full bg-raised text-xs font-medium text-ink-muted"
              >
                {label.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="truncate text-sm font-medium text-ink">
              {label}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <Button asChild variant="ghost" size="sm">
              <Link href="/" aria-label="Home">
                <Dumbbell className="size-4" />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/history" aria-label={tHistory("title")}>
                <History className="size-4" />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/settings" aria-label={t("settings")}>
                <Settings className="size-4" />
              </Link>
            </Button>
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="sm">
                {t("signOut")}
              </Button>
            </form>
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
