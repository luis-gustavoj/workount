import { redirect } from "next/navigation";

import { getHomeData } from "@/lib/home/query";
import { createClient } from "@/lib/supabase/server";

import { HomeScreen } from "./home-screen";

/**
 * `/` — home (ticket 015, SPEC.md §4). Fetches everything server-side except
 * the draft, which only exists in the browser's IndexedDB (ADR-0001) — that
 * half of `resolveHome`'s input is read inside `HomeScreen` itself.
 */
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const data = await getHomeData(supabase, user.id);

  return <HomeScreen data={data} />;
}
