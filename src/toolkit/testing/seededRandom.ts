/**
 * 供 property test 使用的可重现随机数产生器。
 *
 * 刻意不引入 fast-check 之类的执行期依赖：property test 只需要「同一个 seed 永远
 * 产生同一串输入」，失败时把 seed 印出来就能重跑。演算法是 mulberry32，
 * 32-bit 状态、单行运算，足够均匀。
 */
export interface SeededRandom {
  /** [0, 1) 均匀分布 */
  next(): number;
  /** [min, max] 整数（含两端） */
  int(min: number, max: number): number;
  /** 以 probability 的机率回传 true */
  bool(probability?: number): boolean;
  /** 从非空数组中取一个元素 */
  pick<T>(items: readonly T[]): T;
  /** Fisher-Yates 洗牌，回传新数组，不修改输入 */
  shuffle<T>(items: readonly T[]): T[];
}

export function createSeededRandom(seed: number): SeededRandom {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, max: number): number => {
    if (max < min) {
      throw new RangeError(`int(${min}, ${max}): max 不得小于 min`);
    }

    return min + Math.floor(next() * (max - min + 1));
  };

  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) {
      throw new RangeError("pick(): 不能从空数组取值");
    }

    return items[int(0, items.length - 1)];
  };

  const shuffle = <T>(items: readonly T[]): T[] => {
    const result = [...items];

    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = int(0, i);
      [result[i], result[j]] = [result[j], result[i]];
    }

    return result;
  };

  return {
    next,
    int,
    bool: (probability = 0.5) => next() < probability,
    pick,
    shuffle,
  };
}
