/**
 * 小型 SVG 折线图用的纯函式：刻度与取样点。
 *
 * 独立出来是为了能单元测试——刻度算错不会报错，只会让坐标轴印出 99,999.99999 这种字。
 */

/**
 * 「好看」的刻度：间距取 1、2、2.5、5 × 10ⁿ，落在 [min, max] 之内。
 *
 * 浮点累加会让 0.1 × 3 变成 0.30000000000000004，所以每个刻度用「第几格 × 间距」
 * 直接算，再四舍五入到间距的精度，而不是一路往上加。
 */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (max < min) [min, max] = [max, min];
  if (max === min) return [min];

  const rough = (max - min) / Math.max(1, count);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step =
    [1, 2, 2.5, 5, 10]
      .map((factor) => factor * magnitude)
      .find((candidate) => candidate >= rough) ?? 10 * magnitude;

  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  const first = Math.ceil(min / step - 1e-9);
  const last = Math.floor(max / step + 1e-9);
  const ticks: number[] = [];
  for (let index = first; index <= last; index++) {
    ticks.push(Number((index * step).toFixed(decimals)));
  }
  return ticks;
}

/**
 * 等距取样，并把断点（目标价、敲出价）两侧都塞进去。
 *
 * 折价买币在敲出价有一个跳跃，若只等距取样，跳跃会被画成一条斜线，看起来像是
 * 「价格越接近敲出价拿得越多」——那是错的。断点左侧补一个极近的点、右侧补断点本身，
 * 折线就会画成近乎垂直的一段。
 */
export function sampleWithBreakpoints(
  from: number,
  to: number,
  steps: number,
  breakpoints: readonly number[],
): number[] {
  const values = new Set<number>();
  for (let index = 0; index <= steps; index++) values.add(from + ((to - from) * index) / steps);
  const epsilon = (to - from) * 1e-6;
  for (const point of breakpoints) {
    if (point > from && point < to) {
      values.add(point - epsilon);
      values.add(point);
    }
  }
  return [...values].toSorted((a, b) => a - b);
}

/** 找出最接近 target 的索引（values 已排序）。给滑鼠十字线对齐资料点用。 */
export function nearestIndex(values: readonly number[], target: number): number {
  if (values.length === 0) return -1;
  let low = 0;
  let high = values.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (values[mid] < target) low = mid;
    else high = mid;
  }
  return Math.abs(values[low] - target) <= Math.abs(values[high] - target) ? low : high;
}
