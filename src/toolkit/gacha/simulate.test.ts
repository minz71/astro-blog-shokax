import { describe, expect, it } from "vitest";

import {
  MAX_PULLS_PER_DRAW,
  MISS,
  clampPullCount,
  drawDenominator,
  drawMany,
  drawOnce,
  effectiveRates,
  rarityTiers,
  tierOf,
} from "./simulate";

/** 固定回传同一个值的 rng，用来把亂数钉在某个区间边界上。 */
const fixed = (value: number) => () => value;

/** 依序回传给定值的 rng。 */
function sequence(values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length];
}

/** 计算机的预设两列：主奖 0.6%、副产物 5.1%，剩下 94.3% 没中。 */
const POOL = [{ probabilityPercent: 0.6 }, { probabilityPercent: 5.1 }];

describe("drawOnce", () => {
  it("maps rng = 0 to the first prize", () => {
    expect(drawOnce(POOL, fixed(0))).toBe(0);
  });

  it("splits the [0, 1) range by cumulative probability", () => {
    // [0, 0.006) → 0，[0.006, 0.057) → 1，其余没中
    expect(drawOnce(POOL, fixed(0.005_999))).toBe(0);
    expect(drawOnce(POOL, fixed(0.006))).toBe(1);
    expect(drawOnce(POOL, fixed(0.056_999))).toBe(1);
    expect(drawOnce(POOL, fixed(0.057))).toBe(MISS);
    expect(drawOnce(POOL, fixed(0.999_999))).toBe(MISS);
  });

  it("never draws a zero-probability prize", () => {
    const prizes = [
      { probabilityPercent: 0 },
      { probabilityPercent: 50 },
      { probabilityPercent: 0 },
    ];
    expect(drawOnce(prizes, fixed(0))).toBe(1);
    expect(drawOnce(prizes, fixed(0.499))).toBe(1);
    expect(drawOnce(prizes, fixed(0.5))).toBe(MISS);
  });

  it("always misses when every probability is zero or the table is empty", () => {
    expect(drawOnce([{ probabilityPercent: 0 }], fixed(0))).toBe(MISS);
    expect(drawOnce([], fixed(0.3))).toBe(MISS);
  });

  it("treats negative and non-finite probabilities as zero", () => {
    const prizes = [
      { probabilityPercent: -10 },
      { probabilityPercent: Number.NaN },
      { probabilityPercent: Number.POSITIVE_INFINITY },
      { probabilityPercent: 20 },
    ];
    expect(drawOnce(prizes, fixed(0))).toBe(3);
    expect(drawOnce(prizes, fixed(0.25))).toBe(MISS);
  });

  it("scales the table instead of starving the last rows when the total exceeds 100%", () => {
    const prizes = [{ probabilityPercent: 80 }, { probabilityPercent: 80 }];
    expect(drawOnce(prizes, fixed(0.499))).toBe(0);
    expect(drawOnce(prizes, fixed(0.5))).toBe(1);
    // 没有「没中」这块：就算浮点误差留下一点余数，也要归给最后一列
    expect(drawOnce(prizes, fixed(1 - Number.EPSILON))).toBe(1);
  });

  it("never invents a miss when the table sums to exactly 100%", () => {
    const prizes = [
      { probabilityPercent: 0.1 },
      { probabilityPercent: 0.2 },
      { probabilityPercent: 99.7 },
    ];
    expect(drawOnce(prizes, fixed(1 - Number.EPSILON))).toBe(2);
  });
});

