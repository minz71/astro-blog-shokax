import { describe, expect, it } from "vitest";

import { formatCount, formatDecimal, formatMoney, formatProbability, formatRatio } from "./format";

describe("formatProbability", () => {
  it("keeps ordinary probabilities at two decimals", () => {
    expect(formatProbability(0.5)).toBe("50.00%");
    expect(formatProbability(0.006)).toBe("0.6000%");
  });

  it("gives small probabilities more decimals instead of rounding them to zero", () => {
    expect(formatProbability(0.000_05)).toBe("0.005000%");
    expect(formatProbability(0.000_001)).toBe("1.00×10⁻⁴%");
    expect(formatProbability(1e-12)).toBe("1.00×10⁻¹⁰%");
  });

  it("does not collapse near-certainty into 100%", () => {
    // 抽很多次之后大家都落在这一区，位数不够就会整排显示成 100%。
    expect(formatProbability(0.9995)).toBe("99.9500%");
    expect(formatProbability(0.999_97)).toBe("99.9970%");
    expect(formatProbability(1 - 1e-9)).toBe("> 99.9999%");
  });

  it("writes the exact ends exactly", () => {
    expect(formatProbability(0)).toBe("0%");
    expect(formatProbability(1)).toBe("100%");
    expect(formatProbability(Number.NaN)).toBe("—");
  });
});

describe("formatRatio", () => {
  it("does not clamp at 100%, unlike formatProbability", () => {
    // 回收率 120% 是合理输入；被夹成 100% 会把「这池是赚的」这个资讯抹掉。
    expect(formatRatio(1.2)).toBe("120.0%");
    expect(formatRatio(0.7436)).toBe("74.4%");
    expect(formatRatio(0)).toBe("0.0%");
    expect(formatRatio(Number.NaN)).toBe("—");
  });
});

describe("number and money formatting", () => {
  it("adds thousand separators", () => {
    expect(formatCount(1_234_567)).toBe("1,234,567");
    expect(formatCount(Number.NaN)).toBe("—");
  });

  it("keeps two decimals for expected counts", () => {
    expect(formatDecimal(0.6)).toBe("0.60");
    expect(formatDecimal(1234.5678)).toBe("1,234.57");
    expect(formatDecimal(Number.POSITIVE_INFINITY)).toBe("—");
  });

  it("drops the decimals when the amount is whole", () => {
    expect(formatMoney(6000)).toBe("6,000");
    expect(formatMoney(-4200)).toBe("-4,200");
    expect(formatMoney(1234.5)).toBe("1,234.50");
    expect(formatMoney(Number.NaN)).toBe("—");
  });
});
