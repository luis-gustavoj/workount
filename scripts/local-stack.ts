/**
 * local-stack.ts — resolve credentials for the local Supabase stack.
 *
 * Lifted verbatim from the copy that scripts/test-rls.ts,
 * test-last-performance.ts, test-commit-session.ts and test-history.ts each
 * carry inline (their headers say "update all four if this ever changes").
 * scripts/seed-synthetic.ts and scripts/test-analytics.ts import this instead
 * of adding a fifth and sixth copy; the older four can migrate here whenever
 * one of them next needs touching.
 */
import { execFileSync } from "node:child_process";

export type StackConfig = { url: string; anonKey: string; serviceRoleKey: string };

function fromStatus(): Partial<StackConfig> {
  const candidates: Array<[string, string[]]> = [
    ["supabase", ["status", "-o", "json"]],
    ["npx", ["--yes", "supabase", "status", "-o", "json"]],
  ];
  for (const [cmd, args] of candidates) {
    try {
      const out = execFileSync(cmd, args, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        shell: process.platform === "win32",
      });
      const json = JSON.parse(out) as Record<string, string>;
      return {
        url: json.API_URL,
        anonKey: json.ANON_KEY,
        serviceRoleKey: json.SERVICE_ROLE_KEY,
      };
    } catch {
      // try the next candidate
    }
  }
  return {};
}

export function resolveConfig(): StackConfig {
  let url = process.env.SUPABASE_URL;
  let anonKey = process.env.SUPABASE_ANON_KEY;
  let serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceRoleKey) {
    const status = fromStatus();
    url ??= status.url;
    anonKey ??= status.anonKey;
    serviceRoleKey ??= status.serviceRoleKey;
  }

  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error(
      "Could not resolve Supabase credentials. Start the local stack with " +
        "`supabase db reset` (or `supabase start`), or set SUPABASE_URL, " +
        "SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  return { url, anonKey, serviceRoleKey };
}
