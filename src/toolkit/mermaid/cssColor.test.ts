import { describe, expect, it } from "bun:test";
import { cssColorToHex, oklchToHex } from "./cssColor";

describe("oklchToHex", () => {
  it("转换黑白两端", () => {
    expect(oklchToHex(0, 0, 0)).toBe("#000000");
    expect(oklchToHex(1, 0, 0)).toBe("#ffffff");
  });

  it("转换纯红（sRGB 红的 oklch 坐标）", () => {
    expect(oklchToHex(0.6279, 0.2576, 29.23)).toBe("#ff0000");
  });

  it("超出 sRGB 色域时钳制到边界而不是回绕", () => {
    const hex = oklchToHex(0.8, 0.37, 150);
    expect(hex).toMatch(/^#[\da-f]{6}$/);
  });

  it("alpha 小于 1 时输出 8 位 hex", () => {
    expect(oklchToHex(0, 0, 0, 0.5)).toBe("#00000080");
  });
});

describe("cssColorToHex", () => {
  it("解析 palette.css 中的 oklch 记法", () => {
    expect(cssColorToHex("oklch(1 0 0)")).toBe("#ffffff");
    expect(cssColorToHex("  oklch(0 0 0)  ")).toBe("#000000");
  });

  it("解析带 alpha 的 oklch", () => {
    expect(cssColorToHex("oklch(0 0 0 / 0.5)")).toBe("#00000080");
  });

  it("解析百分号亮度", () => {
    expect(cssColorToHex("oklch(100% 0 0)")).toBe("#ffffff");
  });

  it("规范化 hex 缩写", () => {
    expect(cssColorToHex("#FFF")).toBe("#ffffff");
    expect(cssColorToHex("#1A2B3C")).toBe("#1a2b3c");
  });

  it("解析 rgb 的新旧两种记法", () => {
    expect(cssColorToHex("rgb(255, 0, 0)")).toBe("#ff0000");
    expect(cssColorToHex("rgb(0 128 255)")).toBe("#0080ff");
    expect(cssColorToHex("rgba(0, 0, 0, 0.5)")).toBe("#00000080");
  });

  it("无法解析时返回 null", () => {
    expect(cssColorToHex("color-mix(in srgb, red 50%, blue)")).toBeNull();
    expect(cssColorToHex("")).toBeNull();
    expect(cssColorToHex("鬼画符")).toBeNull();
  });
});
