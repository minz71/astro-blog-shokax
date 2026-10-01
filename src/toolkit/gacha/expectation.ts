/**
 * 转蛋的期望值计算，支援多个奖品。
 *
 * 与 binomial.ts 分开：那边是机率模型，这边是把机率换算成钱。两者的接点只有奖品表
 * 里的机率，所以这里不 import 任何分布函式，全部是四则运算。
 *
 * 多奖品这件事在数学上其实没有增加难度：期望值是线性的，`E[总价值] = Σ pᵢ·vᵢ`，
 * 不管各列互斥与否都成立。真正需要多奖品的是「损益两平」那一组数字——副产物有价值
 * 之后，主奖要值多少才不亏，答案会被副产物先垫掉一截，这是单一奖品的版本算不出来的。
 *
 * 一律用「净值」而不是「报酬率」当主要输出：报酬率在成本为 0 时没有定义，而净值
 * 在任何输入下都说得通。
 */

export interface PrizeOdds {
  /** 单抽抽中这个奖品的机率，0–1。 */
  probability: number;
  /** 这个奖品对使用者的价值。 */
  value: number;
}

export interface GachaEconomicsInput {
  /** 奖品表。各列在同一抽里互斥，机率总和应该 ≤ 1。 */
  prizes: readonly PrizeOdds[];
  /** 哪一列是机率计算的目标；损益两平价值是针对它算的。 */
  targetIndex: number;
  /** 抽取次数。 */
  trials: number;
  /** 单次抽取的成本。 */
  costPerTrial: number;
}

export interface ExpectationResult {
  /** 机率总和。超过 1 代表奖品表填错了（同一抽不可能同时中两列）。 */
  totalProbability: number;
  /** 什么都没中的机率，也就是 1 - 总和；总和超过 1 时是 0。 */
  residualProbability: number;
  /** 每抽的期望价值 Σ p·v。 */
  valuePerTrial: number;
  /** 每抽的期望净值 = 期望价值 - 成本。 */
  netPerTrial: number;
  /** 投入的总成本 n·cost。这个数字是确定的，不是期望。 */
  totalCost: number;
  /** 期望获得的总价值 n·Σ p·v。 */
  expectedGross: number;
  /** 期望净值。负数代表长期来说是亏的。 */
  expectedNet: number;
  /** 回收率 = 期望价值 / 成本。成本为 0 时是 NaN。可以大于 1。 */
  recoveryRatio: number;
  /** 每一列的期望中奖次数 n·pᵢ，顺序与输入相同。 */
  expectedCounts: number[];
  /** 平均每中一个目标奖品要花多少钱 = cost / p_target。 */
  costPerTargetItem: number;
  /**
   * 目标奖品至少要值多少，整池才不亏。
   *
   * = (成本 - 其他奖品每抽贡献的价值) / p_target。
   *
   * 副产物先垫掉一部分成本，所以这个门槛会比「成本 / p_target」低——这正是把副产物
   * 填进来的意义。副产物本身已经超过成本时会是负数，呼叫端该把那种情况讲成
   * 「副产物就已经打平」，而不是印一个负的价格。
   */
  breakEvenTargetValue: number;
}

function safeDivide(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return Number.NaN;
  }
  return numerator / denominator;
}

export function calculateExpectation(input: GachaEconomicsInput): ExpectationResult {
  const { prizes, targetIndex, trials, costPerTrial } = input;

  let totalProbability = 0;
  let valuePerTrial = 0;
  const expectedCounts: number[] = [];
  for (const prize of prizes) {
    totalProbability += prize.probability;
    valuePerTrial += prize.probability * prize.value;
    expectedCounts.push(trials * prize.probability);
  }

  const target = prizes[targetIndex];
  const targetProbability = target?.probability ?? 0;
  // 目标以外的每抽贡献。用总和减掉目标那一项，而不是再跑一次回圈：两者等价，
  // 但少一次遍历也少一次「回圈条件写错」的机会。
  const othersValuePerTrial = valuePerTrial - targetProbability * (target?.value ?? 0);

  const totalCost = trials * costPerTrial;
  const expectedGross = trials * valuePerTrial;

  return {
    totalProbability,
    residualProbability: Math.max(0, 1 - totalProbability),
    valuePerTrial,
    netPerTrial: valuePerTrial - costPerTrial,
    totalCost,
    expectedGross,
    expectedNet: expectedGross - totalCost,
    recoveryRatio: safeDivide(valuePerTrial, costPerTrial),
    expectedCounts,
    costPerTargetItem: safeDivide(costPerTrial, targetProbability),
    breakEvenTargetValue: safeDivide(costPerTrial - othersValuePerTrial, targetProbability),
  };
}
