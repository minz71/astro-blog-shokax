import { describe, expect, it } from "vitest";
import { formatBytes, formatSaving, outputFileName, savingRatio, stripExtension } from "./naming";

describe("formatBytes", () => {
  it("formats each magnitude", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(200 * 1024)).toBe("200 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.00 MB");
    expect(formatBytes(20 * 1024 * 1024)).toBe("20.0 MB");
  });

  it("returns a placeholder for invalid sizes", () => {
    expect(formatBytes(-1)).toBe("—");
    expect(formatBytes(Number.NaN)).toBe("—");
  });
});

describe("savingRatio", () => {
  it("reports the fraction saved", () => {
    expect(savingRatio(1000, 400)).toBeCloseTo(0.6);
  });

  it("goes negative when the output grew", () => {
    expect(savingRatio(1000, 1500)).toBeCloseTo(-0.5);
  });

  it("returns 0 for degenerate input", () => {
    expect(savingRatio(0, 100)).toBe(0);
    expect(savingRatio(Number.NaN, 100)).toBe(0);
  });
});

describe("formatSaving", () => {
  it("signs the percentage by direction", () => {
    expect(formatSaving(1000, 400)).toBe("-60%");
    expect(formatSaving(1000, 1200)).toBe("+20%");
    expect(formatSaving(1000, 1000)).toBe("±0%");
  });
});

describe("stripExtension", () => {
  it("removes only the final extension", () => {
    expect(stripExtension("photo.jpg")).toBe("photo");
    expect(stripExtension("my.holiday.photo.jpeg")).toBe("my.holiday.photo");
  });

  it("leaves names without an extension alone", () => {
    expect(stripExtension("photo")).toBe("photo");
    expect(stripExtension(".gitignore")).toBe(".gitignore");
  });
});

describe("outputFileName", () => {
  it("appends the target extension", () => {
    expect(outputFileName("photo.png", "webp")).toBe("photo.min.webp");
    expect(outputFileName("photo.jpeg", "jpeg")).toBe("photo.min.jpg");
    expect(outputFileName("photo.heic", "avif")).toBe("photo.min.avif");
  });

  it("falls back to a generic name for empty input", () => {
    expect(outputFileName("", "png")).toBe("image.min.png");
    expect(outputFileName("   ", "png")).toBe("image.min.png");
  });
});
