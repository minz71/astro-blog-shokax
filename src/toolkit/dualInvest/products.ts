/**
 * 三种「赚币」理财产品的拆解与定价。
 *
 * 核心观念：这些产品都是用户把一（或几）个选择权卖给交易所。每个产品都算同一件事：
 *
 *   估计定价价差 = 用户投入的价值 − 用户到期拿回来的东西「现在」值多少
 *
 * 「现在值多少」用 Black-Scholes 在风险中性下折现。只收一个利率：这笔钱放别处的
 * 年利率，同时当机会成本与定价利率。两者实际上未必相同，这是为了少填栏位的简化，
 * 文章里有说明。
 *
 * 所有金额都以 USDT 计价；利率、APR、波动率一律用小数（30% 填 0.3）。
 */

import { callPrice, digitalCallPrice, probabilityAbove, putPrice } from "./blackScholes";
import type { OptionInput } from "./blackScholes";

/** 一年用 365 天：交易所的 APR 与选择权市场的到期时间都是这样换算的。 */
export const DAYS_PER_YEAR = 365;

/**
 * 敲出机率低于这个值时，折价买币的「合理 APR」视为没有意义（回 NaN）。
 *
 * 合理报酬率 y* = (P − PV₀) / (P · Digital(H))，分母就是「敲出才发奖励」的现值。
 * 敲出价高于现价、IV 又很低时，几乎不可能敲出，分母趋近 0，y* 会冲到 ±10⁸% 这种
 * 数字——数学上没错，但它在说的是「奖励几乎拿不到，给多少都一样」，印成数字只会
 * 误导人，画进图里还会把整条 y 轴撑爆。
 */
export const MIN_KNOCKOUT_PROBABILITY = 0.01;

export type ProductMode = "buyLow" | "sellHigh" | "discountBuy";

export interface MarketParams {
  /** 申购当下的现价。 */
  spot: number;
  /** 距离结算还有几天，可以有小数。 */
  days: number;
  /** 年化隐含波动率。 */
  volatility: number;
  /** 这笔钱放别处的年利率：同时当机会成本与定价利率（简化）。 */
  rate: number;
}

/** 双币「低买」：投入 USDT，跌破目标价就按目标价换成币。等于卖出一个卖权。 */
export interface BuyLowParams {
  strike: number;
  apr: number;
  /** 投入的 USDT。 */
  principal: number;
}

/** 双币「高卖」：投入币，涨破目标价就按目标价换成 USDT。等于卖出一个买权（备兑）。 */
export interface SellHighParams {
  strike: number;
  apr: number;
  /** 投入的币数量。 */
  amount: number;
}

/** 币安折价买币：三段式结算，见 discountBuyPayoff。 */
export interface DiscountBuyParams {
  /** 目标买入价，通常低于现价。 */
  target: number;
  /** 敲出价，必须高于目标价。 */
  knockout: number;
  apr: number;
  principal: number;
  /** 结算价落在目标价与敲出价之间时，按目标价买入的本金比例。官方是 50%。 */
  partialRatio: number;
}

export type ProductParams =
  | { mode: "buyLow"; params: BuyLowParams }
  | { mode: "sellHigh"; params: SellHighParams }
  | { mode: "discountBuy"; params: DiscountBuyParams };

/** 价值拆解里的一项。正数对用户有利、负数对用户不利；全部加起来等于 −抽成。 */
export interface ValueLeg {
  key: string;
  label: string;
  value: number;
}

/** 一种结算结果，以及它在风险中性下发生的机率。 */
export interface ScenarioOutcome {
  key: string;
  probability: number;
}

export interface Valuation {
  /** 用户投入的东西现在值多少 USDT（本金，或币数 × 现价）。 */
  invested: number;
  /** 用户到期会拿回的东西，折现到现在值多少 USDT。 */
  presentValue: number;
  /** 估计定价价差（文章简称抽成）= invested − presentValue。 */
  markup: number;
  /** 抽成占投入的比例（这一期）。 */
  markupRatio: number;
  /** 抽成换算成年化。 */
  markupAnnualized: number;
  /** 交易所实际给的这一期报酬率（APR × 天数 / 365，单利）。 */
  periodYield: number;
  /** 让抽成刚好为 0 的那一期报酬率；算不出来时是 NaN。 */
  fairPeriodYield: number;
  /** fairPeriodYield 换算成 APR。 */
  fairApr: number;
  legs: ValueLeg[];
  scenarios: ScenarioOutcome[];
}

export function yearsOf(market: MarketParams): number {
  return market.days / DAYS_PER_YEAR;
}

