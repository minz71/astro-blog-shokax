import { describe, expect, it } from "vitest";
import {
  CROP_HANDLES,
  MAX_DIMENSION,
  clampCropRect,
  clampRectToFrame,
  createDefaultEdit,
  fitAspect,
  handleAt,
  isInsideRect,
  isPristine,
  normalizeRect,
  outputSize,
  resizeCropRect,
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

describe("crop box interaction geometry", () => {
  const frame = { width: 400, height: 300 };
  // 一个离每条边都够远的框，才测得出「命中哪条边」不是靠运气
  const box = { x: 100, y: 80, width: 200, height: 120 };

  describe("normalizeRect", () => {
    it("turns a bottom-right-to-top-left drag into a top-left origin", () => {
      expect(normalizeRect({ x: 300, y: 200, width: -200, height: -120 })).toEqual(box);
    });

    it("leaves an already-normalized rect alone", () => {
      expect(normalizeRect(box)).toEqual(box);
    });
  });

  describe("clampRectToFrame", () => {
    it("keeps an in-bounds rect untouched", () => {
      expect(clampRectToFrame(box, frame)).toEqual(box);
    });

    it("stops a box at the edge instead of squashing it", () => {
      // 这是「搬动」的核心保证：撞到边只改位置，尺寸一格都不能少
      const moved = clampRectToFrame({ ...box, x: -50, y: -30 }, frame);
      expect(moved).toEqual({ x: 0, y: 0, width: 200, height: 120 });
    });

    it("stops at the far edge too", () => {
      const moved = clampRectToFrame({ ...box, x: 999, y: 999 }, frame);
      expect(moved).toEqual({ x: 200, y: 180, width: 200, height: 120 });
    });

    it("shrinks a box that is larger than the frame", () => {
      expect(clampRectToFrame({ x: -10, y: -10, width: 900, height: 900 }, frame)).toEqual({
        x: 0,
        y: 0,
        width: 400,
        height: 300,
      });
    });

    it("scales both sides together when the ratio is locked", () => {
      // 两边各自夹会把比例夹坏：选了 1:1 往角落拉就拉出一个不方的「正方形」
      const rect = clampRectToFrame({ x: 0, y: 0, width: 600, height: 600 }, frame, true);
      expect(rect).toEqual({ x: 0, y: 0, width: 300, height: 300 });
    });

    it("leaves an in-bounds locked-ratio box alone", () => {
      const rect = { x: 10, y: 10, width: 120, height: 120 };
      expect(clampRectToFrame(rect, frame, true)).toEqual(rect);
    });

    it("does not round, so dragging stays smooth", () => {
      const rect = clampRectToFrame({ x: 10.25, y: 20.5, width: 30.75, height: 40.5 }, frame);
      expect(rect).toEqual({ x: 10.25, y: 20.5, width: 30.75, height: 40.5 });
    });
  });

  describe("handleAt", () => {
    const slop = 10;

    it("finds every corner", () => {
      expect(handleAt({ x: 100, y: 80 }, box, slop, slop)).toBe("nw");
      expect(handleAt({ x: 300, y: 80 }, box, slop, slop)).toBe("ne");
      expect(handleAt({ x: 100, y: 200 }, box, slop, slop)).toBe("sw");
      expect(handleAt({ x: 300, y: 200 }, box, slop, slop)).toBe("se");
    });

    it("finds every edge", () => {
      expect(handleAt({ x: 200, y: 80 }, box, slop, slop)).toBe("n");
      expect(handleAt({ x: 200, y: 200 }, box, slop, slop)).toBe("s");
      expect(handleAt({ x: 100, y: 140 }, box, slop, slop)).toBe("w");
      expect(handleAt({ x: 300, y: 140 }, box, slop, slop)).toBe("e");
    });

    it("hits from just outside the border, not only from inside", () => {
      // 只认内侧的话就得刚好压在那条线上，那正是「拉不动」的手感
      expect(handleAt({ x: 94, y: 74 }, box, slop, slop)).toBe("nw");
      expect(handleAt({ x: 306, y: 206 }, box, slop, slop)).toBe("se");
    });

    it("returns null well inside the box and well outside it", () => {
      expect(handleAt({ x: 200, y: 140 }, box, slop, slop)).toBeNull();
      expect(handleAt({ x: 20, y: 20 }, box, slop, slop)).toBeNull();
    });

    it("only returns names that actually exist", () => {
      for (let x = 80; x <= 320; x += 4) {
        for (let y = 60; y <= 220; y += 4) {
          const handle = handleAt({ x, y }, box, slop, slop);
          if (handle !== null) expect(CROP_HANDLES).toContain(handle);
        }
      }
    });
  });

  describe("isInsideRect", () => {
    it("accepts the interior and the border, rejects the outside", () => {
      expect(isInsideRect({ x: 200, y: 140 }, box)).toBe(true);
      expect(isInsideRect({ x: 100, y: 80 }, box)).toBe(true);
      expect(isInsideRect({ x: 99, y: 140 }, box)).toBe(false);
      expect(isInsideRect({ x: 200, y: 201 }, box)).toBe(false);
    });
  });

  describe("fitAspect", () => {
    it("is a no-op without a ratio", () => {
      expect(fitAspect(box, null)).toEqual(box);
    });

    it("keeps the anchor and derives the shorter side", () => {
      expect(fitAspect({ x: 0, y: 0, width: 200, height: 50 }, 1)).toEqual({
        x: 0,
        y: 0,
        width: 200,
        height: 200,
      });
    });

    it("preserves the drag direction", () => {
      const rect = fitAspect({ x: 300, y: 300, width: -200, height: -50 }, 1);
      expect(rect).toEqual({ x: 300, y: 300, width: -200, height: -200 });
    });
  });

  describe("resizeCropRect", () => {
    it("moves only the grabbed corner and keeps the opposite one pinned", () => {
      const rect = resizeCropRect("se", box, { x: 260, y: 170 }, null);
      expect(normalizeRect(rect)).toEqual({ x: 100, y: 80, width: 160, height: 90 });
    });

    it("moves only the grabbed edge", () => {
      expect(normalizeRect(resizeCropRect("w", box, { x: 140, y: 999 }, null))).toEqual({
        x: 140,
        y: 80,
        width: 160,
        height: 120,
      });
      expect(normalizeRect(resizeCropRect("n", box, { x: 999, y: 120 }, null))).toEqual({
        x: 100,
        y: 120,
        width: 200,
        height: 80,
      });
    });

    it("anchors a locked-ratio corner drag at the opposite corner", () => {
      // 锚在起拖点的话，比例补出来的那一边会把整个框推到指标外面去
      const rect = normalizeRect(resizeCropRect("nw", box, { x: 200, y: 150 }, 1));
      expect(rect.x + rect.width).toBeCloseTo(300);
      expect(rect.y + rect.height).toBeCloseTo(200);
      expect(rect.width).toBeCloseTo(rect.height);
    });

    it("grows a locked-ratio edge drag around the box centre", () => {
      // 边把手若也锚在 x/y，框会在指标底下往一侧滑走
      const before = box.y + box.height / 2;
      const rect = normalizeRect(resizeCropRect("e", box, { x: 200, y: 140 }, 1));
      expect(rect.width).toBeCloseTo(100);
      expect(rect.height).toBeCloseTo(100);
      expect(rect.y + rect.height / 2).toBeCloseTo(before);
    });

    it("keeps the perpendicular centre when dragging a vertical edge under a ratio", () => {
      const before = box.x + box.width / 2;
      const rect = normalizeRect(resizeCropRect("s", box, { x: 140, y: 160 }, 2));
      expect(rect.height).toBeCloseTo(80);
      expect(rect.width).toBeCloseTo(160);
      expect(rect.x + rect.width / 2).toBeCloseTo(before);
    });

    it("survives dragging a handle past the opposite side", () => {
      // 拉过头时框会翻面，normalizeRect 之后仍然要是个合法矩形
      const rect = normalizeRect(resizeCropRect("e", box, { x: 20, y: 140 }, null));
      expect(rect.width).toBeGreaterThan(0);
      expect(rect.x).toBeCloseTo(20);
    });
  });
});
