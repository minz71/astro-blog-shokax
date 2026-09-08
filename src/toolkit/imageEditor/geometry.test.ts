import { describe, expect, it } from "vitest";
import {
  MAX_DIMENSION,
  clampCropRect,
  createDefaultEdit,
  isPristine,
  outputSize,
  resolveTargetSize,
  rotatedSize,
} from "./geometry";

const natural = { width: 800, height: 600 };

describe("clampCropRect", () => {
  it("keeps an in-bounds rect untouched", () => {
    expect(clampCropRect({ x: 10, y: 20, width: 100, height: 50 }, natural)).toEqual({
      x: 10,
      y: 20,
      width: 100,
      height: 50,
    });
  });

  it("normalises a rect dragged bottom-right to top-left", () => {
    expect(clampCropRect({ x: 300, y: 200, width: -100, height: -50 }, natural)).toEqual({
      x: 200,
      y: 150,
      width: 100,
      height: 50,
    });
  });

  it("clips a rect that overflows the image", () => {
    expect(clampCropRect({ x: 700, y: 500, width: 400, height: 400 }, natural)).toEqual({
      x: 700,
      y: 500,
      width: 100,
      height: 100,
    });
  });

  it("never returns a zero-sized rect", () => {
    const rect = clampCropRect({ x: 0, y: 0, width: 0, height: 0 }, natural);
    expect(rect.width).toBe(1);
    expect(rect.height).toBe(1);
  });

  it("rounds fractional drag coordinates", () => {
    expect(clampCropRect({ x: 10.4, y: 20.6, width: 99.5, height: 50.2 }, natural)).toEqual({
      x: 10,
      y: 21,
      width: 100,
      height: 50,
    });
  });

  it("survives non-finite input", () => {
    const rect = clampCropRect(
      { x: Number.NaN, y: Number.NaN, width: Number.NaN, height: Number.NaN },
      natural,
    );
    expect(rect.x).toBe(0);
    expect(rect.y).toBe(0);
    expect(rect.width).toBe(800);
    expect(rect.height).toBe(600);
  });
});

describe("rotatedSize", () => {
  it("swaps the axes for quarter turns only", () => {
    expect(rotatedSize(800, 600, 0)).toEqual({ width: 800, height: 600 });
    expect(rotatedSize(800, 600, 90)).toEqual({ width: 600, height: 800 });
    expect(rotatedSize(800, 600, 180)).toEqual({ width: 800, height: 600 });
    expect(rotatedSize(800, 600, 270)).toEqual({ width: 600, height: 800 });
  });
});

describe("resolveTargetSize", () => {
  it("returns the source size when not resizing", () => {
    expect(resolveTargetSize(800, 600, { mode: "original" })).toEqual({
      width: 800,
      height: 600,
    });
  });

  it("scales by percent and keeps the aspect ratio", () => {
    expect(resolveTargetSize(800, 600, { mode: "percent", percent: 50 })).toEqual({
      width: 400,
      height: 300,
    });
  });

  it("clamps percent into a sane range", () => {
    expect(resolveTargetSize(800, 600, { mode: "percent", percent: 0 }).width).toBe(8);
    expect(resolveTargetSize(800, 600, { mode: "percent", percent: 9999 }).width).toBe(3200);
  });

  it("derives height from an explicit width", () => {
    expect(resolveTargetSize(800, 600, { mode: "width", width: 400 })).toEqual({
      width: 400,
      height: 300,
    });
  });

  it("allows an explicit width to upscale", () => {
    expect(resolveTargetSize(800, 600, { mode: "width", width: 1600 })).toEqual({
      width: 1600,
      height: 1200,
    });
  });

  it("only shrinks when constraining the longest edge", () => {
    expect(resolveTargetSize(800, 600, { mode: "longestEdge", edge: 400 })).toEqual({
      width: 400,
      height: 300,
    });
    // 已经比上限小的图不该被放大
    expect(resolveTargetSize(800, 600, { mode: "longestEdge", edge: 1920 })).toEqual({
      width: 800,
      height: 600,
    });
  });

  it("uses the taller side for portrait images", () => {
    expect(resolveTargetSize(600, 800, { mode: "longestEdge", edge: 400 })).toEqual({
      width: 300,
      height: 400,
    });
  });

  it("never rounds a dimension down to zero", () => {
    const size = resolveTargetSize(10, 4, { mode: "percent", percent: 1 });
    expect(size.width).toBeGreaterThanOrEqual(1);
    expect(size.height).toBeGreaterThanOrEqual(1);
  });
});

describe("outputSize", () => {
  it("rotates, then crops in the rotated frame, then resizes", () => {
    const edit = createDefaultEdit();
    edit.rotate = 90;
    edit.crop = { x: 0, y: 0, width: 400, height: 200 };
    edit.resize = { mode: "percent", percent: 50 };
    // 800x600 转 90 度成 600x800 → 在这个座标系裁成 400x200 → 缩一半成 200x100
    expect(outputSize(natural, edit)).toEqual({ width: 200, height: 100 });
  });

  it("clamps the crop against the rotated frame, not the original", () => {
    const edit = createDefaultEdit();
    edit.rotate = 90;
    // 转 90 度后画面是 600x800，所以高度 800 是合法的、宽度 800 会被夹到 600
    edit.crop = { x: 0, y: 0, width: 800, height: 800 };
    expect(outputSize(natural, edit)).toEqual({ width: 600, height: 800 });
  });

  it("returns the natural size for an untouched image", () => {
    expect(outputSize(natural, createDefaultEdit())).toEqual(natural);
  });

  it("caps each dimension at the canvas limit", () => {
    const edit = createDefaultEdit();
    edit.resize = { mode: "width", width: 999_999 };
    const size = outputSize(natural, edit);
    expect(size.width).toBeLessThanOrEqual(MAX_DIMENSION);
    expect(size.height).toBeLessThanOrEqual(MAX_DIMENSION);
  });
});

describe("MAX_DIMENSION", () => {
  /**
   * 回归防护：这个上限曾经是 16384，刚好比 libwebp 的 16383 多一个像素，於是任何一边
   * 刚好顶到上限的图（长接图的拼贴最容易）编 WebP 就会拿到「Encoding error.」。
   * 实测 64x16384 失败、64x16383 正常，所以这个数字不能再被调回去。
   */
  it("never exceeds libwebp's 16383 hard limit", () => {
    expect(MAX_DIMENSION).toBeLessThanOrEqual(16_383);
  });
});

describe("isPristine", () => {
  it("is true for a freshly created edit", () => {
    expect(isPristine(createDefaultEdit())).toBe(true);
  });

  it("is false once anything is changed", () => {
    const rotated = createDefaultEdit();
    rotated.rotate = 90;
    expect(isPristine(rotated)).toBe(false);

    const cropped = createDefaultEdit();
    cropped.crop = { x: 0, y: 0, width: 10, height: 10 };
    expect(isPristine(cropped)).toBe(false);

    const flipped = createDefaultEdit();
    flipped.flipH = true;
    expect(isPristine(flipped)).toBe(false);

    const resized = createDefaultEdit();
    resized.resize = { mode: "percent", percent: 50 };
    expect(isPristine(resized)).toBe(false);
  });
});