export function periodYieldOf(apr: number, days: number): number {
  return (apr * days) / DAYS_PER_YEAR;
}

function optionInput(market: MarketParams, strike: number): OptionInput {
  return {
    spot: market.spot,
    strike,
    years: yearsOf(market),
    rate: market.rate,
    volatility: market.volatility,
  };
}

/**
 * 敲出价不得低于目标价。
 *
 * 拆解式假设 K ≤ H：H < K 时「中间区间」不存在，拆出来的四个选择权也拼不回官方的
 * 结算规则。状态层已经会把栏位夹住，这里再守一次，免得纯函式被别处误用时算出
 * 看似合理、其实错误的数字。
 */
function knockoutOf(params: DiscountBuyParams): number {
  return Math.max(params.knockout, params.target);
}

// ── 到期报酬（画图与验算用） ────────────────────────────────

/** 低买：到期价 ≥ 目标价拿回 USDT 加奖励；跌破就以目标价换成币，奖励也是币。 */
export function buyLowPayoff(params: BuyLowParams, days: number, settle: number): number {
  const growth = 1 + periodYieldOf(params.apr, days);
  if (settle >= params.strike) return params.principal * growth;
  return (params.principal / params.strike) * growth * settle;
}

/** 高卖：到期价 ≤ 目标价拿回币加奖励；涨破就以目标价换成 USDT。以 USDT 计价。 */
export function sellHighPayoff(params: SellHighParams, days: number, settle: number): number {
  const growth = 1 + periodYieldOf(params.apr, days);
  if (settle <= params.strike) return params.amount * growth * settle;
  return params.amount * growth * params.strike;
}

/**
 * 折价买币的三段式结算（币安官方规则）：
 *
 * 1. 结算价 ≤ 目标价：100% 本金按目标价买币，没有奖励。
 * 2. 目标价 < 结算价 < 敲出价：比例 α（官方 50%）的本金按目标价买币，其余退回 USDT，
 *    没有奖励。因为目标价低于结算价，买到的币一结算就是赚的——这就是「折价」。
 * 3. 结算价 ≥ 敲出价：退回全部本金并发放 APR 奖励。
 */
export function discountBuyPayoff(params: DiscountBuyParams, days: number, settle: number): number {
  const { principal, target, partialRatio } = params;
  const coins = principal / target;
  if (settle <= target) return coins * settle;
  if (settle < knockoutOf(params)) {
    return (1 - partialRatio) * principal + partialRatio * coins * settle;
  }
  return principal * (1 + periodYieldOf(params.apr, days));
}

/**
 * 结算价从敲出价下方跨到敲出价时，到期拿回的价值跳多少：
 *
 *   ΔV = P·[y − α·(H / K − 1)]
 *
 * 敲出前一刻拿到的是中间区间的折价 α·P·(H/K − 1)，敲出后换成 APR 奖励 P·y。
 * 折价比奖励大时 ΔV < 0：结算价稍微涨过敲出价，拿回的总价值反而变少。
 */
export function knockoutJump(params: DiscountBuyParams, days: number): number {
  const knockout = knockoutOf(params);
  const discount = params.partialRatio * (knockout / params.target - 1);
  return params.principal * (periodYieldOf(params.apr, days) - discount);
}

/** 依模式取得到期报酬函式，给画图用。 */
export function payoffAt(product: ProductParams, days: number, settle: number): number {
  if (product.mode === "buyLow") return buyLowPayoff(product.params, days, settle);
  if (product.mode === "sellHigh") return sellHighPayoff(product.params, days, settle);
  return discountBuyPayoff(product.params, days, settle);
}

/**
 * 「什么都不买」的对照组到期值：USDT 产品是本金放在别处生息，币本位产品是单纯持币。
 *
 * 用连续复利，与折现用的利率一致，这样对照组折现回来刚好等于投入，价差为 0 的意思
 * 就是「跟把钱放别处一样划算」。
 */
export function benchmarkAt(product: ProductParams, market: MarketParams, settle: number): number {
  if (product.mode === "sellHigh") return product.params.amount * settle;
  return product.params.principal * Math.exp(market.rate * yearsOf(market));
}

// ── 定价 ─────────────────────────────────────────────────────

