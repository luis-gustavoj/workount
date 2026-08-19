import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/current-user";
import { TabBar } from "@/components/nav/tab-bar";

/**
 * The signed-in shell. Every route in the `(app)` group renders inside it, so
 * it is the single place that guarantees a user.
 *
 * The proxy (`src/proxy.ts`) already redirects unauthenticated requests to
 * `/sign-in`, so the `!user` branch here is belt-and-suspenders. `getCurrentUser`
 * verifies the JWT locally and is request-cached (ADR-0006), so this guard costs
 * nothing on top of what the page itself will ask for — the shell makes **zero**
 * queries per navigation.
 *
 * There is no top header. Navigation is the bottom tab bar: this is a phone
 * held one-handed in a gym, where the thumb reaches the bottom of the screen
 * and not the top. Identity and sign-out moved to Settings, which is where you
 * look for them and where they cost no vertical space on every other screen.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        // The header used to carry this. Installed as a PWA the app renders
        // under a translucent status bar (`viewportFit: cover`), so without it
        // the first line of every screen sits beneath the notch.
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        {children}
      </div>
      <TabBar />
    </div>
  );
}
