/**
 * 转蛋计算机的数字格式化。
 *
 * 抽奖的机率会横跨十几个数量级：「至少中一次」常常是 99.99%，「连中五次」可能是
 * 1e-12。固定小数位数在任何一端都会失真——一端全变成 100.00%，另一端全变成 0.00%，
 * 而这两个正是使用者最想看清楚的数字。所以这里按数量级切换呈现方式。
 */

/** 小于这个值就改用科学记号，再多的 0 只会让人数不清。 */
const SCIENTIFIC_THRESHOLD = 1e-4;

const SUPERSCRIPTS: Record<string, string> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
  "-": "⁻",
};

function toSuperscript(value: number): string {
  return String(value)
    .split("")
    .map((char) => SUPERSCRIPTS[char] ?? char)
    .join("");
}

/**
 * 把 0–1 的机率格式化成百分比字串。
 *
 * 极小值走科学记号；接近 1 的值保留够多小数位，才不会把 0.99997 和 1 显示成同一个
 * 东西——「99.997%」与「100%」在抽奖的语境里差很多。真正的 0 与 1 直接写死。
 */
export function formatProbability(probability: number): string {
  if (!Number.isFinite(probability)) return "—";
  if (probability <= 0) return "0%";
  if (probability >= 1) return "100%";

  const percent = probability * 100;
  if (percent < SCIENTIFIC_THRESHOLD) {
    const exponent = Math.floor(Math.log10(percent));
    const mantissa = percent / 10 ** exponent;
    return `${mantissa.toFixed(2)}×10${toSuperscript(exponent)}%`;
  }

  const complement = 1 - probability;
  if (complement < 1e-6) return "> 99.9999%";

  // 越接近 0 或 100 就给越多小数位，中段维持两位，避免整排数字长短不一。
  const digits = percent < 0.01 ? 6 : percent < 1 ? 4 : complement < 1e-3 ? 4 : 2;
  return `${percent.toFixed(digits)}%`;
}

/**
 * 可以超过 100% 的比例，例如回收率。
 *
 * 跟 formatProbability 分开：那个是机率，夹在 0–100 是对的；回收率 120% 是完全
 * 合理的输入，被夹成 100% 反而把「这池是赚的」这个资讯抹掉。
 */
export function formatRatio(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

/** 次数：整数加千分位。四舍五入前先挡掉 NaN 与 Infinity。 */
export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return Math.round(value).toLocaleString("en-US");
}

/** 期望次数这类会有小数的量，保留两位。 */
export function formatDecimal(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/**
 * 金额。
 *
 * 不带单位：使用者填进来的数字本身就已经是他要的单位（元、石、抽都可以），
 * 成本与价值只要用同一个单位，算出来的净值就是对的；硬加一个「元」反而会说错话。
 * 正值不补 `+`：正负本身已经由颜色与文案表达，符号只负责标示亏损。
 */
export function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 100) / 100;
  const digits = Number.isInteger(rounded) ? 0 : 2;
  return rounded.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
