import { describe, expect, it } from "vitest";

import { calculateExpectation } from "./expectation";

/** 一池常见的三层稀有度：主奖 0.6%、副产物 5.1%、垫底 94.3%。 */
const POOL = [
  { probability: 0.006, value: 3000 },
  { probability: 0.051, value: 300 },
  { probability: 0.943, value: 12 },
];

describe("calculateExpectation", () => {
  it("adds every prize up, not just the target", () => {
    const result = calculateExpectation({
      prizes: POOL,
      targetIndex: 0,
      trials: 100,
      costPerTrial: 60,
    });

    // 0.006×3000 + 0.051×300 + 0.943×12 = 18 + 15.3 + 11.316
    expect(result.valuePerTrial).toBeCloseTo(44.616, 9);
    expect(result.expectedGross).toBeCloseTo(4461.6, 7);
    expect(result.totalCost).toBe(6000);
    expect(result.expectedNet).toBeCloseTo(-1538.4, 7);
    expect(result.netPerTrial).toBeCloseTo(-15.384, 9);
    expect(result.recoveryRatio).toBeCloseTo(0.7436, 9);
  });

  it("reports the expected count of every prize", () => {
    const result = calculateExpectation({
      prizes: POOL,
      targetIndex: 0,
      trials: 200,
      costPerTrial: 60,
    });
    expect(result.expectedCounts).toHaveLength(3);
    expect(result.expectedCounts[0]).toBeCloseTo(1.2, 12);
    expect(result.expectedCounts[1]).toBeCloseTo(10.2, 12);
    expect(result.expectedCounts[2]).toBeCloseTo(188.6, 12);
  });

  it("reports the total and the residual probability", () => {
    const result = calculateExpectation({
      prizes: POOL,
      targetIndex: 0,
      trials: 1,
      costPerTrial: 0,
    });
    expect(result.totalProbability).toBeCloseTo(1, 12);
    expect(result.residualProbability).toBeCloseTo(0, 12);

    const sparse = calculateExpectation({
      prizes: [{ probability: 0.006, value: 3000 }],
      targetIndex: 0,
      trials: 1,
      costPerTrial: 0,
    });
    expect(sparse.residualProbability).toBeCloseTo(0.994, 12);
  });

  it("never reports a negative residual when the table over-counts", () => {
    const result = calculateExpectation({
      prizes: [
        { probability: 0.8, value: 1 },
        { probability: 0.5, value: 1 },
      ],
      targetIndex: 0,
      trials: 1,
      costPerTrial: 0,
    });
    expect(result.totalProbability).toBeCloseTo(1.3, 12);
    expect(result.residualProbability).toBe(0);
  });

  it("lets the by-products lower the target's break-even value", () => {
    const alone = calculateExpectation({
      prizes: [POOL[0]],
      targetIndex: 0,
      trials: 100,
      costPerTrial: 60,
    });
    const withByProducts = calculateExpectation({
      prizes: POOL,
      targetIndex: 0,
      trials: 100,
      costPerTrial: 60,
    });

    // 只有主奖时门槛就是 成本 / p = 60 / 0.006。
    expect(alone.breakEvenTargetValue).toBeCloseTo(10_000, 9);
    // 副产物每抽先垫掉 26.616，剩下的才由主奖负担：(60 - 26.616) / 0.006。
    expect(withByProducts.breakEvenTargetValue).toBeCloseTo(5564, 9);
    expect(withByProducts.breakEvenTargetValue).toBeLessThan(alone.breakEvenTargetValue);
  });

  it("goes negative when the by-products alone already cover the cost", () => {
    const result = calculateExpectation({
      prizes: [
        { probability: 0.01, value: 100 },
        { probability: 0.9, value: 200 },
      ],
      targetIndex: 0,
      trials: 10,
      costPerTrial: 5,
    });
    // 副产物每抽就贡献 180，远超过 5 的成本，所以主奖值 0 也不亏。
    expect(result.breakEvenTargetValue).toBeLessThan(0);
    expect(result.expectedNet).toBeGreaterThan(0);
  });

  it("keeps costPerTargetItem tied to the target row only", () => {
    const result = calculateExpectation({
      prizes: POOL,
      targetIndex: 1,
      trials: 100,
      costPerTrial: 60,
    });
    expect(result.costPerTargetItem).toBeCloseTo(60 / 0.051, 9);
  });

  it("reports NaN rather than Infinity where the ratio is undefined", () => {
    const noCost = calculateExpectation({
      prizes: POOL,
      targetIndex: 0,
      trials: 10,
      costPerTrial: 0,
    });
    // 回收率的分母是成本，成本 0 时没有定义；但「每中一个要花多少」的分母是机率，
    // 成本 0 抽起来本来就不用钱，答案确实是 0 而不是未定义。
    expect(Number.isNaN(noCost.recoveryRatio)).toBe(true);
    expect(noCost.costPerTargetItem).toBe(0);

    const noChance = calculateExpectation({
      prizes: [{ probability: 0, value: 100 }],
      targetIndex: 0,
      trials: 10,
      costPerTrial: 10,
    });
    expect(Number.isNaN(noChance.costPerTargetItem)).toBe(true);
    expect(Number.isNaN(noChance.breakEvenTargetValue)).toBe(true);
  });

  it("survives a target index that points nowhere", () => {
    const result = calculateExpectation({
      prizes: POOL,
      targetIndex: 99,
      trials: 10,
      costPerTrial: 60,
    });
    expect(Number.isNaN(result.costPerTargetItem)).toBe(true);
    // 总和与净值不依赖目标，仍应该算得出来。
    expect(result.valuePerTrial).toBeCloseTo(44.616, 9);
  });

  it("stays at zero when nothing is spent and nothing is worth anything", () => {
    const result = calculateExpectation({
      prizes: [{ probability: 0.5, value: 0 }],
      targetIndex: 0,
      trials: 10,
      costPerTrial: 0,
    });
    expect(result.expectedNet).toBe(0);
    expect(result.netPerTrial).toBe(0);
    expect(result.totalCost).toBe(0);
  });
});
