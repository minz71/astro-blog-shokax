import { For, Show, createEffect, createMemo, createSignal, onCleanup, untrack } from "solid-js";
import type { JSX } from "solid-js";
import { createStore, produce } from "solid-js/store";

import {
  MAX_TRIALS,
  atLeastOnce,
  binomialPmf,
  distributionAroundMode,
  trialsForConfidence,
} from "@/toolkit/gacha/binomial";
import type { DistributionBar } from "@/toolkit/gacha/binomial";
import { calculateExpectation } from "@/toolkit/gacha/expectation";
import {
  formatCount,
  formatDecimal,
  formatMoney,
  formatProbability,
  formatRatio,
} from "@/toolkit/gacha/format";
import { PRIZE_JSON_PROMPT, parsePrizeImport, serializePrizes } from "@/toolkit/gacha/prizeJson";
import {
  DEFAULT_STATE,
  MAX_AMOUNT,
  MAX_PRIZES,
  MIN_PROBABILITY_PERCENT,
  clearState,
  clonePrize,
  cloneState,
  createPrize,
  loadState,
  saveState,
} from "@/toolkit/gacha/state";
import type { DistColumns, GachaState } from "@/toolkit/gacha/state";

/** 分布表固定给 13 列：够看出形状与累积的走势，又不会在 n 很大时把 DOM 塞爆。 */
const DISTRIBUTION_ROWS = 13;

interface DistColumnSpec {
  key: keyof DistColumns;
  label: string;
  hint: string;
  pick: (row: DistributionBar) => number;
}

/** 分布表可以勾选的三个机率栏位，顺序就是表格里由左到右的顺序。 */
const DIST_COLUMNS: readonly DistColumnSpec[] = [
  { key: "pmf", label: "P(X = k)", hint: "恰好", pick: (row) => row.probability },
  { key: "atMost", label: "P(X ≤ k)", hint: "最多", pick: (row) => row.atMost },
  { key: "atLeast", label: "P(X ≥ k)", hint: "至少", pick: (row) => row.atLeast },
];

/**
 * 复制到剪贴簿。
 *
 * 先走非同步的 Clipboard API，失败再退回 execCommand。后者虽然已经标为 deprecated，
 * 但前者在非安全内容、或使用者拒绝权限时会直接丢例外，那时唯一还能用的就是它。
 * 两条路都不通就回 false，让呼叫端老实告诉使用者复制失败。
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* 往下试 execCommand */
  }

  try {
    const scratch = document.createElement("textarea");
    scratch.value = text;
    // 放在画面外而不是 display:none：隐藏的元素选取不了，复制会静默失败。
    scratch.style.position = "fixed";
    scratch.style.left = "-9999px";
    document.body.append(scratch);
    scratch.select();
    const ok = document.execCommand("copy");
    scratch.remove();
    return ok;
  } catch {
    return false;
  }
}

interface GuardedNumberInput {
  ref: (element: HTMLInputElement) => void;
  onFocus: () => void;
  onInput: () => void;
  onBlur: () => void;
}

interface GuardedNumberOptions {
  value: () => number;
  min: number;
  max: number;
  integer?: boolean;
  onCommit: (value: number) => void;
}

/**
 * 会夹紧、但不会把使用者打到一半的字吃掉的数字输入。
 *
 * 关键是刻意**不用** `value={...}` 这种响应式绑定，而是自己拿 ref 写 DOM，并且
 * 「聚焦期间一律不回写」。两个理由，都是实测踩出来的：
 *
 * - 夹紧会跟输入打架：使用者要打一个小数就必然经过中间状态，若当下把值夹掉再写回
 *   input，游标会跳、已打的字会被吃掉。
 * - `type="number"` 会把打到一半的字正规化：打「0.」时 Chrome 的 `value` 已经回报
 *   `"0"`（`validity.badInput` 还是 false），照着写回去等于把使用者的小数点删掉，
 *   接下来打的每个数字都会接到整数位上，`0.05` 会变成 `50`。
 *
 * 所以聚焦期间画面完全交给浏览器，夹紧后的值只往外送去算结果；失焦时才把栏位同步
 * 成正规化后的值，让使用者看到系统实际采用的数字。
 */
