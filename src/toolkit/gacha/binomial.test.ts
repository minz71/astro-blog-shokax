import { describe, expect, it } from "vitest";

import {
  MAX_TRIALS,
  atLeastOnce,
  binomialCdfAtLeast,
  binomialCdfAtMost,
  binomialPmf,
  distributionAroundMode,
  expectedSuccesses,
  expectedTrialsPerSuccess,
  logBinomialCoefficient,
  mostLikelySuccesses,
  standardDeviation,
  trialsForConfidence,
} from "./binomial";

describe("logBinomialCoefficient", () => {
  it("matches hand-computable coefficients", () => {
    expect(Math.exp(logBinomialCoefficient(10, 5))).toBeCloseTo(252, 9);
    expect(Math.exp(logBinomialCoefficient(52, 5))).toBeCloseTo(2_598_960, 3);
    expect(logBinomialCoefficient(7, 0)).toBe(0);
    expect(logBinomialCoefficient(7, 7)).toBe(0);
  });

  it("stays finite where the coefficient itself overflows a double", () => {
    // C(1000, 500) ≈ 2.7e299 仍在 double 内，C(2000, 1000) ≈ 2e600 已经溢位；
    // 全程留在 log 空间的话两个都还算得出来。
    expect(Number.isFinite(logBinomialCoefficient(2000, 1000))).toBe(true);
    expect(logBinomialCoefficient(2000, 1000)).toBeCloseTo(1382.268, 3);
  });

  it("is -Infinity outside 0 ≤ k ≤ n", () => {
    expect(logBinomialCoefficient(5, 6)).toBe(Number.NEGATIVE_INFINITY);
    expect(logBinomialCoefficient(5, -1)).toBe(Number.NEGATIVE_INFINITY);
  });
});

describe("binomialPmf", () => {
  it("matches the exact value of C(10,5)/2^10", () => {
    expect(binomialPmf(10, 5, 0.5)).toBeCloseTo(0.246_093_75, 12);
  });

  it("handles a single trial", () => {
    expect(binomialPmf(1, 0, 0.3)).toBeCloseTo(0.7, 15);
    expect(binomialPmf(1, 1, 0.3)).toBeCloseTo(0.3, 15);
  });

  it("sums to 1 over the whole support", () => {
    for (const [n, p] of [
      [10, 0.5],
      [50, 0.006],
      [200, 0.015],
      [1000, 0.3],
    ] as const) {
      let total = 0;
      for (let k = 0; k <= n; k++) total += binomialPmf(n, k, p);
      expect(total).toBeCloseTo(1, 12);
    }
  });

  it("degenerates correctly at p = 0 and p = 1", () => {
    expect(binomialPmf(10, 0, 0)).toBe(1);
    expect(binomialPmf(10, 1, 0)).toBe(0);
    expect(binomialPmf(10, 10, 1)).toBe(1);
    expect(binomialPmf(10, 9, 1)).toBe(0);
  });

  it("returns 0 for impossible or malformed k", () => {
    expect(binomialPmf(10, 11, 0.5)).toBe(0);
    expect(binomialPmf(10, -1, 0.5)).toBe(0);
    expect(binomialPmf(10, 1.5, 0.5)).toBe(0);
    expect(binomialPmf(10, 5, 1.5)).toBe(0);
  });
});

describe("binomialCdfAtMost / binomialCdfAtLeast", () => {
  it("agrees with the brute-force sum in both directions", () => {
    const n = 60;
    const p = 0.04;
    for (const k of [0, 1, 2, 3, 6, 12, 30, 59]) {
      let lower = 0;
      for (let j = 0; j <= k; j++) lower += binomialPmf(n, j, p);
      expect(binomialCdfAtMost(n, k, p)).toBeCloseTo(lower, 12);
      expect(binomialCdfAtLeast(n, k, p)).toBeCloseTo(1 - lower + binomialPmf(n, k, p), 12);
    }
  });

  it("keeps the two directions complementary", () => {
    const n = 300;
    const p = 0.006;
    for (const k of [0, 1, 2, 5, 10]) {
      expect(binomialCdfAtMost(n, k, p) + binomialCdfAtLeast(n, k + 1, p)).toBeCloseTo(1, 12);
    }
  });

  it("does not lose the far right tail to cancellation", () => {
    // 1 - P(X ≤ 9) 在 double 里会直接被舍入成 0；直接加右尾才算得出真正的量级。
    const tail = binomialCdfAtLeast(10, 10, 1e-3);
    expect(tail).toBeGreaterThan(0);
    expect(tail).toBeCloseTo(1e-30, 35);
  });

  it("clamps outside the support", () => {
    expect(binomialCdfAtMost(10, -1, 0.5)).toBe(0);
    expect(binomialCdfAtMost(10, 10, 0.5)).toBe(1);
    expect(binomialCdfAtLeast(10, 0, 0.5)).toBe(1);
    expect(binomialCdfAtLeast(10, 11, 0.5)).toBe(0);
  });

  it("never reports more than certainty", () => {
    for (const k of [0, 1, 2, 3]) {
      expect(binomialCdfAtMost(5000, k, 0.9)).toBeLessThanOrEqual(1);
      expect(binomialCdfAtLeast(5000, k, 0.9)).toBeLessThanOrEqual(1);
    }
  });
});

