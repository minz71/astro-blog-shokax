import { describe, expect, it } from "vitest";
import {
  WATERMARK_ANCHORS,
  computeTiledOrigins,
  createDefaultWatermark,
  resolveAnchorAlignment,
  resolveAnchorPoint,
  resolveImageOrigin,
} from "./watermarkLayout";

const frame = { width: 800, height: 600 };

describe("resolveAnchorAlignment", () => {
  it("maps every anchor to a valid canvas text alignment", () => {
    for (const anchor of WATERMARK_ANCHORS) {
      const { textAlign, textBaseline } = resolveAnchorAlignment(anchor);
      expect(["left", "center", "right"]).toContain(textAlign);
      expect(["top", "middle", "bottom"]).toContain(textBaseline);
    }
  });

  it("splits a compound anchor into its vertical/horizontal parts", () => {
    expect(resolveAnchorAlignment("bottom-right")).toEqual({
      textAlign: "right",
      textBaseline: "bottom",
    });
    expect(resolveAnchorAlignment("top-left")).toEqual({ textAlign: "left", textBaseline: "top" });
    expect(resolveAnchorAlignment("middle-center")).toEqual({
      textAlign: "center",
      textBaseline: "middle",
    });
  });
});

describe("resolveAnchorPoint", () => {
  it("keeps a margin from the near edges", () => {
    expect(resolveAnchorPoint("top-left", frame.width, frame.height, 10, 20)).toEqual({
      x: 10,
      y: 20,
    });
    expect(resolveAnchorPoint("bottom-right", frame.width, frame.height, 10, 20)).toEqual({
      x: frame.width - 10,
      y: frame.height - 20,
    });
  });

  it("centers on the middle/center axis regardless of margin", () => {
    expect(resolveAnchorPoint("middle-center", frame.width, frame.height, 10, 20)).toEqual({
      x: frame.width / 2,
      y: frame.height / 2,
    });
  });
});

describe("resolveImageOrigin", () => {
  it("keeps the point as the top-left corner for a top-left anchor", () => {
    const point = { x: 10, y: 20 };
    expect(resolveImageOrigin("top-left", point, 100, 50)).toEqual(point);
  });

  it("pulls the point back by the full size for a bottom-right anchor", () => {
    const point = { x: 700, y: 500 };
    expect(resolveImageOrigin("bottom-right", point, 100, 50)).toEqual({ x: 600, y: 450 });
  });

  it("centers the rect on the point for a middle-center anchor", () => {
    const point = { x: 400, y: 300 };
    expect(resolveImageOrigin("middle-center", point, 100, 50)).toEqual({ x: 350, y: 275 });
  });
});

describe("computeTiledOrigins", () => {
  it("covers at least the frame's diagonal square around the center", () => {
    const cellWidth = 120;
    const cellHeight = 60;
    const origins = computeTiledOrigins(frame.width, frame.height, cellWidth, cellHeight);
    const diagonal = Math.hypot(frame.width, frame.height);

    expect(origins.length).toBeGreaterThan(0);

    const xs = origins.map((o) => o.x);
    const ys = origins.map((o) => o.y);
    // 允许半格误差：中心点本身离最外缘还有半个 cell
    expect(Math.min(...xs)).toBeLessThanOrEqual(-diagonal / 2 + cellWidth);
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(diagonal / 2 - cellWidth);
    expect(Math.min(...ys)).toBeLessThanOrEqual(-diagonal / 2 + cellHeight);
    expect(Math.max(...ys)).toBeGreaterThanOrEqual(diagonal / 2 - cellHeight);
  });

  it("falls back to a 1px cell instead of dividing by zero", () => {
    expect(() => computeTiledOrigins(frame.width, frame.height, 0, 0)).not.toThrow();
  });
});

describe("createDefaultWatermark", () => {
  it("defaults to no watermark", () => {
    expect(createDefaultWatermark().mode).toBe("none");
  });

  it("gives every sub-spec a usable default", () => {
    const watermark = createDefaultWatermark();
    expect(watermark.text.text).toBe("");
    expect(watermark.image.bitmap).toBeNull();
    expect(watermark.tiledText.text).toBe("");
  });
});