describe("drawMany", () => {
  it("draws exactly count times with the injected rng", () => {
    expect(drawMany(POOL, 3, sequence([0, 0.01, 0.9]))).toEqual([0, 1, MISS]);
  });

  it("returns nothing for zero, negative or fractional-below-one counts", () => {
    expect(drawMany(POOL, 0)).toEqual([]);
    expect(drawMany(POOL, -5)).toEqual([]);
    expect(drawMany(POOL, 0.9)).toEqual([]);
  });

  it("converges on the announced rates over many draws", () => {
    // mulberry32：固定种子，测试才不会偶尔红。不用朴素的线性同余——乘积会超出
    // 2^53，浮点数失真后分布是歪的。Math.imul 保证在 32 位整数里运算。
    let seed = 42;
    const mulberry32 = () => {
      seed = (seed + 0x6d_2b_79_f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
    };
    const results = drawMany(POOL, 200_000, mulberry32);
    const share = (index: number) =>
      results.filter((value) => value === index).length / results.length;
    expect(share(0)).toBeCloseTo(0.006, 2);
    expect(share(1)).toBeCloseTo(0.051, 2);
    expect(share(MISS)).toBeCloseTo(0.943, 2);
  });
});

describe("drawDenominator / effectiveRates", () => {
  it("keeps the announced rates when the total is at most 100%", () => {
    expect(drawDenominator(POOL)).toBe(100);
    const { rates, missRate } = effectiveRates(POOL);
    expect(rates[0]).toBeCloseTo(0.6, 12);
    expect(rates[1]).toBeCloseTo(5.1, 12);
    expect(missRate).toBeCloseTo(94.3, 12);
  });

  it("scales the rates down and leaves no miss when the total exceeds 100%", () => {
    const prizes = [{ probabilityPercent: 150 }, { probabilityPercent: 50 }];
    expect(drawDenominator(prizes)).toBe(200);
    const { rates, missRate } = effectiveRates(prizes);
    expect(rates).toEqual([75, 25]);
    expect(missRate).toBe(0);
  });
});

describe("clampPullCount", () => {
  it("keeps whole numbers inside 1–20", () => {
    expect(clampPullCount(1)).toBe(1);
    expect(clampPullCount(7)).toBe(7);
    expect(clampPullCount(MAX_PULLS_PER_DRAW)).toBe(20);
  });

  it("clamps out-of-range values and rounds fractions", () => {
    expect(clampPullCount(0)).toBe(1);
    expect(clampPullCount(-3)).toBe(1);
    expect(clampPullCount(99)).toBe(20);
    expect(clampPullCount(2.6)).toBe(3);
  });

  it("falls back to one pull for unreadable input", () => {
    expect(clampPullCount(Number.NaN)).toBe(1);
    expect(clampPullCount(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

const rates = (...values: number[]) => values.map((probabilityPercent) => ({ probabilityPercent }));

describe("rarityTiers", () => {
  it("gives the star to the rarest group and the heart to the next one", () => {
    // 两个 0.1% 同一组都是星星，40% 是爱心，59.8% 不给效果
    expect(rarityTiers(rates(0.1, 0.1, 40, 59.8))).toEqual(["star", "star", "heart", "plain"]);
  });

  it("does not depend on the row order", () => {
    expect(rarityTiers(rates(40, 0.1, 59.8, 0.1))).toEqual(["heart", "star", "plain", "star"]);
  });

  it("puts every row in the star group when all rates are equal", () => {
    expect(rarityTiers(rates(10, 10, 10))).toEqual(["star", "star", "star"]);
  });

  it("hands out no heart when there is only one group", () => {
    expect(rarityTiers(rates(0.6))).toEqual(["star"]);
  });

  it("leaves undrawable rows plain and out of the grouping", () => {
    // 0 不能把星星抢走，否则真正最稀有的 1% 会变成爱心
    expect(rarityTiers(rates(0, 1, 5))).toEqual(["plain", "star", "heart"]);
    expect(rarityTiers(rates(Number.NaN, -2, 3))).toEqual(["plain", "plain", "star"]);
  });

  it("treats floating-point near-duplicates as the same group", () => {
    expect(rarityTiers(rates(0.1, 0.1 + 1e-12, 5))).toEqual(["star", "star", "heart"]);
  });

  it("returns an empty list for an empty table", () => {
    expect(rarityTiers([])).toEqual([]);
  });
});

describe("tierOf", () => {
  it("looks the drawn row up in the tier table and maps a miss to miss", () => {
    const tiers = rarityTiers(rates(0.6, 5.1));
    expect(tierOf(0, tiers)).toBe("star");
    expect(tierOf(1, tiers)).toBe("heart");
    expect(tierOf(MISS, tiers)).toBe("miss");
    // 越界（表刚被改短）当素面，不会炸
    expect(tierOf(7, tiers)).toBe("plain");
  });
});
