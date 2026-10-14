/**
 * 双币理财计算机的表单状态：预设值、夹紧规则，以及 localStorage 的读写。
 *
 * 比照转蛋计算机的 state.ts：normalizeState 是唯一的入口，存档、手改过的 blob、
 * 旧版栏位都先过它，元件永远拿到合法状态。栏位用「百分比」存（使用者看到的就是
 * 百分比），交给定价函式之前才换成小数。
 *
 * 三种产品各自保留一组条款：切换模式再切回来，原本填的数字还在。
 */

import type { ProductMode, ProductParams, MarketParams } from "./products";

/** 改栏位意义时一定要加版本号，理由同转蛋计算机。 */
const STORAGE_VERSION = 1;
const STORAGE_KEY = "dual-investment-calculator";

/** 价格与金额的上限：再大的数字在这个场景都没有意义，只会让乘积失真。 */
export const MAX_PRICE = 1e9;
export const MAX_AMOUNT = 1e9;
/** 一小时。再短的产品不存在，而 T → 0 时公式会退化成内含价值。 */
export const MIN_DAYS = 1 / 24;
export const MAX_DAYS = 365;
export const MIN_VOL_PERCENT = 1;
export const MAX_VOL_PERCENT = 300;
export const MAX_RATE_PERCENT = 50;
export const MAX_APR_PERCENT = 1000;

export const PRODUCT_MODES: readonly ProductMode[] = ["buyLow", "sellHigh", "discountBuy"];

export interface BuyLowState {
  strike: number;
  aprPercent: number;
  principal: number;
}

export interface SellHighState {
  strike: number;
  aprPercent: number;
  amount: number;
}

export interface DiscountBuyState {
  target: number;
  knockout: number;
  aprPercent: number;
  principal: number;
  partialPercent: number;
}

export interface DualInvestState {
  mode: ProductMode;
  spot: number;
  days: number;
  volatilityPercent: number;
  /** 这笔钱放别处的年利率，同时当机会成本与定价利率。 */
  ratePercent: number;
  buyLow: BuyLowState;
  sellHigh: SellHighState;
  discountBuy: DiscountBuyState;
}

/**
 * 预设值取整数好算的情境：现价 10 万、7 天、IV 45%。
 *
 * IV 45% 是 BTC 一周期选择权常见的水准；APR 刻意给得比合理值低，打开页面第一眼
 * 就看得到「交易所有抽成」这件事，而不是一个刚好是 0 的无聊答案。
 *
 * 利率 5% 是文章 IV 对照表用的数字，改了要连文章一起重算。
 */
export const DEFAULT_STATE: DualInvestState = {
  mode: "discountBuy",
  spot: 100_000,
  days: 7,
  volatilityPercent: 45,
  ratePercent: 5,
  buyLow: { strike: 95_000, aprPercent: 25, principal: 10_000 },
  sellHigh: { strike: 105_000, aprPercent: 20, amount: 0.1 },
  discountBuy: {
    target: 95_000,
    knockout: 98_000,
    aprPercent: 30,
    principal: 10_000,
    partialPercent: 50,
  },
};

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function record(input: unknown): Partial<Record<string, unknown>> {
  return typeof input === "object" && input !== null ? input : {};
}

/** 价格必须是正数：0 会让 Q = P / K 除以零。 */
const MIN_PRICE = 0.0001;

