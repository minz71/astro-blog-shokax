import { describe, expect, it } from "vitest";

import {
  callPrice,
  digitalCallPrice,
  dValues,
  normalCdf,
  probabilityAbove,
  putPrice,
  vega,
} from "./blackScholes";
import type { OptionInput } from "./blackScholes";

const BASE: OptionInput = { spot: 100, strike: 100, years: 1, rate: 0.05, volatility: 0.2 };

describe("normalCdf", () => {
  it("matches reference values to double precision", () => {
    expect(normalCdf(0)).toBe(0.5);
    expect(normalCdf(1)).toBeCloseTo(0.841_344_746_068_542_9, 14);
    expect(normalCdf(-1)).toBeCloseTo(0.158_655_253_931_457_05, 14);
    expect(normalCdf(1.96)).toBeCloseTo(0.975_002_104_851_779_5, 14);
    expect(normalCdf(-3)).toBeCloseTo(0.001_349_898_031_630_094_6, 15);
  });

  it("keeps relative precision deep in the tail", () => {
    // Φ(−8) ≈ 6.22e-16：绝对误差小不代表对，这里要看相对误差。尾端的连分式只取五项，
    // 相对误差约 1e-8；换成绝对误差是 1e-23，对定价没有任何影响。
    expect(normalCdf(-8) / 6.220_960_574_271_819e-16).toBeCloseTo(1, 7);
    expect(normalCdf(-40)).toBe(0);
    expect(normalCdf(40)).toBe(1);
  });

  it("is symmetric", () => {
    for (const x of [0.1, 0.5, 1.3, 2.7, 6.9, 7.2]) {
      expect(normalCdf(x) + normalCdf(-x)).toBeCloseTo(1, 15);
    }
  });
});

describe("Black-Scholes prices", () => {
  it("matches the textbook example (S=K=100, T=1, r=5%, σ=20%)", () => {
    // Hull 的经典范例：call 10.4506、put 5.5735。
    expect(callPrice(BASE)).toBeCloseTo(10.450_583_572_185_565, 10);
    expect(putPrice(BASE)).toBeCloseTo(5.573_526_022_256_971, 10);
  });

  it("satisfies put-call parity", () => {
    for (const strike of [60, 95, 100, 130]) {
      for (const volatility of [0.05, 0.45, 1.2]) {
        const input = { ...BASE, strike, volatility, years: 7 / 365 };
        const parity = input.spot - strike * Math.exp(-input.rate * input.years);
        expect(callPrice(input) - putPrice(input)).toBeCloseTo(parity, 9);
      }
    }
  });

  it("collapses to intrinsic value when there is no time or no volatility", () => {
    expect(putPrice({ ...BASE, strike: 110, years: 0 })).toBeCloseTo(10, 12);
    expect(callPrice({ ...BASE, strike: 110, years: 0 })).toBe(0);
    expect(putPrice({ ...BASE, strike: 90, volatility: 0 })).toBe(0);
    expect(dValues({ ...BASE, years: 0, strike: 90 }).d2).toBe(Number.POSITIVE_INFINITY);
  });

  it("prices the digital as the negative strike-derivative of the call", () => {
    const h = 1e-3;
    const slope =
      (callPrice({ ...BASE, strike: 100 - h }) - callPrice({ ...BASE, strike: 100 + h })) / (2 * h);
    expect(digitalCallPrice(BASE)).toBeCloseTo(slope, 7);
    expect(probabilityAbove(BASE)).toBeCloseTo(digitalCallPrice(BASE) * Math.exp(0.05), 14);
  });

  it("computes vega as the volatility derivative", () => {
    const h = 1e-5;
    const slope =
      (putPrice({ ...BASE, volatility: 0.2 + h }) - putPrice({ ...BASE, volatility: 0.2 - h })) /
      (2 * h);
    expect(vega(BASE)).toBeCloseTo(slope, 6);
  });
});
