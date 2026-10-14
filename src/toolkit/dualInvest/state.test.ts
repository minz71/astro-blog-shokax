import { describe, expect, it } from "vitest";

import { formatPercent, formatSignedUsd, formatUsd } from "./format";
import { DEFAULT_STATE, MIN_DAYS, cloneState, marketOf, normalizeState, productOf } from "./state";

describe("normalizeState", () => {
  it("falls back to the defaults for garbage", () => {
    expect(normalizeState(null)).toEqual(DEFAULT_STATE);
    expect(normalizeState("x")).toEqual(DEFAULT_STATE);
    expect(normalizeState({ mode: "nope", spot: "100" })).toEqual(DEFAULT_STATE);
  });

  it("clamps out-of-range numbers", () => {
    const state = normalizeState({ ...DEFAULT_STATE, days: 0, volatilityPercent: 999, spot: -5 });
    expect(state.days).toBe(MIN_DAYS);
    expect(state.volatilityPercent).toBe(300);
    expect(state.spot).toBeGreaterThan(0);
  });

  it("never lets the knockout fall below the target", () => {
    const state = normalizeState({
      ...DEFAULT_STATE,
      discountBuy: { ...DEFAULT_STATE.discountBuy, target: 99_000, knockout: 90_000 },
    });
    expect(state.discountBuy.knockout).toBe(99_000);
  });

  it("keeps each mode's own terms", () => {
    const state = normalizeState({ ...cloneState(DEFAULT_STATE), mode: "sellHigh" });
    expect(state.mode).toBe("sellHigh");
    expect(state.buyLow).toEqual(DEFAULT_STATE.buyLow);
  });
});

describe("marketOf / productOf", () => {
  it("converts percentages into decimals", () => {
    const market = marketOf(DEFAULT_STATE);
    expect(market.volatility).toBeCloseTo(0.45, 12);
    expect(market.rate).toBeCloseTo(0.05, 12);
    const product = productOf(DEFAULT_STATE);
    expect(product.mode).toBe("discountBuy");
    if (product.mode === "discountBuy") {
      expect(product.params.apr).toBeCloseTo(0.3, 12);
      expect(product.params.partialRatio).toBeCloseTo(0.5, 12);
    }
  });
});

describe("format", () => {
  it("formats money and signed legs", () => {
    expect(formatUsd(1234.567)).toBe("1,234.57");
    expect(formatUsd(-0.001)).toBe("0.00");
    expect(formatSignedUsd(-72.1)).toBe("−72.10");
    expect(formatSignedUsd(47.9)).toBe("+47.90");
  });

  it("gives small percentages enough digits", () => {
    expect(formatPercent(0.003_38)).toBe("0.338%");
    expect(formatPercent(0.427)).toBe("42.70%");
    expect(formatPercent(-0.05)).toBe("−5.00%");
    expect(formatPercent(Number.NaN)).toBe("—");
  });
});
