import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  onCleanup,
  onMount,
  untrack,
} from "solid-js";
import { createStore } from "solid-js/store";

import { nearestIndex, niceTicks, sampleWithBreakpoints } from "@/toolkit/dualInvest/chart";
import {
  formatCoins,
  formatCompactPrice,
  formatPercent,
  formatPrice,
  formatSignedUsd,
  formatUsd,
} from "@/toolkit/dualInvest/format";
import {
  benchmarkAt,
  breakEvenVolatilities,
  knockoutJump,
  payoffAt,
  periodYieldOf,
  valueProduct,
  volatilityCurve,
} from "@/toolkit/dualInvest/products";
import type { ProductMode } from "@/toolkit/dualInvest/products";
import {
  DEFAULT_STATE,
  MAX_AMOUNT,
  MAX_APR_PERCENT,
  MAX_DAYS,
  MAX_PRICE,
  MAX_RATE_PERCENT,
  MAX_VOL_PERCENT,
  MIN_DAYS,
  MIN_VOL_PERCENT,
  clearState,
  cloneState,
  loadState,
  marketOf,
  productOf,
  saveState,
} from "@/toolkit/dualInvest/state";
import type { DualInvestState } from "@/toolkit/dualInvest/state";

interface ModeSpec {
  mode: ProductMode;
  title: string;
  note: string;
}

const MODES: readonly ModeSpec[] = [
  { mode: "discountBuy", title: "幣安折價買幣", note: "全買、買一半、拿獎勵三段式" },
  { mode: "buyLow", title: "雙幣・低買", note: "投入 USDT，等於賣出賣權" },
  { mode: "sellHigh", title: "雙幣・高賣", note: "投入幣，等於賣出買權" },
];

// ── 数字输入 ─────────────────────────────────────────────────

interface GuardedNumberOptions {
  value: () => number;
  min: number;
  max: number;
  onCommit: (value: number) => void;
}

/**
 * 会夹紧、但不会把使用者打到一半的字吃掉的数字输入。
 *
 * 做法与转蛋计算机的同名函式相同（理由写在那边）：聚焦期间画面完全交给浏览器，
 * 夹紧后的值只往外送去算结果；失焦时才把栏位同步成系统实际采用的数字。
 */
function createGuardedNumberInput(options: GuardedNumberOptions) {
  const [draft, setDraft] = createSignal(String(options.value()));
  const [focused, setFocused] = createSignal(false);
  let input: HTMLInputElement | undefined;

  createEffect(() => {
    const next = options.value();
    if (focused()) return;
    if (untrack(() => Number.parseFloat(draft())) !== next) setDraft(String(next));
  });

  createEffect(() => {
    const next = draft();
    if (focused() || !input) return;
    if (input.value !== next) input.value = next;
  });

  return {
    ref: (element: HTMLInputElement) => {
      input = element;
    },
    onFocus: () => setFocused(true),
    onInput: () => {
      if (!input) return;
      if (input.value === "" && input.validity.badInput) return;
      setDraft(input.value);
      const parsed = Number.parseFloat(input.value);
      if (!Number.isFinite(parsed)) return;
      options.onCommit(Math.min(options.max, Math.max(options.min, parsed)));
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
    onCommit: (value) => props.onCommit(value),
  });

  return (
    <label class="dit-field" for={props.id}>
      <span class="dit-field-label">{props.label}</span>
      <span class="dit-field-input">
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
          <span class="dit-field-suffix">{props.suffix}</span>
        </Show>
      </span>
      <Show when={props.hint}>
        <span class="dit-field-hint">{props.hint}</span>
      </Show>
    </label>
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
    <div class="dit-stat" data-tone={props.tone ?? "plain"}>
      <span class="dit-stat-label">{props.label}</span>
      <strong class="dit-stat-value">{props.value}</strong>
      <Show when={props.note}>
        <span class="dit-stat-note">{props.note}</span>
      </Show>
    </div>
  );
}

// ── 折线图 ───────────────────────────────────────────────────

interface ChartSeries {
  key: string;
  label: string;
  values: number[];
  /** primary 是主角（主色实线），reference 是对照组（灰色虚线）。 */
  style: "primary" | "reference";
}

interface ChartMarker {
  x: number;
  label: string;
}

interface ChartDot {
  x: number;
  y: number;
  label: string;
  /** 两个点靠得很近时，一个标在上方、一个标在下方，标签才不会叠在一起。 */
  placement?: "above" | "below";
}

interface TooltipRow {
  label: string;
  value: string;
  style?: "primary" | "reference";
}