function finish(
  market: MarketParams,
  invested: number,
  presentValue: number,
  periodYield: number,
  fairPeriodYield: number,
  legs: ValueLeg[],
  scenarios: ScenarioOutcome[],
): Valuation {
  const markup = invested - presentValue;
  const markupRatio = invested > 0 ? markup / invested : Number.NaN;
  const perYear = market.days > 0 ? DAYS_PER_YEAR / market.days : Number.NaN;
  return {
    invested,
    presentValue,
    markup,
    markupRatio,
    markupAnnualized: markupRatio * perYear,
    periodYield,
    fairPeriodYield,
    fairApr: fairPeriodYield * perYear,
    legs,
    scenarios,
  };
}

/**
 * 低买 = 存一笔 USDT ＋ 卖出 (1 + y)·Q 个履约价 K 的卖权。
 *
 * 到期值 V = (1 + y)·[P − Q·(K − S)⁺]，Q = P / K。
 * 现值 PV = (1 + y)·[P·e^{−rT} − Q·Put(K)]，令 PV = P 解出合理报酬率。
 */
export function valueBuyLow(market: MarketParams, params: BuyLowParams): Valuation {
  const { principal, strike } = params;
  const option = optionInput(market, strike);
  const discount = Math.exp(-market.rate * option.years);
  const coins = principal / strike;
  const put = putPrice(option);
  const y = periodYieldOf(params.apr, market.days);

  const base = principal * discount - coins * put;
  const presentValue = (1 + y) * base;
  const fair = base > 0 ? principal / base - 1 : Number.NaN;

  return finish(
    market,
    principal,
    presentValue,
    y,
    fair,
    [
      {
        key: "interest",
        label: "資金鎖住、少賺的利息",
        value: -(principal - principal * discount),
      },
      { key: "reward", label: "交易所付的獎勵", value: y * principal * discount },
      { key: "put", label: "賣出的賣權（跌破目標價要接盤）", value: -(1 + y) * coins * put },
    ],
    [
      { key: "converted", probability: 1 - probabilityAbove(option) },
      { key: "kept", probability: probabilityAbove(option) },
    ],
  );
}

/**
 * 高卖 = 持有 (1 + y)·N 颗币 ＋ 卖出 (1 + y)·N 个履约价 K 的买权（备兑买权）。
 *
 * 到期值 V = (1 + y)·[N·S − N·(S − K)⁺]，现值 PV = (1 + y)·[N·S₀ − N·Call(K)]。
 * 对照组是单纯持币，现值就是 N·S₀。
 */
export function valueSellHigh(market: MarketParams, params: SellHighParams): Valuation {
  const { amount, strike } = params;
  const option = optionInput(market, strike);
  const call = callPrice(option);
  const y = periodYieldOf(params.apr, market.days);
  const invested = amount * market.spot;

  const base = invested - amount * call;
  const presentValue = (1 + y) * base;
  const fair = base > 0 ? invested / base - 1 : Number.NaN;

  return finish(
    market,
    invested,
    presentValue,
    y,
    fair,
    [
      { key: "reward", label: "交易所付的獎勵（以幣計）", value: y * invested },
      { key: "call", label: "賣出的買權（漲破目標價要賣掉）", value: -(1 + y) * amount * call },
    ],
    [
      { key: "converted", probability: probabilityAbove(option) },
      { key: "kept", probability: 1 - probabilityAbove(option) },
    ],
  );
}

/**
 * 折价买币拆成四个标准选择权（Q = P / K，α = 部分买入比例）：
 *
 *   V = P
 *     − Q·(K − S)⁺                 卖出卖权：跌破目标价就全额接盘
 *     + α·Q·[(S − K)⁺ − (S − H)⁺]  买权价差：中间区间以目标价买到一部分
 *     − α·Q·(H − K)·1{S ≥ H}       数位选择权：敲出时把上面那段收回
 *     + P·y·1{S ≥ H}               数位选择权：敲出才发奖励
 *
 * 三个区间代入都会拼回官方规则（单元测试逐区验证）。只有最后一项含 y，所以合理
 * 报酬率是一次方程式的解：y* = (P − PV₀) / (P · Digital(H))。
 */
