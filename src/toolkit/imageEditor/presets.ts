import type { CodecOptionsMap, OutputFormat } from "./types";

export const OUTPUT_FORMATS: readonly OutputFormat[] = ["jpeg", "webp", "avif", "png"] as const;

/**
 * 各有损格式的预设画质（1-100，越大越好看）。
 *
 * 不同 codec 在同一个数字上的观感并不一致：WebP 要到 80 左右才接近 mozjpeg 75 的观感，
 * AVIF 又可以用更低的数字换到同样画质，所以这里按格式各自给一个起点，而不是共用一个
 * 数字硬套。使用者没动过滑桿时就用这个值，换格式时也会跟着换成该格式的起点。
 */
export const DEFAULT_QUALITY: Record<Exclude<OutputFormat, "png">, number> = {
  jpeg: 75,
  webp: 80,
  avif: 58,
};

/**
 * oxipng 的最佳化强度范围。
 *
 * PNG 走无损，没有「画质」可以调，能调的只有花多少时间重整档案结构：越高档案越小，
 * 但耗时呈指数成长。刻意跟有损格式的画质分成两条轴，共用一个数字只会让两边都要换算。
 */
export const PNG_LEVEL_MIN = 1;
export const PNG_LEVEL_MAX = 6;
export const DEFAULT_PNG_LEVEL = 3;

/**
 * 这个格式有没有 1-100 的那条轴。
 *
 * 只有 PNG 没有（oxipng 走自己的 1-6 强度）。注意 WebP 也可以切成无损，那时候这条轴
 * 还在，只是意义从「画质」变成「压缩要花多少力气」—— 见 `optionsForQuality`。
 */
export function isLossy(format: OutputFormat): boolean {
  return format !== "png";
}

/** 该格式在使用者还没自订过时的滑桿起点。PNG 无损，回传 100。 */
export function defaultQuality(format: OutputFormat): number {
  return format === "png" ? 100 : DEFAULT_QUALITY[format];
}

/** 把任意输入夹到 [min, max] 并取整，避免 UI 传进 NaN 或小数把 codec 弄坏。 */
export function clampQuality(value: number, min = 1, max = 100): number {
  if (!Number.isFinite(value)) return max;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** 同上，但夹的是 oxipng 的强度范围。 */
export function clampPngLevel(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_PNG_LEVEL;
  return Math.min(PNG_LEVEL_MAX, Math.max(PNG_LEVEL_MIN, Math.round(value)));
}

/**
 * AVIF 的编码速度（0-10，越大越快、压缩率越差）。
 *
 * 我们只载入单执行绪的 avif_enc.wasm（多执行绪版本需要 SharedArrayBuffer，等于要全站开
 * COOP/COEP，代价远大于收益），所以刻意偏向较快的一端；只有在使用者已经把画质压得很低、
 * 明显是在拿画质换体积时，才多花时间把压缩率也榨出来。
 */
export function speedForQuality(quality: number): number {
  const q = clampQuality(quality);
  if (q <= 40) return 6;
  if (q <= 50) return 7;
  return 8;
}

/**
 * 组出该格式实际要送进 codec 的参数。
 *
 * `quality` 是 1-100 那条轴，`pngLevel` 是 PNG 专用的 oxipng 强度，`webpLossless`
 * 只对 WebP 有意义；呼叫端全部都传，由这里按格式挑该用哪一个。
 *
 * WebP 的无损是 libwebp 自己的模式（`lossless: 1`），不是把画质拉到 100 —— 后者仍然
 * 会走有损的 YUV 转换。开了无损之后 `quality` 变成压缩投入的力气：数字越大档案越小、
 * 编码越慢，但输出一律逐像素等於输入。
 */
export function optionsForQuality<F extends OutputFormat>(
  format: F,
  quality: number,
  pngLevel: number = DEFAULT_PNG_LEVEL,
  webpLossless = false,
): CodecOptionsMap[F] {
  const q = clampQuality(quality);
  // 一次把四个格式的参数都算出来再索引，型别就由 CodecOptionsMap 自然推导出来，
  // 不需要在每个 case 各写一次 type assertion。
  const table: CodecOptionsMap = {
    jpeg: { quality: q },
    webp: { quality: q, lossless: webpLossless ? 1 : 0 },
    avif: { quality: q, speed: speedForQuality(q) },
    png: { level: clampPngLevel(pngLevel) },
  };
  if (!Object.hasOwn(table, format)) {
    throw new Error(`未支援的输出格式: ${format}`);
  }
  return table[format];
}

export const MIME_TYPES: Record<OutputFormat, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
};

export const EXTENSIONS: Record<OutputFormat, string> = {
  jpeg: "jpg",
  png: "png",
  webp: "webp",
  avif: "avif",
};
