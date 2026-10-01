import { afterEach, describe, expect, it, vi } from "vitest";

import { MAX_TRIALS } from "./binomial";
import {
  DEFAULT_STATE,
  MAX_AMOUNT,
  MAX_PRIZES,
  MIN_PROBABILITY_PERCENT,
  clearState,
  cloneState,
  createPrize,
  loadState,
  normalizeState,
  saveState,
} from "./state";

const STORAGE_KEY = "gacha-binomial-calculator";

/** node 环境本来没有 localStorage，用一个最小替身把读写路径撑起来。 */
function installStorage(initial: Record<string, string> = {}): Map<string, string> {
  const store = new Map(Object.entries(initial));
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  });
  return store;
}

/** 无痕模式与封锁网站资料的浏览器：存取当下就丢例外。 */
function installThrowingStorage(): void {
  vi.stubGlobal("localStorage", {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
    removeItem: () => {
      throw new Error("blocked");
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("normalizeState", () => {
  it("falls back to defaults for anything that is not an object", () => {
    expect(normalizeState(null)).toEqual(DEFAULT_STATE);
    expect(normalizeState("nope")).toEqual(DEFAULT_STATE);
    expect(normalizeState(undefined)).toEqual(DEFAULT_STATE);
    expect(normalizeState({})).toEqual(DEFAULT_STATE);
  });

  it("hands back a fresh prize array every time", () => {
    // 浅拷贝的话使用者第一次编辑就会污染 DEFAULT_STATE，后面每次重设都会带着旧值。
    const first = normalizeState({});
    first.prizes[0].name = "改過了";
    expect(normalizeState({}).prizes[0].name).toBe(DEFAULT_STATE.prizes[0].name);
  });

  it("clamps a hand-edited trial count to the ceiling", () => {
    expect(normalizeState({ trials: 1e9 }).trials).toBe(MAX_TRIALS);
    expect(normalizeState({ trials: 0 }).trials).toBe(1);
    expect(normalizeState({ trials: 12.7 }).trials).toBe(13);
  });

  it("clamps the target successes to the trial count", () => {
    expect(normalizeState({ trials: 10, successes: 50 }).successes).toBe(10);
    expect(normalizeState({ trials: 1e9, successes: 50 }).successes).toBe(50);
    expect(normalizeState({ successes: -3 }).successes).toBe(0);
  });

  it("keeps the confidence inside a range where the maths stays meaningful", () => {
    expect(normalizeState({ confidencePercent: 100 }).confidencePercent).toBe(99.99);
    expect(normalizeState({ confidencePercent: 0 }).confidencePercent).toBe(1);
  });

  it("caps amounts so that trials × amount stays exactly representable", () => {
    expect(normalizeState({ costPerTrial: Number.MAX_SAFE_INTEGER }).costPerTrial).toBe(MAX_AMOUNT);
    expect(normalizeState({ prizes: [{ value: 1e18 }] }).prizes[0].value).toBe(MAX_AMOUNT);
    // 上限存在的理由就是这一行：最坏情况的乘积仍要留在安全整数内。
    expect(MAX_TRIALS * MAX_AMOUNT).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });

  it("rejects non-finite and wrongly typed numbers", () => {
    expect(normalizeState({ trials: Number.NaN }).trials).toBe(DEFAULT_STATE.trials);
    expect(normalizeState({ costPerTrial: "60" }).costPerTrial).toBe(DEFAULT_STATE.costPerTrial);
    expect(normalizeState({ costPerTrial: Number.POSITIVE_INFINITY }).costPerTrial).toBe(
      DEFAULT_STATE.costPerTrial,
    );
  });

  it("fills in the distribution columns missing from an older blob", () => {
    // v3 早期的存档没有 distColumns，读进来要补预设值而不是整份作废。
    expect(normalizeState({ trials: 50 }).distColumns).toEqual(DEFAULT_STATE.distColumns);
    expect(normalizeState({ distColumns: "nope" }).distColumns).toEqual(DEFAULT_STATE.distColumns);
  });

  it("keeps each distribution column toggle independently", () => {
    expect(
      normalizeState({ distColumns: { pmf: false, atMost: true, atLeast: "yes" } }).distColumns,
    ).toEqual({ pmf: false, atMost: true, atLeast: DEFAULT_STATE.distColumns.atLeast });
  });

  it("ignores fields that no longer exist in the shape", () => {
    // v2 的存档带着 currency；v3 读进来不该把它带回 state 里。
    expect("currency" in normalizeState({ currency: "NTD" })).toBe(false);
  });
});

describe("normalizeState 的獎品表", () => {
  it("normalises each row and names the unnamed ones", () => {
    const prizes = normalizeState({
      prizes: [
        { name: "  SSR  ", probabilityPercent: 0.6, value: 3000 },
        { name: "", probabilityPercent: 5.1, value: -10 },
        "not an object",
      ],
    }).prizes;

    expect(prizes[0]).toEqual({ name: "SSR", probabilityPercent: 0.6, value: 3000 });
    expect(prizes[1].name).toBe("獎品 2");
    expect(prizes[1].value).toBe(0);
    expect(prizes[2].name).toBe("獎品 3");
  });

  it("clamps each row's probability into the usable range", () => {
    const prizes = normalizeState({
      prizes: [{ probabilityPercent: 0 }, { probabilityPercent: 500 }, { probabilityPercent: "x" }],
    }).prizes;
    expect(prizes[0].probabilityPercent).toBe(MIN_PROBABILITY_PERCENT);
    expect(prizes[1].probabilityPercent).toBe(100);
    expect(prizes[2].probabilityPercent).toBe(1);
  });

  it("caps the row count and truncates long names", () => {
    const many = Array.from({ length: MAX_PRIZES + 40 }, () => ({
      name: "x",
      probabilityPercent: 0.1,
    }));
    expect(normalizeState({ prizes: many }).prizes).toHaveLength(MAX_PRIZES);
    expect(normalizeState({ prizes: [{ name: "n".repeat(50) }] }).prizes[0].name).toHaveLength(16);
  });

  it("falls back to the defaults when the table is empty or not an array", () => {
    expect(normalizeState({ prizes: [] }).prizes).toEqual(DEFAULT_STATE.prizes);
    expect(normalizeState({ prizes: "nope" }).prizes).toEqual(DEFAULT_STATE.prizes);
  });

  it("keeps the target index pointing at a row that exists", () => {
    expect(normalizeState({ prizes: [{}, {}, {}], targetPrizeIndex: 2 }).targetPrizeIndex).toBe(2);
    expect(normalizeState({ prizes: [{}, {}], targetPrizeIndex: 9 }).targetPrizeIndex).toBe(1);
    expect(normalizeState({ prizes: [{}], targetPrizeIndex: -4 }).targetPrizeIndex).toBe(0);
    expect(normalizeState({ targetPrizeIndex: "1" }).targetPrizeIndex).toBe(0);
  });
});

describe("createPrize / cloneState", () => {
  it("numbers a new row by its position", () => {
    expect(createPrize(2).name).toBe("獎品 3");
    expect(createPrize(0).probabilityPercent).toBeGreaterThan(0);
    expect(createPrize(0).value).toBe(0);
  });

  it("copies the prize objects, not just the array", () => {
    const copy = cloneState(DEFAULT_STATE);
    copy.prizes[0].name = "改過了";
    expect(DEFAULT_STATE.prizes[0].name).not.toBe("改過了");
  });

  it("copies the distribution column toggles too", () => {
    const copy = cloneState(DEFAULT_STATE);
    copy.distColumns.atMost = !DEFAULT_STATE.distColumns.atMost;
    expect(DEFAULT_STATE.distColumns.atMost).not.toBe(copy.distColumns.atMost);
  });
});

describe("loadState / saveState", () => {
  it("round-trips a state through storage", () => {
    installStorage();
    const state = {
      ...cloneState(DEFAULT_STATE),
      trials: 383,
      costPerTrial: 60,
      targetPrizeIndex: 1,
    };
    saveState(state);
    expect(loadState()).toEqual(state);
  });

  it("round-trips an edited prize table", () => {
    installStorage();
    const state = cloneState(DEFAULT_STATE);
    state.prizes.push({ name: "R 素材", probabilityPercent: 94.3, value: 12 });
    saveState(state);
    expect(loadState()?.prizes).toHaveLength(3);
    expect(loadState()?.prizes[2]).toEqual({
      name: "R 素材",
      probabilityPercent: 94.3,
      value: 12,
    });
  });

  it("normalises on the way in as well as on the way out", () => {
    installStorage();
    saveState({ ...cloneState(DEFAULT_STATE), trials: 1e9, successes: 99 });
    expect(loadState()?.trials).toBe(MAX_TRIALS);
  });

  it("returns null when nothing was ever saved", () => {
    installStorage();
    expect(loadState()).toBeNull();
  });

  it("discards a blob written by a different storage version", () => {
    // 旧版本的栏位组合不一样，读进新程式码只会安静地算出错的答案。
    installStorage({
      [STORAGE_KEY]: JSON.stringify({ v: 2, state: { prizes: [{ probabilityPercent: 0.6 }] } }),
    });
    expect(loadState()).toBeNull();
  });

  it("discards corrupted json instead of throwing", () => {
    installStorage({ [STORAGE_KEY]: "{not json" });
    expect(loadState()).toBeNull();
  });

  it("survives a browser that blocks site data outright", () => {
    installThrowingStorage();
    expect(loadState()).toBeNull();
    expect(() => saveState(DEFAULT_STATE)).not.toThrow();
    expect(() => clearState()).not.toThrow();
  });

  it("survives an environment with no localStorage at all", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(loadState()).toBeNull();
    expect(() => saveState(DEFAULT_STATE)).not.toThrow();
  });

  it("clears the saved state", () => {
    const store = installStorage();
    saveState(DEFAULT_STATE);
    expect(store.size).toBe(1);
    clearState();
    expect(loadState()).toBeNull();
  });
});
