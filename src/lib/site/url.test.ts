import { afterEach, describe, expect, it, vi } from "vitest";

import { siteUrl } from "./url";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("siteUrl", () => {
  it("prefers the explicit variable", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://workount.app");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "workount.vercel.app");
    expect(siteUrl()).toBe("https://workount.app");
  });

  it("strips a trailing slash, so callers can concatenate paths safely", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://workount.app/");
    expect(siteUrl()).toBe("https://workount.app");
  });

  it("falls back to Vercel's production host, with a scheme", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "workount.vercel.app");
    expect(siteUrl()).toBe("https://workount.vercel.app");
  });

  it("falls back to localhost so a local build still produces parseable URLs", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    expect(siteUrl()).toBe("http://localhost:8888");
  });
});
