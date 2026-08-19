import { Dumbbell, History, Settings } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { signOut } from "@/lib/auth/actions";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

/**
 * The signed-in shell. Every route in the `(app)` group renders inside it, so
 * it is the single place that guarantees a user.
 *
 * The proxy (`src/proxy.ts`) already redirects unauthenticated requests to
 * `/sign-in`, so the `!user` branch here is belt-and-suspenders — but it also
 * narrows the type for everything below. `getCurrentUser` is request-cached
 * (ADR-0006), so this costs nothing on top of what the page itself will ask
 * for.
 *
 * Creating the `profiles` row is no longer this layout's job: that repair moved
 * to the OAuth callback, where a row can actually be missing, instead of being
 * re-checked on every single navigation.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("Shell");
  const tHistory = await getTranslations("History");
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  // Read-only: the row is guaranteed by the handle_new_user trigger and
  // repaired at sign-in. `maybeSingle` still tolerates its absence rather than
  // erroring — the header just falls back to the email.
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  const displayName = profile?.display_name ?? null;
  const avatarUrl = profile?.avatar_url ?? null;

  const label = displayName ?? user.email ?? t("signedIn");

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header
        className="sticky top-0 z-10 border-b border-line bg-surface/80 backdrop-blur"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
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

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
    </div>
  );
}
