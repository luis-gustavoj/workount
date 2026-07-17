import { describe, expect, it, vi } from "vitest";

import { persistStorageIfInstalled } from "./persist-storage";

describe("persistStorageIfInstalled", () => {
  it("does nothing when not running standalone — ADR-0001 names eviction as a risk only once installed", async () => {
    const persist = vi.fn();
    const result = await persistStorageIfInstalled({
      isStandalone: false,
      storage: { persist, persisted: vi.fn() },
    });

    expect(result).toBe(false);
    expect(persist).not.toHaveBeenCalled();
  });

  it("does nothing when the Storage API isn't available", async () => {
    const result = await persistStorageIfInstalled({
      isStandalone: true,
      storage: undefined,
    });

    expect(result).toBe(false);
  });

  it("skips requesting when persistence was already granted", async () => {
    const persist = vi.fn();
    const persisted = vi.fn().mockResolvedValue(true);
    const result = await persistStorageIfInstalled({
      isStandalone: true,
      storage: { persist, persisted },
    });

    expect(result).toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it("requests persistence once installed and not yet granted", async () => {
    const persist = vi.fn().mockResolvedValue(true);
    const persisted = vi.fn().mockResolvedValue(false);
    const result = await persistStorageIfInstalled({
      isStandalone: true,
      storage: { persist, persisted },
    });

    expect(persist).toHaveBeenCalledOnce();
    expect(result).toBe(true);
  });
});