function createGuardedNumberInput(options: GuardedNumberOptions): GuardedNumberInput {
  const [draft, setDraft] = createSignal(String(options.value()));
  const [focused, setFocused] = createSignal(false);
  let input: HTMLInputElement | undefined;

  // 外部改动（载入存档、按重设、汇入、trials 变小把 successes 压下来）要反映到栏位上，
  // 但绝不能在使用者正在打字时插手；读 draft 走 untrack，免得自己触发自己。
  createEffect(() => {
    const next = options.value();
    if (focused()) return;
    if (untrack(() => Number.parseFloat(draft())) !== next) setDraft(String(next));
  });

  // 唯一一处写回 DOM 的地方。也依赖 focused()，所以 blur 当下会补一次同步。
  createEffect(() => {
    const next = draft();
    if (focused() || !input) return;
    if (input.value !== next) input.value = next;
  });

  return {
    ref: (element) => {
      input = element;
    },
    onFocus: () => setFocused(true),
    onInput: () => {
      if (!input) return;
      // 「1e」「-」这类还不成数字的中间状态，value 是空字串且 badInput 为 true，
      // 记成草稿只会让 blur 时同步出一个空栏位，直接跳过。
      if (input.value === "" && input.validity.badInput) return;
      setDraft(input.value);
      const parsed = Number.parseFloat(input.value);
      if (!Number.isFinite(parsed)) return;
      const clamped = Math.min(options.max, Math.max(options.min, parsed));
      options.onCommit(options.integer === true ? Math.round(clamped) : clamped);
    },
    onBlur: () => {
      setFocused(false);
      setDraft(String(options.value()));
    },
  };
}

interface NumberFieldProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  integer?: boolean;
  suffix?: string;
  hint?: string;
  onCommit: (value: number) => void;
}

function NumberField(props: NumberFieldProps) {
  const guarded = createGuardedNumberInput({
    value: () => props.value,
    get min() {
      return props.min;
    },
    get max() {
      return props.max;
    },
    get integer() {
      return props.integer;
    },
    onCommit: (value) => props.onCommit(value),
  });

  return (
    <label class="gct-field" for={props.id}>
      <span class="gct-field-label">{props.label}</span>
      <span class="gct-field-input">
        <input
          ref={guarded.ref}
          id={props.id}
          type="number"
          inputmode="decimal"
          min={props.min}
          max={props.max}
          step={props.step}
          onFocus={guarded.onFocus}
          onInput={guarded.onInput}
          onBlur={guarded.onBlur}
        />
        <Show when={props.suffix}>
          <span class="gct-field-suffix">{props.suffix}</span>
        </Show>
      </span>
      <Show when={props.hint}>
        <span class="gct-field-hint">{props.hint}</span>
      </Show>
    </label>
  );
}

interface CompactNumberInputProps {
  label: string;
  area: "prob" | "value";
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onCommit: (value: number) => void;
}

/** 奖品表里的数字栏位：没有独立的 label 元素，靠 aria-label 与栏位内后缀辨识。 */
function CompactNumberInput(props: CompactNumberInputProps) {
  const guarded = createGuardedNumberInput({
    value: () => props.value,
    get min() {
      return props.min;
    },
    get max() {
      return props.max;
    },
    onCommit: (value) => props.onCommit(value),
  });

  return (
    <span class="gct-prize-cell" data-area={props.area}>
      <input
        ref={guarded.ref}
        type="number"
        inputmode="decimal"
        aria-label={props.label}
        min={props.min}
        max={props.max}
        step={props.step}
        onFocus={guarded.onFocus}
        onInput={guarded.onInput}
        onBlur={guarded.onBlur}
      />
      <Show when={props.suffix}>
        <span class="gct-prize-suffix">{props.suffix}</span>
      </Show>
    </span>
  );
}

interface StatProps {
  label: string;
  value: string;
  note?: string;
  tone?: "plain" | "good" | "bad";
}

function Stat(props: StatProps) {
  return (
    <div class="gct-stat" data-tone={props.tone ?? "plain"}>
      <span class="gct-stat-label">{props.label}</span>
      <strong class="gct-stat-value">{props.value}</strong>
      <Show when={props.note}>
        <span class="gct-stat-note">{props.note}</span>
      </Show>
    </div>
  );
}

