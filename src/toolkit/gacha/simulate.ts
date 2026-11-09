/**
 * 模拟转蛋：照奖品表的机率真的抽一次。
 *
 * 与 binomial.ts 的解析解互补——那边回答「平均会怎样」，这边让人亲手抽几次，感受
 * 0.6% 到底有多难中。纯函式、rng 由外部注入，单元测试才能把每一个边界钉死。
 */

/** 抽奖只需要机率；名称、价值都是显示层的事。 */
export interface DrawablePrize {
  probabilityPercent: number;
}

/** 模拟结果的三种层级：目标列、其他奖品、什么都没中。 */
export type SimTier = "star" | "heart" | "plain" | "miss";

/** 什么都没中时 drawOnce 回传的索引。 */
export const MISS = -1;

/**
 * 一次最多翻几张。
 *
 * 每张牌都要演出，二十张已经是四排、十几秒；再多就该看计算机算出来的分布，而不是一张张翻。
 */
export const MAX_PULLS_PER_DRAW = 20;

/** 把使用者填的抽数夹进 1–{@link MAX_PULLS_PER_DRAW} 的整数；读不懂的值回到 1。 */
export function clampPullCount(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_PULLS_PER_DRAW, Math.max(1, Math.round(value)));
}

/** 负数、NaN、Infinity 一律当 0：这种列不该被抽到，也不该拖垮整张表的总和。 */
function weightOf(prize: DrawablePrize): number {
  const value = prize.probabilityPercent;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * 抽奖用的分母。
 *
 * 总和不到 100% 时剩下的就是「没中」，分母固定 100；超过 100% 时（计算机只警告、
 * 不强制）改用总和当分母，等于把每一列按比例缩小。否则排在后面的列会永远抽不到，
 * 而使用者只会觉得工具坏了。
 */
export function drawDenominator(prizes: readonly DrawablePrize[]): number {
  const sum = prizes.reduce((total, prize) => total + weightOf(prize), 0);
  return Math.max(100, sum);
}

/**
 * 每一列「实际上」被抽中的机率（百分比），以及没中的机率。
 *
 * 总和 ≤ 100% 时就是公告值；超过时是缩放后的值。累计表要拿这个跟实际抽到的比例
 * 对照，否则总和超标时两栏永远对不上。
 */
export function effectiveRates(prizes: readonly DrawablePrize[]): {
  rates: number[];
  missRate: number;
} {
  const denominator = drawDenominator(prizes);
  const rates = prizes.map((prize) => (weightOf(prize) / denominator) * 100);
  const missRate = Math.max(0, 100 - rates.reduce((total, rate) => total + rate, 0));
  return { rates, missRate };
}

/**
 * 抽一次，回传抽中的奖品索引；没中回传 {@link MISS}。
 *
 * `rng` 要回传 [0, 1) 的数，与 Math.random 同一个约定。
 */
export function drawOnce(
  prizes: readonly DrawablePrize[],
  rng: () => number = Math.random,
): number {
  const sum = prizes.reduce((total, prize) => total + weightOf(prize), 0);
  const denominator = Math.max(100, sum);
  let remaining = rng() * denominator;
  let lastPositive = MISS;

  for (let index = 0; index < prizes.length; index += 1) {
    const weight = weightOf(prizes[index]);
    if (weight === 0) continue;
    lastPositive = index;
    remaining -= weight;
    if (remaining < 0) return index;
  }

  // 总和 ≥ 100% 时没有「没中」这块区间；浮点误差让 remaining 剩下一点点正数时，
  // 归给最后一个有机率的列，不能凭空变出一次没中。
  return sum >= 100 ? lastPositive : MISS;
}

/** 连抽 count 次。 */
export function drawMany(
  prizes: readonly DrawablePrize[],
  count: number,
  rng: () => number = Math.random,
): number[] {
  return Array.from({ length: Math.max(0, Math.floor(count)) }, () => drawOnce(prizes, rng));
}

/** 两个机率差不到这个比例就算同一组：公告抄进来的 0.1 与 AI 汇入的 0.1000000001 是同一级。 */
const SAME_RATE_TOLERANCE = 1e-9;

/**
 * 依机率决定每一列翻开时的演出层级。
 *
 * 演出只给最稀有的两组：机率最低的那一组（同机率的全部算进去）是星星，次低的一组是
 * 爱心，其余都是素面牌。用机率分组而不是看「目标」列，是因为翻牌时该兴奋的是稀有的
 * 东西——目标常常就是最稀有的那一列，但两个 0.1% 的大奖同样值得一颗星。
 *
 * 机率为 0（或读不懂）的列根本抽不到，不参与分组，标成素面。
 */
export function rarityTiers(prizes: readonly DrawablePrize[]): SimTier[] {
  const groups: number[] = [];
  for (const prize of prizes) {
    const weight = weightOf(prize);
    if (weight === 0) continue;
    if (
      groups.some((rate) => Math.abs(rate - weight) <= SAME_RATE_TOLERANCE * Math.max(rate, weight))
    ) {
      continue;
    }
    groups.push(weight);
  }
  groups.sort((a, b) => a - b);
  const [lowest, second] = groups;

  const near = (a: number, b: number | undefined) =>
    b !== undefined && Math.abs(a - b) <= SAME_RATE_TOLERANCE * Math.max(a, b);

  return prizes.map((prize) => {
    const weight = weightOf(prize);
    if (weight === 0) return "plain";
    if (near(weight, lowest)) return "star";
    if (near(weight, second)) return "heart";
    return "plain";
  });
}

/** 抽到的索引属于哪一层；`tiers` 是 {@link rarityTiers} 的结果。 */
export function tierOf(prizeIndex: number, tiers: readonly SimTier[]): SimTier {
  if (prizeIndex === MISS) return "miss";
  return tiers[prizeIndex] ?? "plain";
}
