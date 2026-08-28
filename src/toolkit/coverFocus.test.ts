import { describe, expect, it } from "vitest";
import type { ImageMetadata } from "astro";

import { getCoverObjectPosition } from "./coverFocus";

const asset = (width: number, height: number) =>
  ({ src: "/x.avif", width, height, format: "avif" }) as ImageMetadata;

describe("getCoverObjectPosition", () => {
  it("keeps wide images centered", () => {
    expect(getCoverObjectPosition(asset(2137, 996))).toBe("center"); // 2.15
    expect(getCoverObjectPosition(asset(4016, 2153))).toBe("center"); // 1.87
    expect(getCoverObjectPosition(asset(1920, 1080))).toBe("center"); // 1.78 → 位移不足 2%，snap 回 center
  });

  it("anchors near-square images to the upper part", () => {
    expect(getCoverObjectPosition(asset(2750, 2620))).toBe("center 25%"); // 1.05
    expect(getCoverObjectPosition(asset(1200, 1600))).toBe("center 25%"); // 直立图也钉在上限
  });

  it("interpolates in between", () => {
    expect(getCoverObjectPosition(asset(1200, 720))).toBe("center 46%"); // 1.67
    expect(getCoverObjectPosition(asset(1697, 1200))).toBe("center 37%"); // 1.41
  });

  it("falls back to center for remote URLs and missing metadata", () => {
    expect(getCoverObjectPosition("https://example.com/a.jpg")).toBe("center");
    expect(getCoverObjectPosition(undefined)).toBe("center");
    expect(getCoverObjectPosition(asset(0, 0))).toBe("center");
  });
});
