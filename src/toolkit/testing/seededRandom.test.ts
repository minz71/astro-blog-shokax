import { describe, expect, it } from "vitest";

import { createSeededRandom } from "./seededRandom";

describe("createSeededRandom", () => {
  it("同一个 seed 产生同一串数值", () => {
    const a = createSeededRandom(12_345);
    const b = createSeededRandom(12_345);

    expect(Array.from({ length: 20 }, () => a.next())).toEqual(
      Array.from({ length: 20 }, () => b.next()),
    );
  });

  it("不同 seed 产生不同数值", () => {
    const a = createSeededRandom(1);
    const b = createSeededRandom(2);

    expect(a.next()).not.toBe(b.next());
  });

  it("next 落在 [0, 1)", () => {
    const random = createSeededRandom(7);

    for (let i = 0; i < 500; i += 1) {
      const value = random.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("int 含两端且不越界", () => {
    const random = createSeededRandom(99);
    const seen = new Set<number>();

    for (let i = 0; i < 500; i += 1) {
      const value = random.int(3, 5);
      expect(Number.isInteger(value)).toBe(true);
      seen.add(value);
    }

    expect([...seen].toSorted((a, b) => a - b)).toEqual([3, 4, 5]);
  });

  it("int 的 min 等于 max 时固定回传该值", () => {
    const random = createSeededRandom(5);
    expect(random.int(4, 4)).toBe(4);
  });

  it("int 的 max 小于 min 时抛错", () => {
    const random = createSeededRandom(5);
    expect(() => random.int(5, 4)).toThrow(RangeError);
  });

  it("bool 的机率 0 与 1 是确定的", () => {
    const random = createSeededRandom(11);

    for (let i = 0; i < 50; i += 1) {
      expect(random.bool(0)).toBe(false);
      expect(random.bool(1)).toBe(true);
    }
  });

  it("pick 只回传输入中的元素，空数组抛错", () => {
    const random = createSeededRandom(23);
    const items = ["a", "b", "c"];

    for (let i = 0; i < 100; i += 1) {
      expect(items).toContain(random.pick(items));
    }

    expect(() => random.pick([])).toThrow(RangeError);
  });

  it("shuffle 保留元素且不修改输入", () => {
    const random = createSeededRandom(31);
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const frozen = [...input];
    const shuffled = random.shuffle(input);

    expect(input).toEqual(frozen);
    expect(shuffled.toSorted((a, b) => a - b)).toEqual(frozen);
  });
});
