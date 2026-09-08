import { describe, expect, it } from "vitest";
import {
  DEFAULT_PNG_LEVEL,
  EXTENSIONS,
  MIME_TYPES,
  OUTPUT_FORMATS,
  PNG_LEVEL_MAX,
  PNG_LEVEL_MIN,
  clampPngLevel,
  clampQuality,
  defaultQuality,
  isLossy,
  optionsForQuality,
  speedForQuality,
} from "./presets";

describe("clampQuality", () => {
  it("rounds and clamps into range", () => {
    expect(clampQuality(74.6)).toBe(75);
    expect(clampQuality(-20)).toBe(1);
    expect(clampQuality(180)).toBe(100);
  });

  it("falls back to max on non-finite input", () => {
    expect(clampQuality(Number.NaN)).toBe(100);
    expect(clampQuality(Number.POSITIVE_INFINITY)).toBe(100);
  });
});

describe("clampPngLevel", () => {
  it("clamps into oxipng's range", () => {
    expect(clampPngLevel(0)).toBe(PNG_LEVEL_MIN);
    expect(clampPngLevel(99)).toBe(PNG_LEVEL_MAX);
    expect(clampPngLevel(3.4)).toBe(3);
  });

  it("falls back to the default on non-finite input", () => {
    expect(clampPngLevel(Number.NaN)).toBe(DEFAULT_PNG_LEVEL);
  });
});

describe("defaultQuality", () => {
  it("gives every lossy format a usable starting point", () => {
    for (const format of ["jpeg", "webp", "avif"] as const) {
      const value = defaultQuality(format);
      expect(value).toBeGreaterThan(1);
      expect(value).toBeLessThan(100);
      expect(isLossy(format)).toBe(true);
    }
  });

  it("reports lossless quality for png", () => {
    expect(defaultQuality("png")).toBe(100);
    expect(isLossy("png")).toBe(false);
  });
});

describe("speedForQuality", () => {
  /**
   * 回归防护：这条曲线刻意是反向的 —— 画质压得越低代表使用者在拿画质换体积，才值得
   * 多花时间把压缩率榨出来。原本用四段强度表达（extreme 的 speed 小於 light），
   * 换成滑桿之后同一个意图要由这个函式维持。
   */
  it("spends more encode time when the quality is pushed down", () => {
    expect(speedForQuality(34)).toBeLessThan(speedForQuality(72));
  });

  it("stays inside libavif's 0-10 range across the whole slider", () => {
    for (let quality = 1; quality <= 100; quality += 1) {
      const speed = speedForQuality(quality);
      expect(speed).toBeGreaterThanOrEqual(0);
      expect(speed).toBeLessThanOrEqual(10);
    }
  });

  it("never gets faster as the quality drops", () => {
    for (let quality = 2; quality <= 100; quality += 1) {
      expect(speedForQuality(quality)).toBeGreaterThanOrEqual(speedForQuality(quality - 1));
    }
  });
});

describe("optionsForQuality", () => {
  it("passes a scalar quality to jpeg and webp", () => {
    expect(optionsForQuality("jpeg", 70)).toEqual({ quality: 70 });
    expect(optionsForQuality("webp", 70)).toEqual({ quality: 70, lossless: 0 });
  });

  /**
   * 无损不是「画质拉到 100」—— 那样仍然会走有损的 YUV 转换。要真的逐像素无损只能开
   * libwebp 自己的 lossless 模式，所以这个旗标必须原封不动地传到 codec。
   */
  it("switches webp into libwebp's lossless mode instead of maxing the quality", () => {
    expect(optionsForQuality("webp", 80, DEFAULT_PNG_LEVEL, true)).toEqual({
      quality: 80,
      lossless: 1,
    });
    expect(optionsForQuality("webp", 100).lossless).toBe(0);
  });

  it("leaves the other formats untouched by the webp lossless flag", () => {
    expect(optionsForQuality("jpeg", 70, DEFAULT_PNG_LEVEL, true)).toEqual({ quality: 70 });
    expect(optionsForQuality("avif", 50, DEFAULT_PNG_LEVEL, true)).toEqual({
      quality: 50,
      speed: speedForQuality(50),
    });
  });

  it("adds an encoder speed for avif", () => {
    const options = optionsForQuality("avif", 50);
    expect(options.quality).toBe(50);
    expect(options.speed).toBe(speedForQuality(50));
  });

  it("maps png to an oxipng effort level and ignores quality", () => {
    expect(optionsForQuality("png", 10, 2)).toEqual({ level: 2 });
    expect(optionsForQuality("png", 90, 6)).toEqual({ level: 6 });
  });

  it("falls back to the default oxipng level when none is given", () => {
    expect(optionsForQuality("png", 80)).toEqual({ level: DEFAULT_PNG_LEVEL });
  });

  it("clamps out-of-range values before they reach the codec", () => {
    expect(optionsForQuality("jpeg", 999)).toEqual({ quality: 100 });
    expect(optionsForQuality("webp", -5)).toEqual({ quality: 1, lossless: 0 });
    expect(optionsForQuality("png", 80, 42)).toEqual({ level: PNG_LEVEL_MAX });
  });
});

describe("format tables", () => {
  it("covers every output format", () => {
    for (const format of OUTPUT_FORMATS) {
      expect(MIME_TYPES[format]).toMatch(/^image\//);
      expect(EXTENSIONS[format].length).toBeGreaterThan(0);
    }
  });
});