interface LineChartProps {
  ariaLabel: string;
  xs: number[];
  series: ChartSeries[];
  formatX: (value: number) => string;
  formatY: (value: number) => string;
  markers?: ChartMarker[];
  dots?: ChartDot[];
  tooltipTitle: (index: number) => string;
  tooltipRows: (index: number) => TooltipRow[];
  /**
   * y 轴最多画到哪里。超出的部分会被裁掉，而不是把整条轴撑开。
   *
   * 合理 APR 在边界附近会冲到很大的数字；y 轴若照资料的极值去缩放，真正要看的那一段
   * （两条线的交点附近）就会被压成贴在 0 上的一条直线。
   */
  yLimit?: readonly [number, number];
  /**
   * 顶端额外留白，占资料范围的比例。点标在资料最高处时，标签会跟顶端参考线的标签
   * 抢同一块位置，留白把它们隔开。
   */
  headroom?: number;
}

const CHART_HEIGHT = 240;

const markerKey = (marker: ChartMarker) => `${marker.label}@${marker.x}`;
const MARGIN = { top: 18, right: 14, bottom: 30, left: 62 };

/**
 * 只为这颗工具写的小折线图。
 *
 * 不引入图表库：两张图加起来不到十条线，一个库的体积比整颗工具还大。宽度用
 * ResizeObserver 量出实际像素再当 viewBox，文字才会固定在 11px，而不是在手机上
 * 跟着整张图缩成看不见的大小。
 *
 * 互动照 dataviz 的规则：十字线吸附到最近的 x、一个提示框列出所有序列；键盘可以
 * 用左右键移动，所以图本身可以聚焦。
 */
