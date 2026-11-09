/**
 * 圆角五角星的 SVG 路径。
 *
 * 造型想要的是「胖、角是圆的」那种星星（像 Font Awesome 的 star），但那条路径是
 * CC BY 4.0，放进文章得附出处；所以自己算：先排出五个外角、五个内角，每个角沿两条边
 * 各退一段，再用二次贝兹曲线以角点为控制点接起来。外角退得多（圆润），内角退得少
 * （保留星形的凹口）。
 */

export interface SoftStarOptions {
  /** 中心 x。 */
  cx: number;
  /** 中心 y。 */
  cy: number;
  /** 外角半径。 */
  outer: number;
  /** 内角半径。胖星星大约是外角的一半。 */
  inner: number;
  /** 外角沿边退回的比例（0 = 尖角，0.5 = 退到边的中点）。 */
  roundOuter?: number;
  /** 内角沿边退回的比例。 */
  roundInner?: number;
}

type Point = readonly [number, number];

const lerp = (from: Point, to: Point, t: number): Point => [
  from[0] + (to[0] - from[0]) * t,
  from[1] + (to[1] - from[1]) * t,
];

/** 两位小数够画清楚，又不会让路径字串长得离谱。 */
const fmt = (point: Point) => `${point[0].toFixed(2)} ${point[1].toFixed(2)}`;

export function softStarPath({
  cx,
  cy,
  outer,
  inner,
  roundOuter = 0.3,
  roundInner = 0.14,
}: SoftStarOptions): string {
  // 从正上方开始顺时针，外、内角交替
  const corners: Point[] = Array.from({ length: 10 }, (_, k) => {
    const radius = k % 2 === 0 ? outer : inner;
    const angle = (k * Math.PI) / 5 - Math.PI / 2;
    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
  });

  const segments = corners.map((corner, k) => {
    const t = k % 2 === 0 ? roundOuter : roundInner;
    const enter = lerp(corner, corners[(k + 9) % 10], t);
    const leave = lerp(corner, corners[(k + 1) % 10], t);
    return `${k === 0 ? "M" : "L"}${fmt(enter)}Q${fmt(corner)} ${fmt(leave)}`;
  });

  return `${segments.join("")}Z`;
}