export function normalizeState(input: unknown): DualInvestState {
  const raw = record(input);
  const fallback = DEFAULT_STATE;
  const rawBuyLow = record(raw.buyLow);
  const rawSellHigh = record(raw.sellHigh);
  const rawDiscount = record(raw.discountBuy);

  const target = clamp(rawDiscount.target, MIN_PRICE, MAX_PRICE, fallback.discountBuy.target);

  return {
    mode: PRODUCT_MODES.find((mode) => mode === raw.mode) ?? fallback.mode,
    spot: clamp(raw.spot, MIN_PRICE, MAX_PRICE, fallback.spot),
    days: clamp(raw.days, MIN_DAYS, MAX_DAYS, fallback.days),
    volatilityPercent: clamp(
      raw.volatilityPercent,
      MIN_VOL_PERCENT,
      MAX_VOL_PERCENT,
      fallback.volatilityPercent,
    ),
    ratePercent: clamp(raw.ratePercent, 0, MAX_RATE_PERCENT, fallback.ratePercent),
    buyLow: {
      strike: clamp(rawBuyLow.strike, MIN_PRICE, MAX_PRICE, fallback.buyLow.strike),
      aprPercent: clamp(rawBuyLow.aprPercent, 0, MAX_APR_PERCENT, fallback.buyLow.aprPercent),
      principal: clamp(rawBuyLow.principal, 0, MAX_AMOUNT, fallback.buyLow.principal),
    },
    sellHigh: {
      strike: clamp(rawSellHigh.strike, MIN_PRICE, MAX_PRICE, fallback.sellHigh.strike),
      aprPercent: clamp(rawSellHigh.aprPercent, 0, MAX_APR_PERCENT, fallback.sellHigh.aprPercent),
      amount: clamp(rawSellHigh.amount, 0, MAX_AMOUNT, fallback.sellHigh.amount),
    },
    discountBuy: {
      target,
      // 敲出价必须 ≥ 目标价，否则「中间区间」不存在，拆解式也不成立。
      knockout: clamp(
        rawDiscount.knockout,
        target,
        MAX_PRICE,
        Math.max(target, fallback.discountBuy.knockout),
      ),
      aprPercent: clamp(
        rawDiscount.aprPercent,
        0,
        MAX_APR_PERCENT,
        fallback.discountBuy.aprPercent,
      ),
      principal: clamp(rawDiscount.principal, 0, MAX_AMOUNT, fallback.discountBuy.principal),
      partialPercent: clamp(
        rawDiscount.partialPercent,
        0,
        100,
        fallback.discountBuy.partialPercent,
      ),
    },
  };
}

/** 深拷贝；来源是 Solid store 时逐层读取，effect 才追踪得到巢状栏位。 */
export function cloneState(state: DualInvestState): DualInvestState {
  return {
    mode: state.mode,
    spot: state.spot,
    days: state.days,
    volatilityPercent: state.volatilityPercent,
    ratePercent: state.ratePercent,
    buyLow: { ...state.buyLow },
    sellHigh: { ...state.sellHigh },
    discountBuy: { ...state.discountBuy },
  };
}

/** 把表单状态换成定价函式要的市场参数（百分比 → 小数）。 */
export function marketOf(state: DualInvestState): MarketParams {
  return {
    spot: state.spot,
    days: state.days,
    volatility: state.volatilityPercent / 100,
    rate: state.ratePercent / 100,
  };
}

/** 把目前模式的条款换成定价函式要的参数。 */
export function productOf(state: DualInvestState): ProductParams {
  if (state.mode === "buyLow") {
    return {
      mode: "buyLow",
      params: {
        strike: state.buyLow.strike,
        apr: state.buyLow.aprPercent / 100,
        principal: state.buyLow.principal,
      },
    };
  }
  if (state.mode === "sellHigh") {
    return {
      mode: "sellHigh",
      params: {
        strike: state.sellHigh.strike,
        apr: state.sellHigh.aprPercent / 100,
        amount: state.sellHigh.amount,
      },
    };
  }
  return {
    mode: "discountBuy",
    params: {
      target: state.discountBuy.target,
      knockout: state.discountBuy.knockout,
      apr: state.discountBuy.aprPercent / 100,
      principal: state.discountBuy.principal,
      partialRatio: state.discountBuy.partialPercent / 100,
    },
  };
}

export function loadState(): DualInvestState | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const envelope = record(JSON.parse(raw));
    if (envelope.v !== STORAGE_VERSION) return null;
    return normalizeState(envelope.state);
  } catch {
    // 无痕模式与封锁网站资料的浏览器会在存取当下就丢例外。
    return null;
  }
}

export function saveState(state: DualInvestState): void {
  try {
    globalThis.localStorage?.setItem(
      STORAGE_KEY,
      JSON.stringify({ v: STORAGE_VERSION, state: normalizeState(state) }),
    );
  } catch {
    /* noop */
  }
}

export function clearState(): void {
  try {
    globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}
