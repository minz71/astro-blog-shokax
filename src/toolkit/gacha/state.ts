/**
 * 转蛋计算机的表单状态：预设值、夹紧规则，以及 localStorage 的读写。
 *
 * 会独立成一个纯模组，是因为「重新整理不该把资料打光」这件事真正的风险不在写入，
 * 而在读取：localStorage 里的东西可能是上一版的栏位、可能被手改过、也可能根本读不到
 * （无痕模式、浏览器封锁网站资料时连存取 localStorage 本身都会丢例外）。所以
 * normalizeState 是唯一的入口，任何来源的资料都要先过它，元件永远拿到一个合法状态。
 */

import { MAX_TRIALS } from "./binomial";

/**
 * 储存格式的版本号。
 *
 * 改栏位时一定要一起加。旧 blob 被新程式码读进来不会报错，只会安静地算出错的
 * 答案——那比直接重置成预设值糟糕得多。
 *
 * v1 → v2：单一 `probabilityPercent` / `itemValue` 改成 `prizes` 奖品表。刻意不写
 * 迁移：v1 只活过一个版本，而且「一个机率」要摊成「一张表」时该把哪一列当目标，
 * 猜错比重置更难发现。
 *
 * v2 → v3：拿掉 `currency`。金额不带单位，使用者填什么单位就是什么单位。
 *
 * v3 之后新增的 `distColumns` 没有加版本号：它是纯显示偏好，旧存档缺这个栏位时
 * normalizeState 会补上预设值，不会让任何计算结果出错，没必要为此把使用者的奖品表打光。
 */
const STORAGE_VERSION = 3;
const STORAGE_KEY = "gacha-binomial-calculator";

/** 奖品名称同理，超过这个长度表格就排不下了。 */
const MAX_PRIZE_NAME_LENGTH = 16;

/**
 * 奖品列数上限。
 *
 * 有些卡池会把每一个角色、每一把武器都单独列出机率，一张公告动辄几十列，所以上限
 * 要给到一百列，让整张公告不必合并就能照抄进来。上限存在的理由只剩一个：手改的
 * blob 不该能让画面长出几千列。
 */
export const MAX_PRIZES = 100;

/**
 * 机率下限，就是 0。
 *
 * 曾经设成 0.00001 来保证 `1/p` 之类的式子有定义，但那等于**默默改掉使用者填的值**：
 * 「这一层存在但我一个都没抽到 / 不在乎」是很正常的一列，从 AI 汇入时更常见，
 * 结果却会跳一个看不懂的「已夹成 0.00001」警告。
 *
 * 改成允许 0，条件是每个消费端都得自己处理：`expectedTrialsPerSuccess(0)` 与两条
 * 损益两平都回 NaN（UI 显示「—」），`trialsForConfidence` 回 null（显示「達不到」），
 * `atLeastOnce(n, 0)` 是 0，`binomialPmf(n, 0, 0)` 是 1。这些都有单元测试盯着。
 */
export const MIN_PROBABILITY_PERCENT = 0;

/**
 * 金额上限，十亿。
 *
 * 不用 Number.MAX_SAFE_INTEGER：真正该守住的是乘积——`MAX_TRIALS × MAX_AMOUNT`
 * 必须留在安全整数范围内（1e5 × 1e9 = 1e14 < 9.007e15），否则「投入成本」「期望
 * 获得价值」会印出一串看似精确、其实已经失真的数字。抽奖这个场景里单抽十亿已经
 * 够荒谬了，这条上限不会挡到任何真实用法。
 */
export const MAX_AMOUNT = 1e9;

export interface GachaPrize {
  /** 显示用的名称，纯文字。 */
  name: string;
  /** 单抽抽中这个奖品的机率，以百分比表示。 */
  probabilityPercent: number;
  /** 这个奖品对使用者的价值，与成本同单位。 */
  value: number;
}

/** 分布表要显示哪几个机率栏位。长条永远在，三个数字栏让使用者自己勾。 */
export interface DistColumns {
  /** P(X = k)：恰好 k 次。 */
  pmf: boolean;
  /** P(X ≤ k)：最多 k 次。 */
  atMost: boolean;
  /** P(X ≥ k)：至少 k 次。 */
  atLeast: boolean;
}

export interface GachaState {
  /** 奖品表。同一抽里各列互斥，所以机率总和应该 ≤ 100%（超过只警告，不强制）。 */
  prizes: GachaPrize[];
  /**
   * 机率计算的目标是哪一列。
   *
   * 二项分布一次只能问一个事件，所以整个机率区块（恰好／至少／至多、分布图、要抽
   * 几次才够）都只看这一列；期望值那边才会把所有列加起来。
   */
  targetPrizeIndex: number;
  /** 抽取次数。 */
  trials: number;
  /** 想要中的次数（目标 k）。 */
  successes: number;
  /** 「想要几成把握」的信心水准，百分比。 */
  confidencePercent: number;
  /** 单次抽取的成本。 */
  costPerTrial: number;
  /** 分布表显示的机率栏位。 */
  distColumns: DistColumns;
}

/**
 * 预设摆两列而不是一列。
 *
 * 一列的话画面跟「只能填一个机率」的旧版长得一样，没有人会发现副产物可以往下加；
 * 两列一摆，表格的意思自己会说话。价值预设 0，期望值区块因此一开始是收起来的。
 */
export const DEFAULT_PRIZES: readonly GachaPrize[] = [
  { name: "SSR 角色", probabilityPercent: 0.6, value: 0 },
  { name: "SR 武器", probabilityPercent: 5.1, value: 0 },
];

