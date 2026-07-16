import { describe, expect, it, vi } from "vitest";

import { HISTORY_PAGE_SIZE, getHistoryList, getSessionDetail } from "./query";

// query.ts is the I/O shell around v_session_summary / session_sets / the
// get_session_prs RPC (ticket 016). These tests fake the Supabase client's
// chainable, thenable query builder rather than hitting a real database —
// see src/lib/session/start.test.ts for the sibling pattern this borrows.

function chainable(result: { data: unknown; error: unknown }) {
  const obj: Record<string, unknown> = {};
  obj.select = vi.fn(() => obj);
  obj.eq = vi.fn(() => obj);
  obj.order = vi.fn(() => obj);
  obj.range = vi.fn(() => obj);
  obj.maybeSingle = vi.fn(() => Promise.resolve(result));
  obj.then = (
    onFulfilled: (v: typeof result) => unknown,
    onRejected?: (r: unknown) => unknown,
  ) => Promise.resolve(result).then(onFulfilled, onRejected);
  return obj;
}

function summaryRow(overrides: Record<string, unknown> = {}) {
  return {
    session_id: "sess-1",
    workout_name: "Push A",
    completed_at: "2026-07-15T18:00:00.000Z",
    duration_seconds: 3120,
    total_volume: 4200,
    set_count: 18,
    ...overrides,
  };
}

describe("getHistoryList", () => {
  it("filters to completed sessions, newest first", async () => {
    const listResult = chainable({ data: [], error: null });
    const from = vi.fn(() => listResult);
    await getHistoryList({ from } as never, { offset: 0 });

    expect(from).toHaveBeenCalledWith("v_session_summary");
    expect(listResult.eq).toHaveBeenCalledWith("status", "completed");
    expect(listResult.order).toHaveBeenCalledWith("completed_at", {
      ascending: false,
    });
  });

  it("requests one row beyond the page size, at the given offset, to detect a next page without a count query", async () => {
    const listResult = chainable({ data: [], error: null });
    const from = vi.fn(() => listResult);
    await getHistoryList({ from } as never, { offset: 40 });

    expect(listResult.range).toHaveBeenCalledWith(40, 40 + HISTORY_PAGE_SIZE);
  });

  it("reports hasMore=false and returns every row when fewer than page-size+1 come back", async () => {
    const rows = Array.from({ length: HISTORY_PAGE_SIZE }, (_, i) =>
      summaryRow({ session_id: `s${i}` }),
    );
    const from = vi.fn(() => chainable({ data: rows, error: null }));

    const { sessions, hasMore } = await getHistoryList({ from } as never, {
      offset: 0,
    });

    expect(hasMore).toBe(false);
    expect(sessions).toHaveLength(HISTORY_PAGE_SIZE);
  });

  it("reports hasMore=true and trims the extra row when page-size+1 rows come back", async () => {
    const rows = Array.from({ length: HISTORY_PAGE_SIZE + 1 }, (_, i) =>
      summaryRow({ session_id: `s${i}` }),
    );
    const from = vi.fn(() => chainable({ data: rows, error: null }));

    const { sessions, hasMore } = await getHistoryList({ from } as never, {
      offset: 0,
    });

    expect(hasMore).toBe(true);
    expect(sessions).toHaveLength(HISTORY_PAGE_SIZE);
    expect(sessions.map((s) => s.id)).not.toContain(`s${HISTORY_PAGE_SIZE}`);
  });

  it("passes a deleted workout's null name through unchanged (UI decides the fallback label)", async () => {
    const rows = [summaryRow({ workout_name: null })];
    const from = vi.fn(() => chainable({ data: rows, error: null }));

    const { sessions } = await getHistoryList({ from } as never, { offset: 0 });

    expect(sessions[0].workoutName).toBeNull();
  });

  it("maps volume, duration and set count straight through", async () => {
    const rows = [
      summaryRow({ total_volume: 4200, duration_seconds: 3120, set_count: 18 }),
    ];
    const from = vi.fn(() => chainable({ data: rows, error: null }));

    const { sessions } = await getHistoryList({ from } as never, { offset: 0 });

    expect(sessions[0]).toMatchObject({
      id: "sess-1",
      workoutName: "Push A",
      completedAt: "2026-07-15T18:00:00.000Z",
      durationSeconds: 3120,
      totalVolumeKg: 4200,
      setCount: 18,
    });
  });
});

function fakeDetailSupabase(
  options: {
    summary?: Record<string, unknown> | null;
    sets?: Record<string, unknown>[];
    prSessionSetIds?: string[];
  } = {},
) {
  const { summary = summaryRow(), sets = [], prSessionSetIds = [] } = options;

  const from = vi.fn((table: string) => {
    switch (table) {
      case "v_session_summary":
        return chainable({ data: summary, error: null });
      case "session_sets":
        return chainable({ data: sets, error: null });
      default:
        throw new Error(`unexpected table: ${table}`);
    }
  });
  const rpc = vi.fn().mockResolvedValue({
    data: prSessionSetIds.map((session_set_id) => ({ session_set_id })),
    error: null,
  });

  return { from, rpc };
}

function setRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "set-1",
    exercise_id: "ex-1",
    position: 0,
    set_number: 1,
    weight: 80,
    reps: 8,
    is_warmup: false,
    target_rep_min: 8,
    target_rep_max: 10,
    exercise: { name: "Barbell Bench Press" },
    ...overrides,
  };
}

describe("getSessionDetail", () => {
  it("returns null when the summary row isn't found (wrong owner, or no such session)", async () => {
    const supabase = fakeDetailSupabase({ summary: null });
    const detail = await getSessionDetail(supabase as never, "sess-1");
    expect(detail).toBeNull();
  });

  it("maps every set with its exercise name and the snapshotted rep range", async () => {
    const supabase = fakeDetailSupabase({ sets: [setRow()] });
    const detail = await getSessionDetail(supabase as never, "sess-1");

    expect(detail?.sets[0]).toMatchObject({
      id: "set-1",
      exerciseName: "Barbell Bench Press",
      weight: 80,
      reps: 8,
      isWarmup: false,
      targetRepMin: 8,
      targetRepMax: 10,
    });
  });

  it("marks a set as a warmup, still included in the list", async () => {
    const supabase = fakeDetailSupabase({
      sets: [setRow({ id: "set-warmup", is_warmup: true })],
    });
    const detail = await getSessionDetail(supabase as never, "sess-1");
    expect(detail?.sets[0].isWarmup).toBe(true);
  });

  it("badges only the sets returned by get_session_prs, nothing else", async () => {
    const supabase = fakeDetailSupabase({
      sets: [setRow({ id: "set-1" }), setRow({ id: "set-2", set_number: 2 })],
      prSessionSetIds: ["set-2"],
    });
    const detail = await getSessionDetail(supabase as never, "sess-1");

    expect(detail?.sets.find((s) => s.id === "set-1")?.isPr).toBe(false);
    expect(detail?.sets.find((s) => s.id === "set-2")?.isPr).toBe(true);
  });

  it("passes the session id to get_session_prs", async () => {
    const supabase = fakeDetailSupabase({ sets: [setRow()] });
    await getSessionDetail(supabase as never, "sess-1");
    expect(supabase.rpc).toHaveBeenCalledWith("get_session_prs", {
      p_session_id: "sess-1",
    });
  });

  it("falls back to a null workout name when the workout was deleted", async () => {
    const supabase = fakeDetailSupabase({
      summary: summaryRow({ workout_name: null }),
    });
    const detail = await getSessionDetail(supabase as never, "sess-1");
    expect(detail?.workoutName).toBeNull();
  });
});
