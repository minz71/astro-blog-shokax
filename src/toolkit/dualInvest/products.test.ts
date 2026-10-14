import { describe, expect, it } from "vitest";

import {
  benchmarkAt,
  breakEvenVolatilities,
  breakEvenVolatility,
  discountBuyPayoff,
  knockoutJump,
  payoffAt,
  valueProduct,
  volatilityCurve,
} from "./products";
import type { DiscountBuyParams, MarketParams, ProductParams } from "./products";

const MARKET: MarketParams = { spot: 100_000, days: 7, volatility: 0.45, rate: 0.05 };

const BUY_LOW: ProductParams = {
  mode: "buyLow",
  params: { strike: 95_000, apr: 0.25, principal: 10_000 },
};
const SELL_HIGH: ProductParams = {
  mode: "sellHigh",
  params: { strike: 105_000, apr: 0.2, amount: 0.1 },
};
const DISCOUNT: DiscountBuyParams = {
  target: 95_000,
  knockout: 98_000,
  apr: 0.3,
  principal: 10_000,
  partialRatio: 0.5,
};
const DISCOUNT_BUY: ProductParams = { mode: "discountBuy", params: DISCOUNT };

const ALL = [BUY_LOW, SELL_HIGH, DISCOUNT_BUY];

/** 换掉 APR 但保留型别：直接展开联集型别的 params 会被当成不安全的断言。 */
function withApr(product: ProductParams, apr: number): ProductParams {
  if (product.mode === "buyLow") return { mode: "buyLow", params: { ...product.params, apr } };
  if (product.mode === "sellHigh") return { mode: "sellHigh", params: { ...product.params, apr } };
  return { mode: "discountBuy", params: { ...product.params, apr } };
}

/**
 * 把到期报酬对对数常态分布直接做数值积分，再折现。
 *
 * 这条路完全不经过拆解式：只用「三段式结算规则」本身与风险中性分布。两边对得上，
 * 就代表拆成卖权、买权价差、数位选择权的那套式子没有拆错。用积分而不是蒙地卡罗，
 * 是为了让测试结果确定、误差也小到可以用很严的容差。
 */
function integratedPresentValue(market: MarketParams, product: ProductParams): number {
  const years = market.days / 365;
  const spread = market.volatility * Math.sqrt(years);
  const drift = (market.rate - (market.volatility * market.volatility) / 2) * years;
  const step = 2e-4;
  let total = 0;
  for (let z = -12; z <= 12; z += step) {
    const settle = market.spot * Math.exp(drift + spread * z);
    const density = Math.exp((-z * z) / 2) / Math.sqrt(2 * Math.PI);
    total += payoffAt(product, market.days, settle) * density * step;
  }
  return total * Math.exp(-market.rate * years);
}

describe("discountBuyPayoff", () => {
  it("reproduces the three official settlement rules", () => {
    const coins = DISCOUNT.principal / DISCOUNT.target;
    // 1. 跌破目标价：全部本金按目标价买币。
    expect(discountBuyPayoff(DISCOUNT, 7, 90_000)).toBeCloseTo(coins * 90_000, 9);
    // 2. 中间区间：一半按目标价买币，另一半退回 USDT，没有奖励。
    expect(discountBuyPayoff(DISCOUNT, 7, 97_000)).toBeCloseTo(5_000 + (coins / 2) * 97_000, 9);
    // 3. 敲出：本金加 APR。
    expect(discountBuyPayoff(DISCOUNT, 7, 120_000)).toBeCloseTo(10_000 * (1 + (0.3 * 7) / 365), 9);
  });

  it("is continuous at the target price and jumps only at the knockout", () => {
    expect(discountBuyPayoff(DISCOUNT, 7, 95_000)).toBeCloseTo(10_000, 9);
    expect(discountBuyPayoff(DISCOUNT, 7, 95_000.0001)).toBeCloseTo(10_000, 4);
  });
});

describe("knockoutJump", () => {
  it("matches the payoff gap across the knockout", () => {
    const below = discountBuyPayoff(DISCOUNT, 7, 98_000 - 1e-6);
    const at = discountBuyPayoff(DISCOUNT, 7, 98_000);
    expect(knockoutJump(DISCOUNT, 7)).toBeCloseTo(at - below, 4);
  });

  it("drops by about 100 USDT with the default terms", () => {
    // 敲出前折价 0.5 × (98/95 − 1) ≈ 1.58%，敲出后奖励 30% × 7/365 ≈ 0.58%：往下跳。
    expect(knockoutJump(DISCOUNT, 7)).toBeCloseTo(-100.36, 2);
  });

  it("turns upward once the reward outweighs the discount", () => {
    expect(knockoutJump({ ...DISCOUNT, apr: 1 }, 7)).toBeGreaterThan(0);
  });
});

