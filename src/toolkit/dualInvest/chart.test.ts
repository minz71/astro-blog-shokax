import { describe, expect, it } from "vitest";

import { nearestIndex, niceTicks, sampleWithBreakpoints } from "./chart";

describe("niceTicks", () => {
  it("picks round steps inside the range", () => {
    expect(niceTicks(0, 100, 5)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(niceTicks(83_000, 121_000, 4)).toEqual([90_000, 100_000, 110_000, 120_000]);
    expect(niceTicks(0.1, 0.5, 4)).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
  });

  it("handles degenerate ranges", () => {
    expect(niceTicks(5, 5)).toEqual([5]);
    expect(niceTicks(10, 0, 5)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(niceTicks(Number.NaN, 1)).toEqual([]);
  });
});

describe("sampleWithBreakpoints", () => {
  it("adds both sides of each interior breakpoint", () => {
    const xs = sampleWithBreakpoints(0, 10, 10, [5.5, 20]);
    expect(xs).toContain(5.5);
    expect(xs.some((x) => x < 5.5 && x > 5.49)).toBe(true);
    expect(xs).not.toContain(20);
    expect(xs.toSorted((a, b) => a - b)).toEqual(xs);
  });
});

describe("nearestIndex", () => {
  it("finds the closest sample", () => {
    expect(nearestIndex([0, 1, 2, 3], 2.4)).toBe(2);
    expect(nearestIndex([0, 1, 2, 3], 2.6)).toBe(3);
    expect(nearestIndex([0, 1, 2, 3], -9)).toBe(0);
    expect(nearestIndex([], 1)).toBe(-1);
  });
});
