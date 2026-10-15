/**
 * 目录曲线轨道的几何计算。
 *
 * 轨道是一条贯穿所有目录项的竖线，x 跟着标题层级缩排走；
 * 相邻两项层级不同时，在两项交界处用三次贝塞尔 S 曲线过渡。
 */

export interface TocRailRow {
  /** 轨道在该项的 x 坐标（相对目录列表左缘） */
  x: number;
  /** 该项顶部 y 坐标（相对目录列表顶部） */
  top: number;
  /** 该项高度 */
  height: number;
}

/** S 曲线在交界上下各占的高度 */
export const TOC_RAIL_CURVE = 7;

const round = (value: number): number => Math.round(value * 100) / 100;
const center = (row: TocRailRow): number => row.top + row.height / 2;

/**
 * 生成从第一项中线到第 `endIndex` 项中线的轨道路径。
 * `endIndex` 省略时画到最后一项；没有任何项时返回空字符串。
 */
export function buildTocRailPath(
  rows: readonly TocRailRow[],
  endIndex = rows.length - 1,
  curve = TOC_RAIL_CURVE,
): string {
  if (rows.length === 0) return "";

  const end = Math.max(0, Math.min(endIndex, rows.length - 1));
  const parts = [`M${round(rows[0].x)},${round(center(rows[0]))}`];

  for (let i = 0; i < end; i++) {
    const current = rows[i];
    const next = rows[i + 1];

    if (current.x !== next.x) {
      // 交界取上一项底边与下一项顶边的中点，曲线高度不超过半个项高，避免与相邻转折重叠
      const boundary = (current.top + current.height + next.top) / 2;
      const c = Math.min(curve, current.height / 2, next.height / 2);
      parts.push(
        `L${round(current.x)},${round(boundary - c)}`,
        `C${round(current.x)},${round(boundary)} ${round(next.x)},${round(boundary)} ${round(next.x)},${round(boundary + c)}`,
      );
    }

    parts.push(`L${round(next.x)},${round(center(next))}`);
  }

  return parts.join(" ");
}

/** 第 `index` 项中线的 y 坐标，越界时夹到首尾项 */
export function tocRailCenterY(rows: readonly TocRailRow[], index: number): number {
  if (rows.length === 0) return 0;
  return center(rows[Math.max(0, Math.min(index, rows.length - 1))]);
}