describe("valueProduct", () => {
  it("agrees with direct numerical integration of the payoff", () => {
    for (const product of ALL) {
      const valuation = valueProduct(MARKET, product);
      expect(valuation.presentValue).toBeCloseTo(integratedPresentValue(MARKET, product), 2);
    }
  });

  it("splits into legs that add back up to −markup", () => {
    for (const product of ALL) {
      const valuation = valueProduct(MARKET, product);
      const sum = valuation.legs.reduce((total, leg) => total + leg.value, 0);
      expect(sum).toBeCloseTo(-valuation.markup, 8);
    }
  });

  it("has scenario probabilities that sum to 1", () => {
    for (const product of ALL) {
      const total = valueProduct(MARKET, product).scenarios.reduce(
        (sum, scenario) => sum + scenario.probability,
        0,
      );
      expect(total).toBeCloseTo(1, 12);
    }
  });

  it("makes the markup vanish exactly at the fair APR", () => {
    for (const product of ALL) {
      const { fairApr } = valueProduct(MARKET, product);
      expect(valueProduct(MARKET, withApr(product, fairApr)).markup).toBeCloseTo(0, 8);
    }
  });

  it("finds the textbook buy-low numbers for the default inputs", () => {
    // 参考值（与上面的数值积分验算一致）：Put(95k, 7 天, 45%) ≈ 681 USDT/颗，合理 APR ≈ 42.7%，给 25% 抽成约 33.8 USDT。
    // 文章的 IV 对照表用的就是这组数字（利率 5%），改了要连文章一起改。
    const valuation = valueProduct(MARKET, BUY_LOW);
    expect(valuation.fairApr).toBeGreaterThan(0.4);
    expect(valuation.fairApr).toBeLessThan(0.43);
    expect(valuation.markup).toBeGreaterThan(30);
    expect(valuation.markup).toBeLessThan(34);
    const discount = valueProduct(MARKET, DISCOUNT_BUY);
    expect(discount.markup).toBeCloseTo(31.7, 1);
    expect(discount.fairApr).toBeCloseTo(0.567, 3);
  });

  it("charges nothing when the benchmark is the product itself", () => {
    // 目标价压到几乎 0：卖权一文不值，产品等于「锁仓拿 APR」，合理 APR 就是这个利率。
    const product: ProductParams = {
      mode: "buyLow",
      params: { strike: 1, apr: 0, principal: 10_000 },
    };
    const valuation = valueProduct(MARKET, product);
    expect(valuation.fairApr).toBeCloseTo(((Math.exp((0.05 * 7) / 365) - 1) * 365) / 7, 10);
  });

  it("clamps a knockout below the target instead of mispricing", () => {
    const broken: ProductParams = {
      mode: "discountBuy",
      params: { ...DISCOUNT, knockout: 90_000 },
    };
    const clamped: ProductParams = {
      mode: "discountBuy",
      params: { ...DISCOUNT, knockout: 95_000 },
    };
    expect(valueProduct(MARKET, broken).presentValue).toBeCloseTo(
      valueProduct(MARKET, clamped).presentValue,
      9,
    );
  });
});

describe("benchmarkAt", () => {
  it("discounts back to the invested amount", () => {
    const years = MARKET.days / 365;
    expect(benchmarkAt(BUY_LOW, MARKET, 80_000) * Math.exp(-MARKET.rate * years)).toBeCloseTo(
      10_000,
      9,
    );
    expect(benchmarkAt(SELL_HIGH, MARKET, 80_000)).toBeCloseTo(8_000, 9);
  });
});

describe("IV sensitivity", () => {
  it("raises the fair APR of buy-low and sell-high monotonically with IV", () => {
    for (const product of [BUY_LOW, SELL_HIGH]) {
      const curve = volatilityCurve(MARKET, product, 0.1, 1.5, 28);
      for (let index = 1; index < curve.length; index++) {
        expect(curve[index].fairApr).toBeGreaterThan(curve[index - 1].fairApr);
      }
    }
  });

  it("finds the IV at which the offered APR becomes fair", () => {
    for (const product of ALL) {
      const implied = breakEvenVolatility(MARKET, product);
      expect(implied).not.toBeNull();
      const markup = valueProduct({ ...MARKET, volatility: implied! }, product).markup;
      expect(markup).toBeCloseTo(0, 6);
    }
  });

  it("gives no fair APR when the knockout is practically unreachable", () => {
    // 敲出价高于现价、IV 又低：几乎不可能敲出，y* 的分母趋近 0。
    // 修正前这里会算出 −1.7×10⁸%，把 IV 敏感度图整个撑爆。
    const market: MarketParams = { ...MARKET, spot: 84_075, days: 8.05, volatility: 0.03 };
    const product: ProductParams = {
      mode: "discountBuy",
      params: { ...DISCOUNT, target: 80_000, knockout: 86_000 },
    };
    expect(valueProduct(market, product).fairApr).toBeNaN();
    // 抽成本身仍然算得出来：没有奖励可拿，不代表产品没有价值。
    expect(Number.isFinite(valueProduct(market, product).markup)).toBe(true);
    // IV 一高起来就恢复成一般的数字。
    expect(Number.isFinite(valueProduct({ ...market, volatility: 0.3 }, product).fairApr)).toBe(
      true,
    );
  });

  it("reports every root when the discount-buy markup is not monotonic in IV", () => {
    // APR 很低、敲出价贴着目标价：低 IV 时几乎必定落在中间区间拿折价，高 IV 时卖权变贵，
    // 价差先负后正再变号，会有两个隐含 IV。
    const product: ProductParams = {
      mode: "discountBuy",
      params: { ...DISCOUNT, knockout: 96_000, apr: 0.05 },
    };
    const roots = breakEvenVolatilities(MARKET, product);
    expect(roots.length).toBe(2);
    expect(roots[0]).toBeLessThan(roots[1]);
    for (const root of roots) {
      expect(valueProduct({ ...MARKET, volatility: root }, product).markup).toBeCloseTo(0, 6);
    }
    expect(roots).toContain(breakEvenVolatility(MARKET, product));
  });

  it("returns null when no IV can justify the APR", () => {
    // APR 给到 0：任何 IV 下卖权都有价值，抽成永远是正的。
    expect(breakEvenVolatility(MARKET, withApr(BUY_LOW, 0))).toBeNull();
  });
});
