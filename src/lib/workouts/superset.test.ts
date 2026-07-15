import { describe, expect, it } from "vitest";

import {
  availableSupersetGroups,
  lonelySupersetGroups,
  supersetAccentIndexes,
} from "./superset";

function item(supersetGroup: string | null) {
  return { supersetGroup };
}

describe("lonelySupersetGroups", () => {
  it("returns an empty set when there are no items", () => {
    expect(lonelySupersetGroups([])).toEqual(new Set());
  });

  it("returns an empty set when no item has a superset group", () => {
    expect(lonelySupersetGroups([item(null), item(null)])).toEqual(new Set());
  });

  it("does not flag a group with two or more members", () => {
    expect(lonelySupersetGroups([item("A"), item("A")])).toEqual(new Set());
  });

  it("flags a group with exactly one member", () => {
    expect(lonelySupersetGroups([item("A"), item(null)])).toEqual(new Set(["A"]));
  });

  it("flags multiple lonely groups independently", () => {
    expect(lonelySupersetGroups([item("A"), item("B"), item("C"), item("C")])).toEqual(
      new Set(["A", "B"]),
    );
  });

  it("stops flagging a group once a second member joins it", () => {
    expect(lonelySupersetGroups([item("A"), item("A"), item("B")])).toEqual(new Set(["B"]));
  });
});

describe("availableSupersetGroups", () => {
  it("offers only 'A' for an empty workout", () => {
    expect(availableSupersetGroups([])).toEqual(["A"]);
  });

  it("offers 'A' when no item is grouped yet", () => {
    expect(availableSupersetGroups([item(null), item(null)])).toEqual(["A"]);
  });

  it("includes every group already in use, plus the next unused letter", () => {
    expect(availableSupersetGroups([item("A"), item("A")])).toEqual(["A", "B"]);
  });

  it("fills a gap rather than always extending the alphabet", () => {
    expect(availableSupersetGroups([item("A"), item("C")])).toEqual(["A", "B", "C"]);
  });

  it("de-duplicates repeated groups", () => {
    expect(availableSupersetGroups([item("B"), item("B"), item("B")])).toEqual(["A", "B"]);
  });

  it("keeps the result sorted alphabetically", () => {
    expect(availableSupersetGroups([item("C"), item("A")])).toEqual(["A", "B", "C"]);
  });
});

describe("supersetAccentIndexes", () => {
  it("returns an empty map when no item has a superset group", () => {
    expect(supersetAccentIndexes([item(null), item(null)])).toEqual(new Map());
  });

  it("assigns a single group index 0", () => {
    expect(supersetAccentIndexes([item("A"), item("A")])).toEqual(new Map([["A", 0]]));
  });

  it("assigns two different groups two different indexes, by first appearance", () => {
    expect(
      supersetAccentIndexes([item("A"), item("B"), item("A"), item("B")]),
    ).toEqual(
      new Map([
        ["A", 0],
        ["B", 1],
      ]),
    );
  });

  it("orders by first appearance in the list, not alphabetically", () => {
    expect(supersetAccentIndexes([item("C"), item("A"), item("C"), item("A")])).toEqual(
      new Map([
        ["C", 0],
        ["A", 1],
      ]),
    );
  });

  it("cycles back to index 0 for a third concurrent group", () => {
    expect(supersetAccentIndexes([item("A"), item("B"), item("C")])).toEqual(
      new Map([
        ["A", 0],
        ["B", 1],
        ["C", 0],
      ]),
    );
  });
});
