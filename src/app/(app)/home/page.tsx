import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/current-user";
import { getHomeData } from "@/lib/home/query";
import { createClient } from "@/lib/supabase/server";

import { HomeScreen } from "./home-screen";

/**
 * `/home` — home (tickets 015 / 024 / 025, SPEC.md §4). It moved off `/` when
 * the landing page took the bare domain (ADR-0007). Fetches everything server-side
 * in one round trip except the draft, which only exists in the browser's
 * IndexedDB (ADR-0001) — that half of `resolveHome`'s input is read inside
 * `HomeScreen` itself.
 */
export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  // No user id argument: get_home_data is RLS-scoped to the caller and reads
  // auth.uid() itself.
  const data = await getHomeData(await createClient());

  return <HomeScreen data={data} />;
}