export function valueDiscountBuy(market: MarketParams, params: DiscountBuyParams): Valuation {
  const { principal, target, partialRatio } = params;
  const knockout = knockoutOf(params);
  const atTarget = optionInput(market, target);
  const atKnockout = optionInput(market, knockout);
  const discount = Math.exp(-market.rate * atTarget.years);
  const coins = principal / target;
  const y = periodYieldOf(params.apr, market.days);

  const put = coins * putPrice(atTarget);
  const callSpread = partialRatio * coins * (callPrice(atTarget) - callPrice(atKnockout));
  const digital = digitalCallPrice(atKnockout);
  const clawback = partialRatio * coins * (knockout - target) * digital;
  const reward = principal * y * digital;

  const withoutReward = principal * discount - put + callSpread - clawback;
  const presentValue = withoutReward + reward;

  const pAboveTarget = probabilityAbove(atTarget);
  const pAboveKnockout = probabilityAbove(atKnockout);
  const fair =
    pAboveKnockout >= MIN_KNOCKOUT_PROBABILITY
      ? (principal - withoutReward) / (principal * digital)
      : Number.NaN;

  return finish(
    market,
    principal,
    presentValue,
    y,
    fair,
    [
      {
        key: "interest",
        label: "資金鎖住、少賺的利息",
        value: -(principal - principal * discount),
      },
      { key: "reward", label: "敲出才發的獎勵", value: reward },
      { key: "put", label: "賣出的賣權（跌破目標價全額接盤）", value: -put },
      { key: "spread", label: "中間區間的折價（買權價差）", value: callSpread },
      { key: "clawback", label: "敲出時收回的折價", value: -clawback },
    ],
    [
      { key: "full", probability: 1 - pAboveTarget },
      { key: "partial", probability: pAboveTarget - pAboveKnockout },
      { key: "knockout", probability: pAboveKnockout },
    ],
  );
}

export function valueProduct(market: MarketParams, product: ProductParams): Valuation {
  if (product.mode === "buyLow") return valueBuyLow(market, product.params);
  if (product.mode === "sellHigh") return valueSellHigh(market, product.params);
  return valueDiscountBuy(market, product.params);
}

// ── IV 敏感度 ────────────────────────────────────────────────

export interface VolatilityPoint {
  volatility: number;
  fairApr: number;
  markupRatio: number;
}

/** 在一段波动率区间上取样「合理 APR」与抽成，给 IV 敏感度图用。 */
export function volatilityCurve(
  market: MarketParams,
  product: ProductParams,
  from: number,
  to: number,
  steps: number,
): VolatilityPoint[] {
  const points: VolatilityPoint[] = [];
  for (let index = 0; index <= steps; index++) {
    const volatility = from + ((to - from) * index) / steps;
    const valuation = valueProduct({ ...market, volatility }, product);
    points.push({ volatility, fairApr: valuation.fairApr, markupRatio: valuation.markupRatio });
  }
  return points;
}

/**
 * 交易所给的 APR「隐含」的所有波动率：抽成刚好为 0 的 IV，由小到大。
 *
 * 低买与高卖的抽成随 IV 单调递增，只会有一个根；折价买币含买权价差与数位选择权，
 * 价差对 IV 不保证单调，实际扫得出两个根（例如 APR 很低、敲出价贴近目标价时）。
 * 所以先在 1%–300% 粗扫找出所有变号区间、再逐一二分，全部回传，让介面自己决定
 * 怎么讲，而不是默默挑一个当唯一答案。整段都没有变号就回空阵列。
 */
export function breakEvenVolatilities(market: MarketParams, product: ProductParams): number[] {
  const markupAt = (volatility: number) => valueProduct({ ...market, volatility }, product).markup;
  const low = 0.01;
  const high = 3;
  const steps = 299;

  const roots: number[] = [];
  let previousVol = low;
  let previousMarkup = markupAt(low);
  for (let index = 1; index <= steps; index++) {
    const volatility = low + ((high - low) * index) / steps;
    const markup = markupAt(volatility);
    if (previousMarkup === 0) roots.push(previousVol);
    else if (Math.sign(markup) !== Math.sign(previousMarkup)) {
      let a = previousVol;
      let b = volatility;
      let fa = previousMarkup;
      for (let iteration = 0; iteration < 60; iteration++) {
        const mid = (a + b) / 2;
        const fm = markupAt(mid);
        if (Math.sign(fm) === Math.sign(fa)) {
          a = mid;
          fa = fm;
        } else {
          b = mid;
        }
      }
      roots.push((a + b) / 2);
    }
    previousVol = volatility;
    previousMarkup = markup;
  }

  return roots;
}

/**
 * 最接近目前 IV 的那个隐含 IV；没有根时回 null。
 *
 * 只给图上标点与单一数字用。有多个根时，介面要另外用 breakEvenVolatilities 讲清楚。
 */
export function breakEvenVolatility(market: MarketParams, product: ProductParams): number | null {
  const roots = breakEvenVolatilities(market, product);
  if (roots.length === 0) return null;
  return roots.reduce((best, root) =>
    Math.abs(root - market.volatility) < Math.abs(best - market.volatility) ? root : best,
  );
}