export const DEFAULT_STATE: GachaState = {
  prizes: DEFAULT_PRIZES.map(clonePrize),
  targetPrizeIndex: 0,
  trials: 100,
  successes: 1,
  confidencePercent: 90,
  costPerTrial: 0,
  // 预设只开「恰好」一栏：三栏全开时整张表都是数字，长条反而看不出形状。
  distColumns: { pmf: true, atMost: false, atLeast: false },
};

/** 给「新增奖品」按钮用的空白列。 */
export function createPrize(index: number): GachaPrize {
  return { name: `獎品 ${index + 1}`, probabilityPercent: 1, value: 0 };
}

/**
 * 复制一列奖品。
 *
 * 逐栏写出而不是 `{ ...prize }`：来源可能是 Solid 的 store proxy 或存档里的原始
 * 物件，展开会把多余的属性一起带过来；列举栏位等于顺手挡掉。
 */
export function clonePrize(prize: GachaPrize): GachaPrize {
  return {
    name: prize.name,
    probabilityPercent: prize.probabilityPercent,
    value: prize.value,
  };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  return Math.round(clampNumber(value, min, max, fallback));
}

function normalizePrize(input: unknown, index: number): GachaPrize {
  const raw =
    typeof input === "object" && input !== null
      ? (input as Partial<Record<keyof GachaPrize, unknown>>)
      : {};
  const name = typeof raw.name === "string" ? raw.name.trim().slice(0, MAX_PRIZE_NAME_LENGTH) : "";
  return {
    name: name || `獎品 ${index + 1}`,
    probabilityPercent: clampNumber(raw.probabilityPercent, MIN_PROBABILITY_PERCENT, 100, 1),
    value: clampNumber(raw.value, 0, MAX_AMOUNT, 0),
  };
}

function normalizeDistColumns(input: unknown): DistColumns {
  const fallback = DEFAULT_STATE.distColumns;
  const raw =
    typeof input === "object" && input !== null
      ? (input as Partial<Record<keyof DistColumns, unknown>>)
      : {};
  const pick = (key: keyof DistColumns) =>
    typeof raw[key] === "boolean" ? raw[key] : fallback[key];
  return { pmf: pick("pmf"), atMost: pick("atMost"), atLeast: pick("atLeast") };
}

/**
 * 把任意来源的值整理成合法状态。
 *
 * 夹紧顺序有意义：successes 的上限是 trials、targetPrizeIndex 的上限是奖品列数，
 * 所以 trials 与 prizes 必须先定案。
 */
export function normalizeState(input: unknown): GachaState {
  if (typeof input !== "object" || input === null) return cloneState(DEFAULT_STATE);
  const raw = input as Partial<Record<keyof GachaState, unknown>>;

  const rawPrizes = Array.isArray(raw.prizes) ? raw.prizes.slice(0, MAX_PRIZES) : [];
  // 空阵列也要退回预设：一张零列的奖品表没有目标可选，整个机率区块会没东西可算。
  const prizes =
    rawPrizes.length > 0
      ? rawPrizes.map((prize, index) => normalizePrize(prize, index))
      : DEFAULT_PRIZES.map(clonePrize);

  const trials = clampInteger(raw.trials, 1, MAX_TRIALS, DEFAULT_STATE.trials);

  return {
    prizes,
    targetPrizeIndex: clampInteger(raw.targetPrizeIndex, 0, prizes.length - 1, 0),
    trials,
    successes: clampInteger(raw.successes, 0, trials, DEFAULT_STATE.successes),
    // 100% 把握需要无限多抽，99.99% 已经是这类工具讲得出意义的边界。
    confidencePercent: clampNumber(
      raw.confidencePercent,
      1,
      99.99,
      DEFAULT_STATE.confidencePercent,
    ),
    costPerTrial: clampNumber(raw.costPerTrial, 0, MAX_AMOUNT, DEFAULT_STATE.costPerTrial),
    distColumns: normalizeDistColumns(raw.distColumns),
  };
}

/**
 * 深拷贝一份状态。奖品与栏位设定都是物件，浅拷贝会让预设值被使用者的编辑污染。
 *
 * 也给元件存档用：来源是 Solid store 时，逐层读取才会让 effect 追踪到巢状栏位。
 */
export function cloneState(state: GachaState): GachaState {
  return {
    ...state,
    prizes: state.prizes.map(clonePrize),
    distColumns: {
      pmf: state.distColumns.pmf,
      atMost: state.distColumns.atMost,
      atLeast: state.distColumns.atLeast,
    },
  };
}

/**
 * 从 localStorage 读回状态；读不到、版本不符、或格式不对都回传 null。
 *
 * 回 null 而不是回预设值，是要让呼叫端能区分「没存过」与「存过但不能用」——
 * 虽然两者目前的处理相同，但日后想提示使用者时不必再改这里的签章。
 */
export function loadState(): GachaState | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const envelope = parsed as { v?: unknown; state?: unknown };
    if (envelope.v !== STORAGE_VERSION) return null;
    return normalizeState(envelope.state);
  } catch {
    // 无痕模式与封锁网站资料的浏览器会在存取当下就丢例外，不是只回 null。
    return null;
  }
}

/** 写回 localStorage。写不进去（配额、无痕模式）就安静放弃，计算本身不受影响。 */
export function saveState(state: GachaState): void {
  try {
    globalThis.localStorage?.setItem(
      STORAGE_KEY,
      JSON.stringify({ v: STORAGE_VERSION, state: normalizeState(state) }),
    );
  } catch {
    /* noop */
  }
}

/** 清掉存档，给「重设」按钮用。 */
export function clearState(): void {
  try {
    globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}
