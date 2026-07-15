import type messages from "../../messages/en.json";
import type { Locale } from "@/lib/i18n/locales";

// Type-safe message keys and locale across the app (next-intl AppConfig
// augmentation). `en.json` is the canonical shape: a divergent `pt-BR.json`
// or a mistyped `t("…")` key becomes a compile error, which is the guardrail
// that keeps ticket 022's "author every string through the catalog" honest.
declare module "next-intl" {
  interface AppConfig {
    Messages: typeof messages;
    Locale: Locale;
  }
}