function LineChart(props: LineChartProps) {
  const [width, setWidth] = createSignal(640);
  const [hover, setHover] = createSignal<number | null>(null);
  let wrapper: HTMLDivElement | undefined;

  onMount(() => {
    if (!wrapper) return;
    setWidth(wrapper.clientWidth || 640);
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (next) setWidth(next);
    });
    observer.observe(wrapper);
    onCleanup(() => observer.disconnect());
  });

  const xDomain = createMemo(() => [props.xs[0] ?? 0, props.xs.at(-1) ?? 1] as const);

  const yDomain = createMemo(() => {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const series of props.series) {
      for (const value of series.values) {
        if (!Number.isFinite(value)) continue;
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
    }
    for (const dot of props.dots ?? []) {
      if (!Number.isFinite(dot.y)) continue;
      min = Math.min(min, dot.y);
      max = Math.max(max, dot.y);
    }
    if (!Number.isFinite(min)) return [0, 1] as const;
    if (props.yLimit) {
      min = Math.max(min, props.yLimit[0]);
      max = Math.min(max, props.yLimit[1]);
      if (max < min) [min, max] = [props.yLimit[0], props.yLimit[1]];
    }
    const span = max - min || Math.abs(max) || 1;
    return [min - span * 0.08, max + span * (0.08 + (props.headroom ?? 0))] as const;
  });

  const clipId = `dit-clip-${createUniqueId()}`;

  const plotWidth = () => Math.max(10, width() - MARGIN.left - MARGIN.right);
  const plotHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;

  const scaleX = (value: number) => {
    const [from, to] = xDomain();
    return MARGIN.left + ((value - from) / (to - from || 1)) * plotWidth();
  };
  const scaleY = (value: number) => {
    const [from, to] = yDomain();
    return MARGIN.top + (1 - (value - from) / (to - from || 1)) * plotHeight;
  };

  const xTicks = createMemo(() =>
    niceTicks(xDomain()[0], xDomain()[1], Math.max(3, Math.floor(plotWidth() / 90))),
  );
  const yTicks = createMemo(() => niceTicks(yDomain()[0], yDomain()[1], 4));

  /**
   * 垂直参考线的标签排在第几行。
   *
   * 用「标签 + 位置」当键而不是物件本身：父元件每次读 markers 都会组一个新阵列，
   * 物件参照对不上。
   *
   * 现价、目标价、敲出价常常只差几个百分点，标签全放同一行会叠成一团。依 x 排序后，
   * 跟前一个靠得太近就往下挪一行；离得够远就回到第一行。
   */
  const markerRows = createMemo(() => {
    const rows = new Map<string, number>();
    const visible = (props.markers ?? [])
      .filter((marker) => marker.x >= xDomain()[0] && marker.x <= xDomain()[1])
      .toSorted((a, b) => a.x - b.x);
    let previousX = Number.NEGATIVE_INFINITY;
    let previousRow = -1;
    for (const marker of visible) {
      const x = scaleX(marker.x);
      const row = x - previousX < 52 ? previousRow + 1 : 0;
      rows.set(markerKey(marker), row);
      previousX = x;
      previousRow = row;
    }
    return rows;
  });

  const pathOf = (values: number[]) => {
    let path = "";
    let pen = false;
    props.xs.forEach((x, index) => {
      const y = values[index];
      if (y === undefined || !Number.isFinite(y)) {
        pen = false;
        return;
      }
      path += `${pen ? "L" : "M"}${scaleX(x).toFixed(1)},${scaleY(y).toFixed(1)}`;
      pen = true;
    });
    return path;
  };

  const pointerToIndex = (event: PointerEvent) => {
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    const [from, to] = xDomain();
    const ratio = (event.clientX - rect.left - MARGIN.left) / plotWidth();
    setHover(nearestIndex(props.xs, from + Math.min(1, Math.max(0, ratio)) * (to - from)));
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const last = props.xs.length - 1;
    const current = hover() ?? Math.round(last / 2);
    const jump = Math.max(1, Math.round(props.xs.length / 40));
    if (event.key === "ArrowRight") setHover(Math.min(last, current + jump));
    else if (event.key === "ArrowLeft") setHover(Math.max(0, current - jump));
    else if (event.key === "Escape") setHover(null);
    else return;
    event.preventDefault();
  };

  const tooltipLeft = createMemo(() => {
    const index = hover();
    if (index === null) return null;
    const x = scaleX(props.xs[index] ?? 0);
    return { x, flip: x > width() / 2 };
  });

  return (
    <div
      class="dit-chart"
      ref={(element) => {
        wrapper = element;
      }}
      tabindex="0"
      role="img"
      aria-label={props.ariaLabel}
      onPointerMove={pointerToIndex}
      onPointerDown={pointerToIndex}
      onPointerLeave={() => setHover(null)}
      onKeyDown={onKeyDown}
      onBlur={() => setHover(null)}
    >
      <svg
        width={width()}
        height={CHART_HEIGHT}
        viewBox={`0 0 ${width()} ${CHART_HEIGHT}`}
        aria-hidden="true"
      >
        <For each={yTicks()}>
          {(tick) => (
            <g>
              <line
                class="dit-grid"
                x1={MARGIN.left}
                x2={MARGIN.left + plotWidth()}
                y1={scaleY(tick)}
                y2={scaleY(tick)}
              />
              <text
                class="dit-axis"
                x={MARGIN.left - 8}
                y={scaleY(tick)}
                text-anchor="end"
                dominant-baseline="middle"
              >
                {props.formatY(tick)}
              </text>
            </g>
          )}
        </For>
        <For each={xTicks()}>
          {(tick) => (
            <text class="dit-axis" x={scaleX(tick)} y={CHART_HEIGHT - 10} text-anchor="middle">
              {props.formatX(tick)}
            </text>
          )}
        </For>

        <For each={props.markers ?? []}>
          {(marker) => (
            <Show when={marker.x >= xDomain()[0] && marker.x <= xDomain()[1]}>
              <line
                class="dit-marker"
                x1={scaleX(marker.x)}
                x2={scaleX(marker.x)}
                y1={MARGIN.top}
                y2={MARGIN.top + plotHeight}
              />
              <text
                class="dit-marker-label"
                x={scaleX(marker.x) + 4}
                y={MARGIN.top + 2 + (markerRows().get(markerKey(marker)) ?? 0) * 13}
                dominant-baseline="hanging"
              >
                {marker.label}
              </text>
            </Show>
          )}
        </For>

        <defs>
          {/* 线条可能超出 yLimit；裁在绘图区内，多留几 px 给线宽与标记点的外环。 */}
          <clipPath id={clipId}>
            <rect
              x={MARGIN.left - 6}
              y={MARGIN.top - 6}
              width={plotWidth() + 12}
              height={plotHeight + 12}
            />
          </clipPath>
        </defs>

        <g clip-path={`url(#${clipId})`}>
          <For each={props.series}>
            {(series) => (
              <path class="dit-line" data-style={series.style} d={pathOf(series.values)} />
            )}
          </For>
        </g>

        <For each={props.dots ?? []}>
          {(dot) => (
            <Show
              when={
                Number.isFinite(dot.y) &&
                dot.x >= xDomain()[0] &&
                dot.x <= xDomain()[1] &&
                dot.y >= yDomain()[0] &&
                dot.y <= yDomain()[1]
              }
            >
              <circle class="dit-dot" cx={scaleX(dot.x)} cy={scaleY(dot.y)} r="4.5" />
              <text
                class="dit-dot-label"
                x={scaleX(dot.x)}
                y={dot.placement === "below" ? scaleY(dot.y) + 18 : scaleY(dot.y) - 10}
                text-anchor={
                  scaleX(dot.x) > width() - 90
                    ? "end"
                    : scaleX(dot.x) < MARGIN.left + 60
                      ? "start"
                      : "middle"
                }
              >
                {dot.label}
              </text>
            </Show>
          )}
        </For>

        <Show when={hover() !== null}>
          <g>
            <line
              class="dit-crosshair"
              x1={scaleX(props.xs[hover() ?? 0] ?? 0)}
              x2={scaleX(props.xs[hover() ?? 0] ?? 0)}
              y1={MARGIN.top}
              y2={MARGIN.top + plotHeight}
            />
            <For each={props.series}>
              {(series) => (
                <Show when={Number.isFinite(series.values[hover() ?? 0] ?? Number.NaN)}>
                  <circle
                    class="dit-hover-dot"
                    data-style={series.style}
                    cx={scaleX(props.xs[hover() ?? 0] ?? 0)}
                    cy={scaleY(series.values[hover() ?? 0] ?? 0)}
                    r="4"
                  />
                </Show>
              )}
            </For>
          </g>
        </Show>
      </svg>

      <Show when={hover() !== null && tooltipLeft()}>
        {(position) => (
          <div
            class="dit-tooltip"
            style={{
              left: `${position().x}px`,
              transform: position().flip ? "translateX(calc(-100% - 12px))" : "translateX(12px)",
            }}
          >
            <span class="dit-tooltip-title">{props.tooltipTitle(hover() ?? 0)}</span>
            <For each={props.tooltipRows(hover() ?? 0)}>
              {(row) => (
                <span class="dit-tooltip-row">
                  <Show when={row.style}>
                    <i class="dit-key" data-style={row.style} aria-hidden="true" />
                  </Show>
                  <strong>{row.value}</strong>
                  <span>{row.label}</span>
                </span>
              )}
            </For>
          </div>
        )}
      </Show>
    </div>
  );
}