interface ModalProps {
  title: string;
  ref: (element: HTMLDialogElement) => void;
  children: JSX.Element;
}

/**
 * 原生 `<dialog>` 的薄包装。
 *
 * 用原生元素而不是自己刻一层浮层：焦点陷阱、Esc 关闭、把背后的内容标成 inert，
 * 浏览器都已经做好了，自己重写只会做得更差。开合动画在 CSS 那边（@starting-style
 * 加上 allow-discrete），这里只负责「点到背景就关掉」——那一条原生没有。
 */
function Modal(props: ModalProps) {
  let dialog!: HTMLDialogElement;

  return (
    <dialog
      class="gct-modal"
      ref={(element) => {
        dialog = element;
        props.ref(element);
      }}
      onClick={(event) => {
        // 点在 dialog 元素本身＝点在 backdrop 上；点在内容上事件的 target 会是子元素。
        if (event.target === dialog) dialog.close();
      }}
    >
      <div class="gct-modal-body">
        <div class="gct-modal-head">
          <h4 class="gct-modal-title">{props.title}</h4>
          <button
            type="button"
            class="gct-icon-btn"
            aria-label="關閉"
            onClick={() => dialog.close()}
          >
            ×
          </button>
        </div>
        {props.children}
      </div>
    </dialog>
  );
}

