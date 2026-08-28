import type { ImageMetadata } from "astro";

/**
 * 近正方／直立的封面被塞进宽扁的框里做 object-fit: cover 时（header 约 2.5:1、
 * 文章卡片 16:9），上下会被裁掉一大半，而默认的居中裁切正好切掉人物头部。
 * 这里按图片自身长宽比把裁切锚点上移：越接近正方，锚得越高。
 *
 * - 比例 >= WIDE_RATIO：本来就够宽，垂直裁切有限，维持居中
 * - 比例 <= SQUARE_RATIO：锚到 TOP_ANCHOR_PERCENT，保住画面上部（主体／人脸通常在这）
 * - 两者之间线性插值，避免出现「某张图突然跳位」的突变
 *
 * 远端 URL 在构建期拿不到尺寸，只能维持居中。
 */
const SQUARE_RATIO = 1.05;
const WIDE_RATIO = 1.8;
const TOP_ANCHOR_PERCENT = 25;
const CENTER_ANCHOR_PERCENT = 50;
const SNAP_PERCENT = 2;

export const DEFAULT_COVER_POSITION = "center";

export function getCoverObjectPosition(
  src?: ImageMetadata | string | null,
): string {
  if (!src || typeof src === "string") return DEFAULT_COVER_POSITION;
  const { width, height } = src;
  if (!width || !height) return DEFAULT_COVER_POSITION;

  const ratio = width / height;
  if (ratio >= WIDE_RATIO) return DEFAULT_COVER_POSITION;

  const t = Math.min(
    Math.max((WIDE_RATIO - ratio) / (WIDE_RATIO - SQUARE_RATIO), 0),
    1,
  );
  const y =
    CENTER_ANCHOR_PERCENT - (CENTER_ANCHOR_PERCENT - TOP_ANCHOR_PERCENT) * t;
  // 差不到 SNAP_PERCENT 的位移人眼看不出来，直接回退到 center，别输出 "center 49%" 这种噪音
  if (y >= CENTER_ANCHOR_PERCENT - SNAP_PERCENT) return DEFAULT_COVER_POSITION;
  return `center ${Math.round(y)}%`;
}