function Legend(props: { items: { label: string; style: "primary" | "reference" }[] }) {
  return (
    <div class="dit-legend">
      <For each={props.items}>
        {(item) => (
          <span class="dit-legend-item">
            <i class="dit-key" data-style={item.style} aria-hidden="true" />
            {item.label}
          </span>
        )}
      </For>
    </div>
  );
}

// ── 主元件 ───────────────────────────────────────────────────

export default function DualInvestTool() {
  const [state, setState] = createStore<DualInvestState>(loadState() ?? cloneState(DEFAULT_STATE));

  createEffect(() => {
    saveState(cloneState(state));
  });

  const market = createMemo(() => marketOf(state));
  const product = createMemo(() => productOf(state));
  const valuation = createMemo(() => valueProduct(market(), product()));
  /** 所有隐含 IV。折价买币可能不只一个，不能默默挑一个当唯一答案。 */
  const impliedVols = createMemo(() => breakEvenVolatilities(market(), product()));
  /** 最接近你填的 IV 的那个，给单一数字与图上标点用。 */
  const impliedVol = createMemo(() => {
    const roots = impliedVols();
    if (roots.length === 0) return null;
    const current = market().volatility;
    return roots.reduce((best, root) =>
      Math.abs(root - current) < Math.abs(best - current) ? root : best,
    );
  });

  /** 投入的单位：USDT 产品是本金，高卖是币数 × 现价。 */
  const investedLabel = () => (state.mode === "sellHigh" ? "投入的幣（按現價）" : "本金");

  // ── 结算情境 ──

  const scenarios = createMemo(() => {
    const value = valuation();
    const y = periodYieldOf(product().params.apr, state.days);
    const probability = (key: string) =>
      value.scenarios.find((scenario) => scenario.key === key)?.probability ?? Number.NaN;

    if (state.mode === "buyLow") {
      const { strike, principal } = state.buyLow;
      return [
        {
          key: "converted",
          title: `結算價 < ${formatPrice(strike)}`,
          text: `本金連獎勵按 ${formatPrice(strike)} 換成 ${formatCoins((principal / strike) * (1 + y))} 顆幣，之後的漲跌都算你的。`,
          probability: probability("converted"),
        },
        {
          key: "kept",
          title: `結算價 ≥ ${formatPrice(strike)}`,
          text: `拿回 ${formatUsd(principal * (1 + y))} USDT（本金加獎勵）。`,
          probability: probability("kept"),
        },
      ];
    }
    if (state.mode === "sellHigh") {
      const { strike, amount } = state.sellHigh;
      return [
        {
          key: "converted",
          title: `結算價 > ${formatPrice(strike)}`,
          text: `幣連獎勵按 ${formatPrice(strike)} 賣掉，拿回 ${formatUsd(amount * strike * (1 + y))} USDT，之後再漲都跟你無關。`,
          probability: probability("converted"),
        },
        {
          key: "kept",
          title: `結算價 ≤ ${formatPrice(strike)}`,
          text: `拿回 ${formatCoins(amount * (1 + y))} 顆幣（本金加獎勵）。`,
          probability: probability("kept"),
        },
      ];
    }
    {
      const { target, knockout, principal, partialPercent } = state.discountBuy;
      const ratio = partialPercent / 100;
      const coins = principal / target;
      return [
        {
          key: "full",
          title: `結算價 ≤ ${formatPrice(target)}`,
          text: `全部本金按 ${formatPrice(target)} 買到 ${formatCoins(coins)} 顆幣，沒有獎勵。`,
          probability: probability("full"),
        },
        {
          key: "partial",
          title: `${formatPrice(target)} < 結算價 < ${formatPrice(knockout)}`,
          text: `${formatUsd(principal * ratio)} USDT 按 ${formatPrice(target)} 買到 ${formatCoins(coins * ratio)} 顆幣，其餘 ${formatUsd(principal * (1 - ratio))} USDT 退回，沒有獎勵。`,
          probability: probability("partial"),
        },
        {
          key: "knockout",
          title: `結算價 ≥ ${formatPrice(knockout)}`,
          text: `拿回 ${formatUsd(principal * (1 + y))} USDT（本金加獎勵）。`,
          probability: probability("knockout"),
        },
      ];
    }
  });

  // ── 到期报酬图 ──

  const strikes = createMemo(() => {
    if (state.mode === "buyLow") return [{ x: state.buyLow.strike, label: "目標價" }];
    if (state.mode === "sellHigh") return [{ x: state.sellHigh.strike, label: "目標價" }];
    return [
      { x: state.discountBuy.target, label: "目標價" },
      { x: state.discountBuy.knockout, label: "敲出價" },
    ];
  });

  const payoffChart = createMemo(() => {
    const spread = market().volatility * Math.sqrt(state.days / 365);
    const prices = [state.spot, ...strikes().map((strike) => strike.x)];
    // 取到约 ±2.5 个标准差，并保证目标价与敲出价都在图里、两侧还留一点空间。
    const from = Math.max(0, Math.min(...prices) * Math.min(0.97, Math.exp(-2.5 * spread)));
    const to = Math.max(...prices) * Math.max(1.03, Math.exp(2.5 * spread));
    const xs = sampleWithBreakpoints(
      from,
      to,
      240,
      strikes().map((strike) => strike.x),
    );
    return {
      xs,
      product: xs.map((x) => payoffAt(product(), state.days, x)),
      benchmark: xs.map((x) => benchmarkAt(product(), market(), x)),
    };
  });

  /**
   * 折价买币在敲出价前后的到期价值。敲出点可能往下跳（结算价涨过敲出价，拿回的反而
   * 变少），这是「折价买币」这个名字最容易遮住的特性，图上要直接标出来。
   */
  const knockoutStep = createMemo(() => {
    if (state.mode !== "discountBuy") return null;
    const params = product().params;
    if (!("knockout" in params)) return null;
    const knockout = Math.max(params.knockout, params.target);
    if (knockout <= params.target) return null;
    const after = payoffAt(product(), state.days, knockout);
    const jump = knockoutJump(params, state.days);
    return { knockout, before: after - jump, after, jump };
  });

  const benchmarkLabel = () => (state.mode === "sellHigh" ? "單純持幣" : "放別處生息");

  // ── IV 敏感度图 ──

  const ivChart = createMemo(() => {
    // 范围跟着你填的 IV 与隐含 IV 走：固定画到 150% 的话，合理 APR 会冲到好几百趴，
    // 真正要比较的那一段（两条线的交点附近）反而被压成贴地的一小段。
    const current = market().volatility;
    const implied = impliedVol() ?? current;
    const from = Math.max(MIN_VOL_PERCENT / 100, Math.min(current, implied) * 0.4);
    const to = Math.min(MAX_VOL_PERCENT / 100, Math.max(0.6, Math.max(current, implied) * 1.8));
    const points = volatilityCurve(market(), product(), from, to, 140);

    // y 轴以「交易所给的 APR、你填的 IV 下的合理 APR、0」三个锚点为中心，上下各留一倍
    // 的距离；更远的部分裁掉。低 IV 那一端的合理 APR 可能是 −1000% 以上，照极值缩放
    // 会让交点附近完全看不出来。
    const anchors = [0, product().params.apr, valuation().fairApr].filter(Number.isFinite);
    const low = Math.min(...anchors);
    const high = Math.max(...anchors);
    const span = Math.max(high - low, 0.3);

    return {
      xs: points.map((point) => point.volatility),
      fairApr: points.map((point) => point.fairApr),
      offered: points.map(() => product().params.apr),
      markupRatio: points.map((point) => point.markupRatio),
      yLimit: [low - span, high + span] as const,
    };
  });

  /**
   * 合理 APR 的说明文字。三种情况意思完全不同，不能只印一个数字：
   * 算不出来（几乎不会敲出）、负的（不给奖励交易所也在倒贴）、一般情况。
   */
  const fairAprNote = createMemo(() => {
    const fair = valuation().fairApr;
    if (!Number.isFinite(fair)) {
      return "這個 IV 下敲出機率不到 1%，獎勵幾乎拿不到，APR 給多少都差不多";
    }
    if (fair < 0) return "負的：在目前輸入與模型下，就算完全不給獎勵，產品價值也高於申購金額";
    return "模型下讓價差剛好為 0 的 APR";
  });

  /** 你填 60.5% 就显示 60.5%，不要四舍五入成 61% 让人以为栏位没吃进去。 */
  const ivDigits = () => (Number.isInteger(state.volatilityPercent) ? 0 : 1);

  const headlineTone = () => (valuation().markup >= 0 ? "bad" : "good");

  const reset = () => {
    clearState();
    setState(cloneState(DEFAULT_STATE));
  };

  return (
    <section class="dit" aria-label="交易所抽成計算機">
      <div class="dit-modes" role="radiogroup" aria-label="產品類型">
        <For each={MODES}>
          {(spec) => (
            <label class="dit-mode" data-active={state.mode === spec.mode ? "true" : "false"}>
              <input
                type="radio"
                name="dit-mode"
                checked={state.mode === spec.mode}
                onChange={() => setState("mode", spec.mode)}
              />
              <span class="dit-mode-title">{spec.title}</span>
              <span class="dit-mode-note">{spec.note}</span>
            </label>
          )}
        </For>
      </div>

      <fieldset class="dit-panel">
        <legend>市場</legend>
        <div class="dit-fields">
          <NumberField
            id="dit-spot"
            label="現價"
            suffix="USDT"
            value={state.spot}
            min={0.0001}
            max={MAX_PRICE}
            step={100}
            hint="申購當下的幣價"
            onCommit={(value) => setState("spot", value)}
          />
          <NumberField
            id="dit-days"
            label="天數"
            suffix="天"
            value={state.days}
            min={MIN_DAYS}
            max={MAX_DAYS}
            step={1}
            hint="到結算日還有幾天，可以有小數"
            onCommit={(value) => setState("days", value)}
          />
          <NumberField
            id="dit-vol"
            label="隱含波動率 IV"
            suffix="%"
            value={state.volatilityPercent}
            min={MIN_VOL_PERCENT}
            max={MAX_VOL_PERCENT}
            step={1}
            hint="去 Deribit 找到期日、履約價都相近的選擇權來填，見下方說明"
            onCommit={(value) => setState("volatilityPercent", value)}
          />
          <NumberField
            id="dit-rate"
            label="資金年利率"
            suffix="%"
            value={state.ratePercent}
            min={0}
            max={MAX_RATE_PERCENT}
            step={0.5}
            hint="這筆錢不買這個產品、放在別的地方（例如活期）能拿到的年利率。也拿來當定價利率，見下方說明"
            onCommit={(value) => setState("ratePercent", value)}
          />
        </div>
      </fieldset>

      <fieldset class="dit-panel">
        <legend>產品條款</legend>
        <Show when={state.mode === "buyLow"}>
          <div class="dit-fields">
            <NumberField
              id="dit-bl-strike"
              label="目標價"
              suffix="USDT"
              value={state.buyLow.strike}
              min={0.0001}
              max={MAX_PRICE}
              step={100}
              hint="跌破這個價格就換成幣"
              onCommit={(value) => setState("buyLow", "strike", value)}
            />
            <NumberField
              id="dit-bl-apr"
              label="APR"
              suffix="%"
              value={state.buyLow.aprPercent}
              min={0}
              max={MAX_APR_PERCENT}
              step={1}
              onCommit={(value) => setState("buyLow", "aprPercent", value)}
            />
            <NumberField
              id="dit-bl-principal"
              label="投入金額"
              suffix="USDT"
              value={state.buyLow.principal}
              min={0}
              max={MAX_AMOUNT}
              step={100}
              onCommit={(value) => setState("buyLow", "principal", value)}
            />
          </div>
        </Show>
        <Show when={state.mode === "sellHigh"}>
          <div class="dit-fields">
            <NumberField
              id="dit-sh-strike"
              label="目標價"
              suffix="USDT"
              value={state.sellHigh.strike}
              min={0.0001}
              max={MAX_PRICE}
              step={100}
              hint="漲破這個價格就賣成 USDT"
              onCommit={(value) => setState("sellHigh", "strike", value)}
            />
            <NumberField
              id="dit-sh-apr"
              label="APR"
              suffix="%"
              value={state.sellHigh.aprPercent}
              min={0}
              max={MAX_APR_PERCENT}
              step={1}
              onCommit={(value) => setState("sellHigh", "aprPercent", value)}
            />
            <NumberField
              id="dit-sh-amount"
              label="投入數量"
              suffix="顆"
              value={state.sellHigh.amount}
              min={0}
              max={MAX_AMOUNT}
              step={0.01}
              onCommit={(value) => setState("sellHigh", "amount", value)}
            />
          </div>
        </Show>
        <Show when={state.mode === "discountBuy"}>
          <div class="dit-fields">
            <NumberField
              id="dit-db-target"
              label="目標購買價"
              suffix="USDT"
              value={state.discountBuy.target}
              min={0.0001}
              max={MAX_PRICE}
              step={100}
              onCommit={(value) =>
                // 敲出价不能低于目标价：目标价往上调时把敲出价一起推上去。
                setState("discountBuy", {
                  target: value,
                  knockout: Math.max(value, state.discountBuy.knockout),
                })
              }
            />
            <NumberField
              id="dit-db-knockout"
              label="敲出價"
              suffix="USDT"
              value={state.discountBuy.knockout}
              min={state.discountBuy.target}
              max={MAX_PRICE}
              step={100}
              hint="不能低於目標購買價"
              onCommit={(value) => setState("discountBuy", "knockout", value)}
            />
            <NumberField
              id="dit-db-apr"
              label="APR"
              suffix="%"
              value={state.discountBuy.aprPercent}
              min={0}
              max={MAX_APR_PERCENT}
              step={1}
              hint="只有敲出才拿得到"
              onCommit={(value) => setState("discountBuy", "aprPercent", value)}
            />
            <NumberField
              id="dit-db-principal"
              label="投入金額"
              suffix="USDT"
              value={state.discountBuy.principal}
              min={0}
              max={MAX_AMOUNT}
              step={100}
              onCommit={(value) => setState("discountBuy", "principal", value)}
            />
            <NumberField
              id="dit-db-partial"
              label="中間區間買入比例"
              suffix="%"
              value={state.discountBuy.partialPercent}
              min={0}
              max={100}
              step={5}
              hint="幣安官方是 50%"
              onCommit={(value) => setState("discountBuy", "partialPercent", value)}
            />
          </div>
        </Show>
      </fieldset>

      {/* 1 : 2 : 1 三栏：价差居中当主角，两侧是公平 APR 与隐含 IV。 */}
      <div class="dit-summary">
        <Stat
          label={`IV ${formatPercent(market().volatility, ivDigits())} 下的模型公平 APR`}
          value={formatPercent(valuation().fairApr)}
          note={fairAprNote()}
        />
        <div class="dit-headline" data-tone={headlineTone()}>
          <span class="dit-headline-label">估計定價價差（本文簡稱抽成）</span>
          <strong class="dit-headline-value">{formatUsd(valuation().markup)} USDT</strong>
          <span class="dit-headline-note">
            {`佔${investedLabel()} ${formatPercent(valuation().markupRatio)}，換算年化 ${formatPercent(valuation().markupAnnualized)}`}
          </span>
        </div>
        <Stat
          label="報價隱含 IV"
          value={impliedVol() === null ? "—" : formatPercent(impliedVol()!, 1)}
          note={
            impliedVol() === null
              ? "1%–300% 之間找不到讓價差為 0 的 IV"
              : impliedVols().length > 1
                ? `這組條款有 ${impliedVols().length} 個解：${impliedVols()
                    .map((root) => formatPercent(root, 1))
                    .join(
                      "、",
                    )}。價差對 IV 不是單調的，這裡顯示最接近你填的 IV 的那個，不能當唯一答案`
                : "在這個 IV 下，交易所給的 APR 剛好等於模型公平 APR"
          }
        />
      </div>

      <div class="dit-block">
        <h3 class="dit-block-title">價值拆解</h3>
        <p class="dit-block-note">
          {`把產品拆成標準選擇權後，逐一估算每一塊的價值（對你有利為正、不利為負），加總後即得到估計價差。`}
        </p>
        <ul class="dit-legs">
          <For each={valuation().legs}>
            {(leg) => (
              <li class="dit-leg" data-sign={leg.value >= 0 ? "plus" : "minus"}>
                <span>{leg.label}</span>
                <strong>{formatSignedUsd(leg.value)}</strong>
              </li>
            )}
          </For>
          <li class="dit-leg dit-leg-total">
            <span>合計（= −估計價差）</span>
            <strong>{formatSignedUsd(-valuation().markup)}</strong>
          </li>
        </ul>
      </div>

      <div class="dit-block">
        <h3 class="dit-block-title">結算時會發生什麼</h3>
        <p class="dit-block-note">
          {
            "機率是從選擇權價格反推的「風險中性機率」，已經把市場對下跌的避險需求算進去，不是對未來的預測。"
          }
        </p>
        <ul class="dit-scenarios">
          <For each={scenarios()}>
            {(scenario) => (
              <li class="dit-scenario">
                <span class="dit-scenario-head">
                  <strong>{scenario.title}</strong>
                  <span class="dit-scenario-prob">{formatPercent(scenario.probability, 1)}</span>
                </span>
                <span class="dit-scenario-bar" aria-hidden="true">
                  <span
                    style={{ width: `${Math.max(0, Math.min(1, scenario.probability)) * 100}%` }}
                  />
                </span>
                <span class="dit-scenario-text">{scenario.text}</span>
              </li>
            )}
          </For>
        </ul>
      </div>

      <div class="dit-block">
        <h3 class="dit-block-title">到期拿回多少</h3>
        <Legend
          items={[
            { label: "這個產品", style: "primary" },
            { label: benchmarkLabel(), style: "reference" },
          ]}
        />
        <LineChart
          ariaLabel="到期報酬圖：結算價與拿回價值的關係"
          xs={payoffChart().xs}
          series={[
            { key: "product", label: "這個產品", values: payoffChart().product, style: "primary" },
            {
              key: "benchmark",
              label: benchmarkLabel(),
              values: payoffChart().benchmark,
              style: "reference",
            },
          ]}
          formatX={formatCompactPrice}
          formatY={formatPrice}
          markers={[{ x: state.spot, label: "現價" }, ...strikes()]}
          headroom={knockoutStep() ? 0.3 : 0}
          dots={(() => {
            const step = knockoutStep();
            if (!step) return [];
            // 往下跳时「敲出前」在上、「敲出后」在下；往上跳则相反，标签才不会压到线。
            const down = step.jump < 0;
            return [
              {
                x: step.knockout,
                y: step.before,
                label: `敲出前 ${formatPrice(step.before)}`,
                placement: down ? ("above" as const) : ("below" as const),
              },
              {
                x: step.knockout,
                y: step.after,
                label: `敲出後 ${formatPrice(step.after)}`,
                placement: down ? ("below" as const) : ("above" as const),
              },
            ];
          })()}
          tooltipTitle={(index) => `結算價 ${formatPrice(payoffChart().xs[index] ?? Number.NaN)}`}
          tooltipRows={(index) => {
            const productValue = payoffChart().product[index] ?? Number.NaN;
            const benchmarkValue = payoffChart().benchmark[index] ?? Number.NaN;
            return [
              { label: "這個產品", value: formatUsd(productValue), style: "primary" },
              { label: benchmarkLabel(), value: formatUsd(benchmarkValue), style: "reference" },
              {
                label: `比${benchmarkLabel()}`,
                value: formatSignedUsd(productValue - benchmarkValue),
              },
            ];
          }}
        />
      </div>

      <div class="dit-block">
        <h3 class="dit-block-title">IV 填多少，答案就差多少</h3>
        <Legend
          items={[
            { label: "公平 APR", style: "primary" },
            { label: "交易所給的 APR", style: "reference" },
          ]}
        />
        <LineChart
          ariaLabel="IV 敏感度圖：隱含波動率與模型公平 APR 的關係"
          xs={ivChart().xs}
          series={[
            { key: "fair", label: "公平 APR", values: ivChart().fairApr, style: "primary" },
            {
              key: "offered",
              label: "交易所給的 APR",
              values: ivChart().offered,
              style: "reference",
            },
          ]}
          formatX={(value) => formatPercent(value, 0)}
          formatY={(value) => formatPercent(value, 0)}
          yLimit={ivChart().yLimit}
          dots={[
            {
              x: market().volatility,
              y: valuation().fairApr,
              label: `你填的 IV ${formatPercent(market().volatility, ivDigits())}`,
            },
            ...(impliedVol() === null
              ? []
              : [
                  {
                    x: impliedVol()!,
                    y: product().params.apr,
                    label: `隱含 ${formatPercent(impliedVol()!, 1)}`,
                    placement: "below" as const,
                  },
                ]),
          ]}
          tooltipTitle={(index) => `IV ${formatPercent(ivChart().xs[index] ?? Number.NaN, 1)}`}
          tooltipRows={(index) => [
            {
              label: "公平 APR",
              value: formatPercent(ivChart().fairApr[index] ?? Number.NaN),
              style: "primary",
            },
            {
              label: "交易所給的 APR",
              value: formatPercent(product().params.apr),
              style: "reference",
            },
            {
              label: "估計價差（年化）",
              value: formatPercent(
                (ivChart().markupRatio[index] ?? Number.NaN) * (365 / state.days),
              ),
            },
          ]}
        />
      </div>

      <div class="dit-foot">
        <button class="dit-btn" type="button" onClick={reset}>
          清除並回到預設值
        </button>
      </div>
    </section>
  );
}
