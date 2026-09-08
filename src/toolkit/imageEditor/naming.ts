import { EXTENSIONS } from "./presets";
import type { OutputFormat } from "./types";

/** 把 bytes 格式化成人看得懂的字串，固定用 1024 进位。 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb < 10 ? 2 : 1)} MB`;
}

/**
 * 压缩后省下的比例（0-1）。变大时回传负值，UI 才能诚实显示「反而变大」——
 * 小图转 AVIF、或把 JPEG 转成无损 PNG 时这是真的会发生的。
 */
export function savingRatio(before: number, after: number): number {
  if (!Number.isFinite(before) || before <= 0) return 0;
  if (!Number.isFinite(after) || after < 0) return 0;
  return (before - after) / before;
}

/** 把比例格式化成带正负号的百分比字串。 */
export function formatSaving(before: number, after: number): string {
  const ratio = savingRatio(before, after);
  const percent = Math.round(Math.abs(ratio) * 100);
  if (percent === 0) return "±0%";
  return ratio > 0 ? `-${percent}%` : `+${percent}%`;
}

/** 去掉档名最后一段副档名；没有副档名或以点开头的隐藏档则原样保留。 */
export function stripExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0) return fileName;
  return fileName.slice(0, dot);
}

/**
 * 产生输出档名。刻意加上格式后缀，避免转档后与原档同名、下载资料夹里互相覆盖
 * （PNG → WebP 会换副档名不会撞，但 JPEG → JPEG 的重新压缩会）。
 */
export function outputFileName(originalName: string, format: OutputFormat): string {
  const base = stripExtension(originalName).trim() || "image";
  return `${base}.min.${EXTENSIONS[format]}`;
}