export default function GachaCalculatorTool() {
  // client:only，所以这一行只会在浏览器跑，读存档不必等 onMount。
  const [state, setState] = createStore<GachaState>(loadState() ?? cloneState(DEFAULT_STATE));

  // cloneState 会逐一读取 store 的每个属性（含奖品列与栏位开关这两层巢状物件），
  // 因此这个 effect 依赖全部栏位，改动任何一个都会存档。只展开第一层的话，
  // 巢状物件只追踪到参照本身，列内的编辑与勾选都不会触发存档。
  createEffect(() => {
    saveState(cloneState(state));
  });

  /**
   * 机率计算的目标奖品。
   *
   * 二项分布一次只能问一个事件，所以整块机率区都只看这一列。索引再夹一次是防御性的
   * ——新增／删除／汇入与存档四条路径都已经维持 targetPrizeIndex 在范围内——但**每一
   * 处都要用同一个值**，否则画面上会同时出现两个不同的「目标」。
   */
  const targetIndex = createMemo(() =>
    Math.min(state.targetPrizeIndex, Math.max(0, state.prizes.length - 1)),
  );
  const targetName = createMemo(() => state.prizes[targetIndex()]?.name ?? "");
  const probability = createMemo(
    () => (state.prizes[targetIndex()]?.probabilityPercent ?? 0) / 100,
  );

  /** 目标次数也只能有一个来源，否则同一个画面上会出现两个不同的 k。 */
  const targetSuccesses = createMemo(() => Math.min(state.successes, state.trials));

  const headline = createMemo(() => ({
    any: atLeastOnce(state.trials, probability()),
    none: binomialPmf(state.trials, 0, probability()),
  }));

  /** 单独一颗 memo：二分搜寻比其他计算贵，不该在只改「抽取次数」时也跟着重算。 */
  const needed = createMemo(() =>
    trialsForConfidence(
      probability(),
      state.confidencePercent / 100,
      Math.max(1, targetSuccesses()),
    ),
  );

  const economics = createMemo(() =>
    calculateExpectation({
      prizes: state.prizes.map((prize) => ({
        probability: prize.probabilityPercent / 100,
        value: prize.value,
      })),
      targetIndex: targetIndex(),
      trials: state.trials,
      costPerTrial: state.costPerTrial,
    }),
  );

  const distribution = createMemo(() => {
    const rows = distributionAroundMode(state.trials, probability(), DISTRIBUTION_ROWS);
    const peak = rows.reduce((max, row) => Math.max(max, row.probability), 0);
    return { rows, peak };
  });

  /** 勾选中的栏位。表头与每一列都从这里取，两边的栏位数才不会对不上。 */
  const visibleColumns = createMemo(() =>
    DIST_COLUMNS.filter((column) => state.distColumns[column.key]),
  );

  /**
   * 宽萤幕的栏宽随勾选数量变化。由 JS 组好整串 template 而不是在 CSS 里写
   * `repeat(var(--n), …)`：一栏都不勾时 repeat(0, …) 是无效值，整条宣告会被丢掉。
   */
  const distTemplate = createMemo(() =>
    ["4.5rem", "minmax(3rem, 1fr)", ...visibleColumns().map(() => "5.75rem")].join(" "),
  );

  /**
   * 「目标要值多少才不亏」有三种截然不同的答案，不能只用一个数字带过：
   *
   * - 目标机率是 0：算不出来（分母为 0），要说「算不出来」而不是印一个 0。
   * - 门槛 ≤ 0：副产物自己就超过成本了，目标值 0 也不亏。
   * - 其余：真正的门槛，已经扣掉副产物垫的部分。
   */
  const breakEven = createMemo<{ value: string; note: string; tone: "plain" | "good" }>(() => {
    const threshold = economics().breakEvenTargetValue;
    if (!Number.isFinite(threshold)) {
      return { value: "—", note: "目標機率是 0，算不出來", tone: "plain" };
    }
    if (threshold <= 0) {
      return { value: formatMoney(0), note: "其他獎品已經填平成本", tone: "good" };
    }
    return { value: formatMoney(threshold), note: "已扣掉其他獎品墊的部分", tone: "plain" };
  });

  /** 钱的部分全是 0 时把期望值整块收起来：只想看机率的人不该被一排 0 元干扰。 */
  const hasMoney = createMemo(
    () => state.costPerTrial > 0 || state.prizes.some((prize) => prize.value > 0),
  );

  // 句子中间那个信心水准栏位也要同一套保护：99.9 的小数点同样会被 type=number 吃掉。
  const confidenceInput = createGuardedNumberInput({
    value: () => state.confidencePercent,
    min: 1,
    max: 99.99,
    onCommit: (value) => setState("confidencePercent", value),
  });

  // ── AI 填表与 JSON 汇入 ──

  const [importText, setImportText] = createSignal("");
  /** 汇入结果：成功与警告显示在奖品表下方，错误留在弹窗里让人当场改。 */
  const [notice, setNotice] = createSignal<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [importError, setImportError] = createSignal("");
  const [copied, setCopied] = createSignal<"prompt" | "json" | null>(null);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  let promptDialog: HTMLDialogElement | undefined;
  let prizeRows: HTMLDivElement | undefined;
  let importDialog: HTMLDialogElement | undefined;

  onCleanup(() => clearTimeout(copiedTimer));

  const currentJson = () =>
    serializePrizes({
      prizes: state.prizes.map(clonePrize),
      targetPrizeIndex: targetIndex(),
      costPerTrial: state.costPerTrial,
    });

  const copy = (which: "prompt" | "json") => {
    const text = which === "prompt" ? PRIZE_JSON_PROMPT : currentJson();
    void copyToClipboard(text).then((ok) => {
      if (!ok) {
        // 复制失败时把内容塞进汇入框，至少使用者还能自己选取——比只丢一句「失败」有用。
        promptDialog?.close();
        setImportText(text);
        setImportError("");
        importDialog?.showModal();
        setNotice({ tone: "warn", text: "瀏覽器不讓複製，內容已經放到匯入框裡，請自行選取。" });
        return;
      }
      setCopied(which);
      clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => setCopied(null), 1600);
    });
  };

  const applyImport = () => {
    const result = parsePrizeImport(importText());
    if (!result.ok) {
      setImportError(result.error);
      return;
    }

    const { patch, warnings } = result;
    setState(
      produce((draft) => {
        draft.prizes = patch.prizes.map(clonePrize);
        draft.targetPrizeIndex = Math.min(
          patch.targetPrizeIndex ?? 0,
          Math.max(0, draft.prizes.length - 1),
        );
        if (patch.costPerTrial !== undefined) draft.costPerTrial = patch.costPerTrial;
      }),
    );

    setImportError("");
    importDialog?.close();
    setNotice({
      tone: warnings.length > 0 ? "warn" : "ok",
      text: [`已匯入 ${patch.prizes.length} 列獎品。`, ...warnings].join(" "),
    });
  };

  const addPrize = () => {
    if (state.prizes.length >= MAX_PRIZES) return;
    setState("prizes", (prizes) => [...prizes, createPrize(prizes.length)]);
    // 列多了之后奖品表是一个有高度上限的卷动区，新列会落在可视范围外；
    // Solid 的更新是同步的，这时新列已经在 DOM 里，直接卷到底就看得到。
    const reduceMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    prizeRows?.scrollTo({
      top: prizeRows.scrollHeight,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  };

  /**
   * 删掉一列。
   *
   * 目标索引要跟着搬：删掉目标之前的列，后面每一列的索引都往前挪一格；删掉的正好是
   * 最后一列而它就是目标时也要退一格。少了这段，删一列会让「目标」无声地跳到另一个
   * 奖品上，而画面上其他数字全跟着变，使用者只会觉得工具在乱跳。
   */
  const removePrize = (index: number) => {
    if (state.prizes.length <= 1) return;
    setState(
      produce((draft) => {
        draft.prizes.splice(index, 1);
        if (draft.targetPrizeIndex > index || draft.targetPrizeIndex >= draft.prizes.length) {
          draft.targetPrizeIndex = Math.max(0, draft.targetPrizeIndex - 1);
        }
      }),
    );
  };

  const reset = () => {
    clearState();
    setState(cloneState(DEFAULT_STATE));
    setImportText("");
    setImportError("");
    setNotice(null);
  };

  return (
    <section class="gct" aria-label="轉蛋機率與期望值計算機">
      <fieldset class="gct-panel">
        <legend>獎品表</legend>
        <p class="gct-panel-note">
          一列一種獎品。機率計算只看標為「目標」的那一列（二項式分布一次只能算一個事件），
          期望值則把所有列加起來——副產物的價值就填在這裡。
        </p>

        <div class="gct-prizes">
          <div class="gct-prize-head" aria-hidden="true">
            <span data-area="target">目標</span>
            <span data-area="name">獎品</span>
            <span data-area="prob">機率</span>
            <span data-area="value">價值</span>
            <span data-area="remove" />
          </div>

          <div
            class="gct-prize-rows"
            ref={(element) => {
              prizeRows = element;
            }}
          >
            <For each={state.prizes}>
              {(prize, index) => (
                <div class="gct-prize" data-target={index() === targetIndex() ? "true" : "false"}>
                  <span class="gct-prize-cell" data-area="target">
                    <input
                      type="radio"
                      name="gct-target-prize"
                      aria-label={`把「${prize.name}」設為機率計算目標`}
                      checked={index() === targetIndex()}
                      onChange={() => setState("targetPrizeIndex", index())}
                    />
                  </span>

                  <span class="gct-prize-cell" data-area="name">
                    <input
                      type="text"
                      maxlength="16"
                      aria-label={`第 ${index() + 1} 列的獎品名稱`}
                      placeholder="獎品名稱"
                      value={prize.name}
                      onInput={(event) =>
                        setState("prizes", index(), "name", event.currentTarget.value)
                      }
                      onBlur={(event) =>
                        setState(
                          "prizes",
                          index(),
                          "name",
                          event.currentTarget.value.trim() || `獎品 ${index() + 1}`,
                        )
                      }
                    />
                  </span>

                  <CompactNumberInput
                    area="prob"
                    label={`「${prize.name}」的單抽機率，百分比`}
                    suffix="%"
                    value={prize.probabilityPercent}
                    min={MIN_PROBABILITY_PERCENT}
                    max={100}
                    step={0.1}
                    onCommit={(value) => setState("prizes", index(), "probabilityPercent", value)}
                  />

                  <CompactNumberInput
                    area="value"
                    label={`「${prize.name}」的價值`}
                    value={prize.value}
                    min={0}
                    max={MAX_AMOUNT}
                    step={1}
                    onCommit={(value) => setState("prizes", index(), "value", value)}
                  />

                  <span class="gct-prize-cell" data-area="remove">
                    <button
                      type="button"
                      class="gct-icon-btn"
                      aria-label={`刪除「${prize.name}」`}
                      disabled={state.prizes.length <= 1}
                      onClick={() => removePrize(index())}
                    >
                      ×
                    </button>
                  </span>
                </div>
              )}
            </For>
          </div>
        </div>

        <div class="gct-prize-foot">
          <div class="gct-btn-row">
            <button
              type="button"
              class="gct-btn"
              disabled={state.prizes.length >= MAX_PRIZES}
              onClick={addPrize}
            >
              ＋ 新增獎品
            </button>
            <button
              type="button"
              class="gct-btn"
              onClick={() => {
                setCopied(null);
                promptDialog?.showModal();
              }}
            >
              交給 AI 填表
            </button>
            <button
              type="button"
              class="gct-btn"
              onClick={() => {
                setImportError("");
                importDialog?.showModal();
              }}
            >
              匯入 JSON
            </button>
          </div>

          <Show
            when={economics().totalProbability <= 1}
            fallback={
              <span class="gct-warn">
                機率總和已超過 100%——同一抽不可能同時中兩列，請檢查獎品表。
              </span>
            }
          >
            <span class="gct-prize-total">
              機率總和 {formatProbability(economics().totalProbability)}
              <span class="gct-dim">
                ，什麼都沒中 {formatProbability(economics().residualProbability)}
              </span>
            </span>
          </Show>
        </div>

        <Show when={notice()}>
          {(current) => (
            <p class="gct-status gct-appear" data-tone={current().tone}>
              {current().text}
            </p>
          )}
        </Show>
      </fieldset>

      <fieldset class="gct-panel">
        <legend>抽取設定</legend>
        <div class="gct-fields">
          <NumberField
            id="gct-trials"
            label="抽取次數"
            suffix="抽"
            value={state.trials}
            min={1}
            max={MAX_TRIALS}
            step={1}
            integer
            hint={`上限 ${formatCount(MAX_TRIALS)} 抽`}
            onCommit={(value) => {
              // 次數往下調時目標次數不能留在支撐區間外，否則 P(X=k) 會直接變成 0。
              setState({ trials: value, successes: Math.min(state.successes, value) });
            }}
          />
          <NumberField
            id="gct-successes"
            label="想中幾次"
            suffix="次"
            value={state.successes}
            min={0}
            max={state.trials}
            step={1}
            integer
            hint="分布表會標出這一列"
            onCommit={(value) => setState("successes", value)}
          />
          <NumberField
            id="gct-cost"
            label="單抽成本"
            value={state.costPerTrial}
            min={0}
            max={MAX_AMOUNT}
            step={1}
            hint="留 0 就只看機率"
            onCommit={(value) => setState("costPerTrial", value)}
          />
        </div>
      </fieldset>

      <div class="gct-headline">
        <span class="gct-headline-label">
          抽 {formatCount(state.trials)} 次，至少中 1 次「{targetName()}」的機率
        </span>
        <strong class="gct-headline-value">{formatProbability(headline().any)}</strong>
        <span class="gct-headline-note">一次都沒中：{formatProbability(headline().none)}</span>
      </div>

      <div class="gct-block">
        <h3 class="gct-block-title">機率分布與累積分布</h3>
        <p class="gct-block-note">
          抽 {formatCount(state.trials)} 次會中幾次「{targetName()}」。
        </p>

        <div class="gct-dist-toggles" role="group" aria-label="分布表要顯示的欄位">
          <For each={DIST_COLUMNS}>
            {(column) => (
              <label class="gct-check">
                <input
                  type="checkbox"
                  checked={state.distColumns[column.key]}
                  onChange={(event) =>
                    setState("distColumns", column.key, event.currentTarget.checked)
                  }
                />
                <code>{column.label}</code>
                <span class="gct-dim">{column.hint}</span>
              </label>
            )}
          </For>
        </div>

        <div class="gct-dist" style={{ "--gct-dist-template": distTemplate() }}>
          <div class="gct-dist-head" aria-hidden="true">
            <span>中獎次數</span>
            <span />
            <For each={visibleColumns()}>{(column) => <span>{column.label}</span>}</For>
          </div>

          <ul class="gct-dist-rows">
            <For each={distribution().rows}>
              {(row) => (
                <li
                  class="gct-dist-row"
                  data-active={row.successes === targetSuccesses() ? "true" : "false"}
                >
                  <span class="gct-dist-key">{formatCount(row.successes)} 次</span>
                  <span class="gct-dist-track">
                    <span
                      class="gct-dist-fill"
                      style={{
                        // 以最高的那根当 100%：用绝对机率当宽度，p 很小时整排都会贴着 0。
                        width: `${
                          distribution().peak > 0
                            ? (row.probability / distribution().peak) * 100
                            : 0
                        }%`,
                      }}
                    />
                  </span>
                  <Show when={visibleColumns().length > 0}>
                    <span class="gct-dist-nums">
                      <For each={visibleColumns()}>
                        {(column) => (
                          <span
                            class={column.key === "pmf" ? "gct-dist-num" : "gct-dist-num gct-dim"}
                          >
                            <i class="gct-dist-label">{column.label}</i>
                            {formatProbability(column.pick(row))}
                          </span>
                        )}
                      </For>
                    </span>
                  </Show>
                </li>
              )}
            </For>
          </ul>
        </div>
      </div>

      <div class="gct-block">
        <h3 class="gct-block-title">要抽幾次才夠</h3>
        <div class="gct-inline">
          <span>想要有</span>
          <input
            ref={confidenceInput.ref}
            class="gct-inline-input"
            type="number"
            inputmode="decimal"
            aria-label="信心水準百分比"
            min="1"
            max="99.99"
            step="1"
            onFocus={confidenceInput.onFocus}
            onInput={confidenceInput.onInput}
            onBlur={confidenceInput.onBlur}
          />
          <span>
            % 的把握至少中 {formatCount(Math.max(1, targetSuccesses()))} 次「{targetName()}」，
          </span>
          {/* 答案接在同一句后面，不另起一行：整句读下来才是一个完整的问答。 */}
          <Show
            when={needed()}
            fallback={
              <span class="gct-answer" data-fail="true">
                在 {formatCount(MAX_TRIALS)} 抽以內達不到這個把握。
              </span>
            }
          >
            {(trials) => (
              <span class="gct-answer">
                需要 <strong>{formatCount(trials())}</strong> 抽
                <Show when={state.costPerTrial > 0}>
                  <span class="gct-answer-extra">
                    ，折合 {formatMoney(trials() * state.costPerTrial)}
                  </span>
                </Show>
              </span>
            )}
          </Show>
        </div>
      </div>

      <Show when={hasMoney()}>
        <div class="gct-block gct-appear">
          <h3 class="gct-block-title">期望值</h3>
          <p class="gct-block-note">把獎品表每一列的「機率 × 價值」加起來，再乘上抽取次數。</p>

          <ul class="gct-breakdown">
            <For each={state.prizes}>
              {(prize, index) => (
                <li class="gct-breakdown-row">
                  <span class="gct-breakdown-name">
                    {prize.name}
                    <Show when={index() === targetIndex()}>
                      <span class="gct-tag">目標</span>
                    </Show>
                  </span>
                  <span class="gct-breakdown-count">
                    期望 {formatDecimal(economics().expectedCounts[index()] ?? 0)} 個
                  </span>
                  <span class="gct-breakdown-value">
                    {formatMoney((economics().expectedCounts[index()] ?? 0) * prize.value)}
                  </span>
                </li>
              )}
            </For>
          </ul>

          <div class="gct-stats">
            <Stat
              label="投入成本"
              value={formatMoney(economics().totalCost)}
              note="這個數字是確定的，不是期望"
            />
            <Stat
              label="期望獲得價值"
              value={formatMoney(economics().expectedGross)}
              note={`每抽 ${formatMoney(economics().valuePerTrial)}`}
            />
            <Stat
              label="期望淨值"
              value={formatMoney(economics().expectedNet)}
              tone={economics().expectedNet >= 0 ? "good" : "bad"}
              note={`每抽 ${formatMoney(economics().netPerTrial)}`}
            />
            <Stat
              label="回收率"
              value={formatRatio(economics().recoveryRatio)}
              tone={economics().recoveryRatio >= 1 ? "good" : "bad"}
              note="期望價值 ÷ 成本"
            />
            <Stat
              label={`平均每中一個「${targetName()}」要花`}
              value={formatMoney(economics().costPerTargetItem)}
              note="成本 ÷ 目標機率"
            />
            <Stat
              label={`「${targetName()}」要值多少才不虧`}
              value={breakEven().value}
              tone={breakEven().tone}
              note={breakEven().note}
            />
          </div>
        </div>
      </Show>

      {/*
        用 div 而不是 <footer>：主题的 `.post footer::before` 会给文章里每个 footer
        补一条分隔线，跟这里自己的 border-top 叠成两条。
      */}
      <div class="gct-foot">
        <button class="gct-btn" type="button" onClick={reset}>
          清除並回到預設值
        </button>
      </div>

      <Modal
        title="交給 AI 填表的提示詞"
        ref={(element) => {
          promptDialog = element;
        }}
      >
        {/*
          中文长句一律写成字串常值：JSX 文字折行时换行会变成一个空白，
          格式化工具在中文中间断行，画面上就会多出一个怪异的空格。
        */}
        <p class="gct-modal-text">
          {"官方的機率公告通常是一大張表，手打又慢又容易抄錯。把整理的工作交給 AI："}
        </p>
        <ol class="gct-steps">
          <li>{"按下面的「複製提示詞」。"}</li>
          <li>{"把提示詞連同官方的機率公告（文字或截圖都可以）一起貼給任何一個 AI。"}</li>
          <li>
            {
              "把它回傳的內容整段複製，回到這裡按「匯入 JSON」貼上。前後的「好的，這是整理後的結果」、包住 JSON 的程式碼框都會自動剝掉，不用先清。"
            }
          </li>
        </ol>
        <div class="gct-btn-row">
          <button type="button" class="gct-btn" onClick={() => copy("prompt")}>
            {copied() === "prompt" ? "已複製 ✓" : "複製提示詞"}
          </button>
          <button type="button" class="gct-btn" onClick={() => copy("json")}>
            {copied() === "json" ? "已複製 ✓" : "複製目前的獎品表"}
          </button>
        </div>
        <p class="gct-modal-hint">
          {
            "「複製目前的獎品表」輸出的是同一份 JSON 格式：可以把現在這張表丟回去請 AI 接著改（例如補上每一列的價值），改完一樣從「匯入 JSON」貼回來。"
          }
        </p>
      </Modal>

      <Modal
        title="匯入 JSON"
        ref={(element) => {
          importDialog = element;
        }}
      >
        <p class="gct-modal-text">
          {"貼上 AI 給的 JSON，按匯入。這會"}
          <strong>整張覆蓋</strong>
          {"現在的獎品表；JSON 裡有寫目標列與單抽成本的話也會一起帶入。"}
        </p>
        <textarea
          class="gct-textarea"
          rows="8"
          spellcheck={false}
          aria-label="貼上獎品表 JSON"
          placeholder={
            '{\n  "prizes": [\n    { "name": "SSR 角色", "probabilityPercent": 0.6, "value": 3000 }\n  ],\n  "targetPrizeIndex": 0,\n  "costPerTrial": 60\n}'
          }
          value={importText()}
          onInput={(event) => {
            setImportText(event.currentTarget.value);
            setImportError("");
          }}
        />
        <Show when={importError()}>
          {(message) => (
            <p class="gct-status gct-appear" data-tone="error">
              {message()}
            </p>
          )}
        </Show>
        <div class="gct-btn-row">
          <button
            type="button"
            class="gct-btn"
            disabled={importText().trim() === ""}
            onClick={applyImport}
          >
            匯入
          </button>
        </div>
        <p class="gct-modal-hint">
          {"機率欄位只認 "}
          <code>probabilityPercent</code>
          {" 與 "}
          <code>percent</code>
          {"，不收裸的 "}
          <code>probability</code>
          {
            "：0.6 到底是 0.6% 還是 60%，只有欄位名說得清楚，猜錯會讓整頁數字差一百倍而且錯得很安靜，所以缺了就直接報錯。"
          }
        </p>
        <p class="gct-modal-hint">
          {`其他不合格的地方會修正後照收，並在獎品表下方告訴你動了什麼：機率超出 0–100 會被夾住、超過 ${MAX_PRIZES} 列會被截掉、機率總和超過 100% 會跳警告。`}
        </p>
      </Modal>
    </section>
  );
}
