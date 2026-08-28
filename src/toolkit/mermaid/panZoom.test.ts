import { describe, expect, it } from "vitest";
import {
  IDENTITY_VIEWPORT,
  MAX_SCALE,
  MIN_SCALE,
  clampScale,
  isIdentity,
  panBy,
  toTransform,
  zoomAt,
  zoomByStep,
} from "./panZoom";

describe("clampScale", () => {
  it("限制在上下限之间", () => {
    expect(clampScale(0.01)).toBe(MIN_SCALE);
    expect(clampScale(100)).toBe(MAX_SCALE);
    expect(clampScale(1.5)).toBe(1.5);
  });

  it("非法数值回退为 1", () => {
    expect(clampScale(Number.NaN)).toBe(1);
    expect(clampScale(Number.POSITIVE_INFINITY)).toBe(MAX_SCALE);
  });
});

describe("zoomAt", () => {
  it("锚点下的内容位置保持不变", () => {
    const pointerX = 120;
    const pointerY = 80;
    const before = { scale: 1, x: 10, y: -5 };
    const after = zoomAt(before, 2, pointerX, pointerY);

    const contentBefore = {
      x: (pointerX - before.x) / before.scale,
      y: (pointerY - before.y) / before.scale,
    };
    const contentAfter = {
      x: (pointerX - after.x) / after.scale,
      y: (pointerY - after.y) / after.scale,
    };

    expect(contentAfter.x).toBeCloseTo(contentBefore.x, 10);
    expect(contentAfter.y).toBeCloseTo(contentBefore.y, 10);
  });

  it("已达上限时原样返回，不产生位移", () => {
    const atMax = { scale: MAX_SCALE, x: 3, y: 4 };
    expect(zoomAt(atMax, 2, 50, 50)).toBe(atMax);
  });

  it("按容器中心缩放", () => {
    const result = zoomByStep(IDENTITY_VIEWPORT, 2, 200, 100);
    expect(result.scale).toBe(2);
    expect(result.x).toBe(-100);
    expect(result.y).toBe(-50);
  });
});

describe("panBy 与 toTransform", () => {
  it("平移只改变位移量", () => {
    expect(panBy({ scale: 2, x: 1, y: 2 }, 10, -3)).toEqual({ scale: 2, x: 11, y: -1 });
  });

  it("输出 CSS transform 字符串", () => {
    expect(toTransform({ scale: 1.5, x: 10, y: -4 })).toBe("translate(10px, -4px) scale(1.5)");
  });

  it("识别初始视口", () => {
    expect(isIdentity(IDENTITY_VIEWPORT)).toBe(true);
    expect(isIdentity({ scale: 1, x: 1, y: 0 })).toBe(false);
  });
});