describe("atLeastOnce", () => {
  it("matches 1-(1-p)^n where that formula is still accurate", () => {
    expect(atLeastOnce(100, 0.006)).toBeCloseTo(1 - 0.994 ** 100, 14);
    expect(atLeastOnce(1, 0.3)).toBeCloseTo(0.3, 15);
  });

  it("survives probabilities where the naive formula collapses to 0", () => {
    // 这是 expm1 存在的理由：1 - (1 - 1e-7)^10 会被舍入成 0。
    expect(atLeastOnce(10, 1e-7)).toBeCloseTo(1e-6, 12);
    expect(atLeastOnce(10, 1e-7)).toBeGreaterThan(0);
    expect(atLeastOnce(1, 1e-12)).toBeCloseTo(1e-12, 18);
  });

  it("agrees with the general upper cumulative at k = 1", () => {
    expect(binomialCdfAtLeast(500, 1, 0.002)).toBeCloseTo(atLeastOnce(500, 0.002), 14);
  });

  it("handles the degenerate ends", () => {
    expect(atLeastOnce(0, 0.5)).toBe(0);
    expect(atLeastOnce(100, 0)).toBe(0);
    expect(atLeastOnce(1, 1)).toBe(1);
  });
});

describe("summary statistics", () => {
  it("computes mean, sd and the geometric waiting time", () => {
    expect(expectedSuccesses(200, 0.006)).toBeCloseTo(1.2, 12);
    expect(standardDeviation(100, 0.5)).toBeCloseTo(5, 12);
    expect(expectedTrialsPerSuccess(0.006)).toBeCloseTo(166.666_666_67, 6);
    expect(Number.isNaN(expectedTrialsPerSuccess(0))).toBe(true);
  });

  it("puts the mode at floor((n+1)p)", () => {
    expect(mostLikelySuccesses(100, 0.006)).toBe(0);
    expect(mostLikelySuccesses(1000, 0.006)).toBe(6);
    expect(mostLikelySuccesses(10, 1)).toBe(10);
  });
});

describe("trialsForConfidence", () => {
  it("uses the closed form for a single success", () => {
    // ln(0.1)/ln(0.994) ≈ 382.6 → 383 抽才跨过九成。
    expect(trialsForConfidence(0.006, 0.9, 1)).toBe(383);
    expect(atLeastOnce(383, 0.006)).toBeGreaterThanOrEqual(0.9);
    expect(atLeastOnce(382, 0.006)).toBeLessThan(0.9);
  });

  it("returns the smallest n that clears the bar for k ≥ 2", () => {
    const n = trialsForConfidence(0.006, 0.9, 3);
    expect(n).not.toBeNull();
    expect(binomialCdfAtLeast(n!, 3, 0.006)).toBeGreaterThanOrEqual(0.9);
    expect(binomialCdfAtLeast(n! - 1, 3, 0.006)).toBeLessThan(0.9);
  });

  it("returns null when the target is out of reach within MAX_TRIALS", () => {
    expect(trialsForConfidence(1e-7, 0.99, 5)).toBeNull();
    expect(trialsForConfidence(0, 0.9, 1)).toBeNull();
    expect(trialsForConfidence(0.5, 1, 1)).toBeNull();
    expect(trialsForConfidence(0.5, 0.9, 0)).toBeNull();
  });

  it("never exceeds the trial ceiling", () => {
    const n = trialsForConfidence(1e-4, 0.99, 1);
    expect(n).not.toBeNull();
    expect(n!).toBeLessThanOrEqual(MAX_TRIALS);
  });
});

describe("distributionAroundMode", () => {
  it("centres the window on the mode", () => {
    const bars = distributionAroundMode(1000, 0.006, 5);
    expect(bars.map((bar) => bar.successes)).toEqual([4, 5, 6, 7, 8]);
  });

  it("matches the standalone cumulative functions on both sides", () => {
    // 窗口内的累积是从两端锚点往内加出来的，不是逐列呼叫 cdf；这条测试就是在钉住
    // 「省下来的那些呼叫没有换到不同的答案」。
    for (const [n, p] of [
      [180, 0.006],
      [1000, 0.3],
      [50, 0.5],
      [5000, 0.002],
    ] as const) {
      for (const bar of distributionAroundMode(n, p, 13)) {
        // 11 位而不是 12：逐项累加十三次会累积到 1e-12 量级的差，那比画面上显示的
        // 位数小了好几个数量级，不是精度问题。
        expect(bar.atMost).toBeCloseTo(binomialCdfAtMost(n, bar.successes, p), 11);
        expect(bar.atLeast).toBeCloseTo(binomialCdfAtLeast(n, bar.successes, p), 11);
      }
    }
  });

  it("keeps the two cumulative directions consistent with the pmf", () => {
    for (const bar of distributionAroundMode(200, 0.02, 13)) {
      expect(bar.atMost + bar.atLeast - bar.probability).toBeCloseTo(1, 12);
    }
  });

  it("reaches certainty exactly at the ends of the support", () => {
    // 「大约是 1」会被格式化成「> 99.9999%」，而这两个值在定义上就是 1。
    const whole = distributionAroundMode(8, 0.4, 13);
    expect(whole).toHaveLength(9);
    expect(whole[0].atLeast).toBe(1);
    expect(whole[8].atMost).toBe(1);

    const windowed = distributionAroundMode(100, 0.006, 13);
    expect(windowed[0].successes).toBe(0);
    expect(windowed[0].atLeast).toBe(1);
  });

  it("shifts the window instead of running off the edge", () => {
    const bars = distributionAroundMode(100, 0.006, 5);
    expect(bars.map((bar) => bar.successes)).toEqual([0, 1, 2, 3, 4]);
    expect(distributionAroundMode(100, 1, 5).map((bar) => bar.successes)).toEqual([
      96, 97, 98, 99, 100,
    ]);
  });

  it("never returns more bars than the support has", () => {
    expect(distributionAroundMode(2, 0.5, 13)).toHaveLength(3);
    expect(distributionAroundMode(0, 0.5, 13)).toHaveLength(1);
  });
});
