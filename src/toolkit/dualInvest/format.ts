/**
 * 双币理财计算机的数字格式化。
 *
 * 抽成常常只有几十 USDT、占本金零点几趴，所以金额固定两位小数、百分比依大小给位数：
 * 0.32% 写成「0%」会把整个工具要讲的事抹掉。
 */

/** USDT 金额，千分位加两位小数。负号只用来标示「对用户有利」那一边。 */
export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const rounded = Math.abs(value) < 0.005 ? 0 : value;
  return rounded.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 带正负号的金额，给价值拆解用：每一项是加还是减要一眼看出来。 */
export function formatSignedUsd(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) < 0.005) return "0.00";
  return `${value > 0 ? "+" : "−"}${formatUsd(Math.abs(value))}`;
}

/** 小数 → 百分比。绝对值小于 1% 时多给一位，免得 0.32% 和 0.28% 看起来一样。 */
export function formatPercent(ratio: number, digits?: number): string {
  if (!Number.isFinite(ratio)) return "—";
  const percent = ratio * 100;
  const places = digits ?? (Math.abs(percent) < 1 ? 3 : Math.abs(percent) < 100 ? 2 : 1);
  const text = percent.toLocaleString("en-US", {
    minimumFractionDigits: places,
    maximumFractionDigits: places,
  });
  return `${text.replace(/^-/, "−")}%`;
}

/** 价格：大于 100 不给小数（BTC、ETH），小于 100 给到四位有效数字（山寨币）。 */
export function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 100) return Math.round(value).toLocaleString("en-US");
  return value.toLocaleString("en-US", { maximumSignificantDigits: 4 });
}

/** 币数量，最多六位小数。 */
export function formatCoins(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

/** 坐标轴用的紧凑价格：100,000 → 100k。 */
export function formatCompactPrice(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1e6)
    return `${(value / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 })}M`;
  if (Math.abs(value) >= 1e4)
    return `${(value / 1e3).toLocaleString("en-US", { maximumFractionDigits: 1 })}k`;
  return formatPrice(value);
}
