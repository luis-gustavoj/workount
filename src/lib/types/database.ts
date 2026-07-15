// Generated database types — PLACEHOLDER.
//
// Regenerate once the schema migration lands (ticket 003):
//
//   supabase gen types typescript --local > src/lib/types/database.ts
//
// Until then this is a structurally valid but empty schema, so the typed
// Supabase clients (`createServerClient<Database>` / `createBrowserClient<Database>`)
// compile. It intentionally has no tables — reaching for one is a type error,
// which is the desired signal that types are not generated yet.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
