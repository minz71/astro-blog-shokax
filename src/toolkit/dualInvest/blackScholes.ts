/**
 * Black-Scholes 欧式选择权定价，给双币理财计算机用。
 *
 * 产品是欧式履约、敲出价只在到期观察（期间碰到哪个价位都不算），所以每一段都能用
 * 封闭解直接算，不需要蒙地卡罗或障碍选择权公式。
 *
 * 近似：结算价其实是「结算日 30 分钟的平均价」（亚式），这里当成到期单点现价。一般
 * 选择权误差很小，但折价买币在敲出价有跳跃给付，接近门槛与结算时误差会放大。
 *
 * 简化：标的不配息（q = 0），折现与远期都用同一个年利率 r（连续复利）。实际上加密
 * 货币的远期价由期货基差决定，不一定等于 S·e^{rT}；文章里有说明这个简化。
 */

export interface OptionInput {
  /** 现价。 */
  spot: number;
  /** 履约价。 */
  strike: number;
  /** 到期时间，单位年。 */
  years: number;
  /** 年利率，小数，连续复利。 */
  rate: number;
  /** 年化波动率，小数（45% 填 0.45）。 */
  volatility: number;
}

/**
 * 标准常态累积分布 Φ(x)。
 *
 * 用 Hart (1968) 的有理近似（West 2005 整理的版本），整条实数线上的绝对误差在 1e-14 量级
 * （尾端 |x| > 7 的相对误差约 1e-8，那里的值本身已经小于 1e-12）。
 * 不用常见的 Abramowitz–Stegun 7.1.26：那个只有 1e-7，价外很深的数位选择权
 * 价格本身就在 1e-6 附近，误差会跟答案一样大。
 *
 * 只算 x ≤ 0 这一侧、正半边用 1 − Φ(−x) 镜射回来，所以 Φ(x) + Φ(−x) = 1 准到浮点误差，
 * 买权卖权平价因此也会成立到同样的精度——单元测试靠这一点检查定价有没有写错。
 *
 * 系数照抄文献，刻意不加数字分隔符，方便逐位对照原文。
 */
export function normalCdf(x: number): number {
  if (Number.isNaN(x)) return Number.NaN;
  if (x > 0) return 1 - normalCdf(-x);

  const z = -x;
  if (z > 37) return 0;

  const exponential = Math.exp((-z * z) / 2);
  if (z < 7.071067811865475) {
    let numerator = 3.52624965998911e-2 * z + 0.700383064443688;
    numerator = numerator * z + 6.37396220353165;
    numerator = numerator * z + 33.912866078383;
    numerator = numerator * z + 112.079291497871;
    numerator = numerator * z + 221.213596169931;
    numerator = numerator * z + 220.206867912376;

    let denominator = 8.83883476483184e-2 * z + 1.75566716318264;
    denominator = denominator * z + 16.064177579207;
    denominator = denominator * z + 86.7807322029461;
    denominator = denominator * z + 296.564248779674;
    denominator = denominator * z + 637.333633378831;
    denominator = denominator * z + 793.826512519948;
    denominator = denominator * z + 440.413735824752;

    return (exponential * numerator) / denominator;
  }

  // 尾端改用连分式：有理式在这里会失去相对精度。
  let fraction = z + 0.65;
  fraction = z + 4 / fraction;
  fraction = z + 3 / fraction;
  fraction = z + 2 / fraction;
  fraction = z + 1 / fraction;
  return exponential / fraction / 2.506628274631;
}

/** 标准常态的机率密度 φ(x)。 */
export function normalPdf(x: number): number {
  return Math.exp((-x * x) / 2) / Math.sqrt(2 * Math.PI);
}

/**
 * Black-Scholes 的 d1、d2。
 *
 * 到期或波动率为 0 时公式会除以零。那时价格是确定的（远期价 S·e^{rT}），d 值退化成
 * ±∞：远期价高于履约价就是 +∞，否则是 −∞。直接回传无限大，让 normalCdf 自然给出
 * 0 或 1，比在每个定价函式里各写一次特例干净。
 */
export function dValues(input: OptionInput): { d1: number; d2: number } {
  const { spot, strike, years, rate, volatility } = input;
  const spread = volatility * Math.sqrt(Math.max(0, years));
  const logMoneyness = Math.log(spot / strike) + rate * years;

  if (!(spread > 0)) {
    const sign = logMoneyness > 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
    return { d1: sign, d2: sign };
  }

  const d1 = (logMoneyness + (spread * spread) / 2) / spread;
  return { d1, d2: d1 - spread };
}

function discountFactor(input: OptionInput): number {
  return Math.exp(-input.rate * input.years);
}

/** 欧式买权（call）的价格，每一颗标的。 */
export function callPrice(input: OptionInput): number {
  const { d1, d2 } = dValues(input);
  return input.spot * normalCdf(d1) - input.strike * discountFactor(input) * normalCdf(d2);
}

/** 欧式卖权（put）的价格，每一颗标的。 */
export function putPrice(input: OptionInput): number {
  const { d1, d2 } = dValues(input);
  return input.strike * discountFactor(input) * normalCdf(-d2) - input.spot * normalCdf(-d1);
}

/**
 * 现金或无（cash-or-nothing）数位买权：到期价 ≥ 履约价就付 1，否则付 0。
 *
 * 折价买币的「涨过敲出价才发 APR 奖励」就是这个。
 */
export function digitalCallPrice(input: OptionInput): number {
  return discountFactor(input) * normalCdf(dValues(input).d2);
}

/**
 * 风险中性下「到期价 ≥ 履约价」的机率，N(d2)。
 *
 * 这是从选择权价格反推出来的机率，不是对未来的预测——它已经把市场对下跌的避险
 * 需求算进去了，通常会比「真实」的下跌机率高一些。介面上要讲清楚这一点。
 */
export function probabilityAbove(input: OptionInput): number {
  return normalCdf(dValues(input).d2);
}

/** Vega：波动率每增加 1（也就是 100 个百分点）时，买权或卖权价格的变化。 */
export function vega(input: OptionInput): number {
  const { d1 } = dValues(input);
  if (!Number.isFinite(d1)) return 0;
  return input.spot * normalPdf(d1) * Math.sqrt(input.years);
}
