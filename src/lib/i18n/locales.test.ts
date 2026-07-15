import { describe, expect, it } from "vitest";

import {
  asLocale,
  DEFAULT_LOCALE,
  isLocale,
  localeFromAcceptLanguage,
  shouldSeedLocale,
} from "./locales";

describe("isLocale / asLocale", () => {
  it("accepts the two supported locales", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("pt-BR")).toBe(true);
  });

  it("rejects anything else, including near-misses and non-strings", () => {
    expect(isLocale("es")).toBe(false);
    expect(isLocale("pt")).toBe(false); // the tag, not our catalog key
    expect(isLocale("PT-BR")).toBe(false); // case-sensitive: it's a stored key
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale(42)).toBe(false);
  });

  it("asLocale returns the locale or null, never a silent default", () => {
    expect(asLocale("pt-BR")).toBe("pt-BR");
    expect(asLocale("garbage")).toBeNull();
    expect(asLocale(undefined)).toBeNull();
  });
});

describe("localeFromAcceptLanguage", () => {
  it("defaults to English when the header is absent or empty", () => {
    expect(localeFromAcceptLanguage(null)).toBe("en");
    expect(localeFromAcceptLanguage(undefined)).toBe("en");
    expect(localeFromAcceptLanguage("")).toBe("en");
    expect(DEFAULT_LOCALE).toBe("en");
  });

  it("maps any Portuguese tag to pt-BR", () => {
    expect(localeFromAcceptLanguage("pt-BR")).toBe("pt-BR");
    expect(localeFromAcceptLanguage("pt")).toBe("pt-BR");
    expect(localeFromAcceptLanguage("pt-PT")).toBe("pt-BR");
    expect(localeFromAcceptLanguage("PT-br")).toBe("pt-BR"); // case-insensitive
  });

  it("maps English tags to en", () => {
    expect(localeFromAcceptLanguage("en")).toBe("en");
    expect(localeFromAcceptLanguage("en-US")).toBe("en");
  });

  it("honours q-weights, not source order", () => {
    // English wins on weight even though Portuguese appears too.
    expect(localeFromAcceptLanguage("en-US,pt;q=0.9")).toBe("en");
    // Portuguese wins when it outranks English.
    expect(localeFromAcceptLanguage("pt-BR,en;q=0.8")).toBe("pt-BR");
    expect(localeFromAcceptLanguage("en;q=0.3,pt;q=0.7")).toBe("pt-BR");
  });

  it("skips languages it cannot serve and picks the best it can", () => {
    expect(localeFromAcceptLanguage("fr-FR,pt;q=0.9,en;q=0.5")).toBe("pt-BR");
    expect(localeFromAcceptLanguage("fr,de,es")).toBe("en"); // none supported
    expect(localeFromAcceptLanguage("*")).toBe("en");
  });
});

describe("shouldSeedLocale", () => {
  const now = Date.parse("2026-07-15T12:00:00Z");

  it("seeds when the auth user was created just now (first sign-in)", () => {
    expect(
      shouldSeedLocale({ created_at: "2026-07-15T12:00:00Z" }, now),
    ).toBe(true);
    expect(
      shouldSeedLocale({ created_at: "2026-07-15T11:59:30Z" }, now),
    ).toBe(true); // 30s ago, within window
  });

  it("does not seed for a returning user", () => {
    expect(
      shouldSeedLocale({ created_at: "2026-07-15T11:00:00Z" }, now),
    ).toBe(false); // an hour ago
  });

  it("does not seed when created_at is missing or unparseable", () => {
    expect(shouldSeedLocale({}, now)).toBe(false);
    expect(shouldSeedLocale({ created_at: null }, now)).toBe(false);
    expect(shouldSeedLocale({ created_at: "not-a-date" }, now)).toBe(false);
  });
});
