import { describe, expect, it } from "vitest";

import { softStarPath } from "./softStar";

/** 把路径里的数字全部取出来，两两一组当座标。 */
function points(path: string): Array<[number, number]> {
  const numbers = (path.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const result: Array<[number, number]> = [];
  for (let i = 0; i < numbers.length; i += 2) result.push([numbers[i], numbers[i + 1]]);
  return result;
}

describe("softStarPath", () => {
  const path = softStarPath({ cx: 50, cy: 50, outer: 40, inner: 20 });

  it("is one closed path with a rounded curve at each of the ten corners", () => {
    expect(path.startsWith("M")).toBe(true);
    expect(path.endsWith("Z")).toBe(true);
    expect(path.match(/Q/g)).toHaveLength(10);
    expect(path.match(/L/g)).toHaveLength(9);
  });

  it("stays inside the outer radius", () => {
    for (const [x, y] of points(path)) {
      expect(Math.hypot(x - 50, y - 50)).toBeLessThanOrEqual(40.01);
    }
  });

  it("puts the top corner's control point straight above the centre", () => {
    // 第一段是 M 进入点、Q 控制点（角点本身）、离开点
    const [, control] = points(path);
    expect(control[0]).toBeCloseTo(50, 2);
    expect(control[1]).toBeCloseTo(10, 2);
  });

  it("degenerates to the sharp star when rounding is zero", () => {
    const sharp = softStarPath({ cx: 0, cy: 0, outer: 10, inner: 5, roundOuter: 0, roundInner: 0 });
    // 退 0 时进入点、控制点、离开点重合在角上
    const [enter, control, leave] = points(sharp);
    expect(enter).toEqual(control);
    expect(leave).toEqual(control);
  });

  it("is symmetric about the vertical axis", () => {
    const xs = points(path).map(([x]) => x - 50);
    const left = xs.filter((x) => x < -0.01).length;
    const right = xs.filter((x) => x > 0.01).length;
    expect(left).toBe(right);
  });
});
