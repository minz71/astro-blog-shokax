import { For, Show, createEffect, createMemo, createSignal, on, onCleanup } from "solid-js";
import { createStore, produce } from "solid-js/store";

import { formatCount, formatProbability } from "@/toolkit/gacha/format";
import {
  MAX_PULLS_PER_DRAW,
  MISS,
  clampPullCount,
  drawMany,
  effectiveRates,
  rarityTiers,
  tierOf,
} from "@/toolkit/gacha/simulate";
import type { SimTier } from "@/toolkit/gacha/simulate";
import { softStarPath } from "@/toolkit/gacha/softStar";
import type { GachaPrize } from "@/toolkit/gacha/state";

/*
 * 模拟转蛋：照奖品表的机率翻牌。
 *
 * 分工：牌的有无、正反面、名字一律由 Solid 依 store 渲染（data-state / data-tier 是
 * 唯一的样式钩子）；WAAPI 只负责 transform / filter / opacity 这些过场，跑完就交回
 * CSS 的终态。所以按「跳过」只要取消所有脚本动画、把状态设成已翻开，画面自然停在
 * 结果上——不会有「class 被重绘洗掉」或「默认隐藏等脚本来显示」的问题。
 */

type Phase = "idle" | "drawing" | "revealing" | "done";
type CardState = "dealt" | "opening" | "revealed";

interface SimCard {
  prizeIndex: number;
  tier: SimTier;
  name: string;
  state: CardState;
  /** 揭晓目标时浮到暗幕上方。 */
  focus: boolean;
}

interface GachaSimulatorProps {
  prizes: readonly GachaPrize[];
  targetIndex: number;
}

// ── 图示 ──

const STAR_PATH = softStarPath({ cx: 50, cy: 54, outer: 46, inner: 23 });
const STAR_VIEWBOX = "0 0 100 100";
const HEART_PATH =
  "M12 20.6c-.3 0-.6-.1-.8-.3C7.9 17.7 3 13.7 3 9.3 3 6.6 5.1 4.5 7.7 4.5c1.7 0 3.2.9 4.3 2.3 1.1-1.4 2.6-2.3 4.3-2.3 2.6 0 4.7 2.1 4.7 4.8 0 4.4-4.9 8.4-8.2 11-.2.2-.5.3-.8.3z";
const HEART_VIEWBOX = "2 3 20 19";
const PETAL_PATH = "M0 0C-6 -5 -9 -14 -5 -21Q-2 -24 0 -20Q2 -24 5 -21C9 -14 6 -5 0 0Z";

/** 粒子用遮罩画成星星／爱心：同一条路径，飞出来的星星才会跟牌面上的长得一样。 */
const maskUrl = (viewBox: string, path: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='${viewBox}'><path d='${path}'/></svg>`,
  )}")`;
const STAR_MASK = maskUrl(STAR_VIEWBOX, STAR_PATH);
const HEART_MASK = maskUrl(HEART_VIEWBOX, HEART_PATH);

/** 牌背上飘落的花瓣。固定位置（不在每次渲染时乱数），牌堆与每张牌才长得一样。 */
const FALLING_PETALS: ReadonlyArray<{ x: number; y: number; rotate: number }> = [
  { x: 20, y: 22, rotate: 35 },
  { x: 74, y: 18, rotate: 160 },
  { x: 84, y: 52, rotate: 250 },
  { x: 17, y: 60, rotate: 300 },
  { x: 26, y: 100, rotate: 80 },
  { x: 78, y: 96, rotate: 200 },
  { x: 60, y: 112, rotate: 20 },
];

function SakuraBack() {
  return (
    <div class="gct-sim-face gct-sim-back">
      <svg viewBox="0 0 100 140" aria-hidden="true">
        <rect class="gct-sim-ink-line" x="5" y="5" width="90" height="130" rx="6" />
        <rect
          class="gct-sim-ink-line"
          data-weight="thin"
          x="9"
          y="9"
          width="82"
          height="122"
          rx="4"
        />
        <For each={FALLING_PETALS}>
          {(petal) => (
            <path
              class="gct-sim-ink-soft"
              d={PETAL_PATH}
              transform={`translate(${petal.x} ${petal.y}) rotate(${petal.rotate}) scale(0.32)`}
            />
          )}
        </For>
        <For each={[0, 1, 2, 3, 4]}>
          {(k) => <path class="gct-sim-ink-wave" d={`M${10 + k * 16} 126a8 8 0 0 1 16 0`} />}
        </For>
        <For each={[0, 72, 144, 216, 288]}>
          {(angle) => (
            <path
              class="gct-sim-ink-fill"
              d={PETAL_PATH}
              transform={`translate(50 70) rotate(${angle}) scale(1.05)`}
            />
          )}
        </For>
        <circle class="gct-sim-ink-core" cx="50" cy="70" r="3.2" />
      </svg>
    </div>
  );
}

function CardFront(props: { tier: SimTier }) {
  return (
    <div class="gct-sim-face gct-sim-front">
      {/* 只有最稀有的两组有图示；其余奖品与没中都是素面，只靠牌下的名字区分 */}
      <Show
        when={props.tier === "star" || props.tier === "heart"}
        fallback={
          <span class="gct-sim-dash" aria-hidden="true">
            –
          </span>
        }
      >
        <svg
          class="gct-sim-icon"
          viewBox={props.tier === "star" ? STAR_VIEWBOX : HEART_VIEWBOX}
          aria-hidden="true"
        >
          <path d={props.tier === "star" ? STAR_PATH : HEART_PATH} />
        </svg>
      </Show>
    </div>
  );
}

// ── 动画小工具（只碰 transform / filter / opacity） ──

const rand = (min: number, max: number) => min + Math.random() * (max - min);

/** 由小到大的颤抖：振幅随时间增加，是「要出好东西了」的主要预告。 */
function tremble(node: HTMLElement, duration: number, maxAmp: number): void {
  const frames: Keyframe[] = [];
  const steps = 24;
  for (let k = 0; k <= steps; k += 1) {
    const amp = (k / steps) * maxAmp;
    const dir = k % 2 === 0 ? -1 : 1;
    frames.push({
      transform: `translate(${dir * amp}px, ${-amp * 0.3}px) rotate(${dir * amp * 0.6}deg)`,
    });
  }
  frames.push({ transform: "none" });
  node.animate(frames, { duration, easing: "linear" });
}

/** 翻面：内层转 180°，外层同时抬起放大一点再落回。 */
function flip(
  lift: HTMLElement,
  inner: HTMLElement,
  duration: number,
  rise: number,
  scale: number,
) {
  inner.animate([{ transform: "rotateY(0deg)" }, { transform: "rotateY(180deg)" }], {
    duration,
    easing: "cubic-bezier(0.3, 0, 0.25, 1)",
  });
  lift.animate(
    [
      { transform: "none" },
      { transform: `translateY(${-rise}px) scale(${scale})`, offset: 0.5 },
      { transform: "none" },
    ],
    { duration, easing: "ease-in-out" },
  );
}

/**
 * 沿着牌的轮廓往外发光再收回来。用 drop-shadow 而不是另画一个光圈：光贴着牌的四边，
 * 不会出现圆形的亮圈。动画结束后交还给 CSS 的常驻发光。
 */
function bloom(node: HTMLElement, color: string, peak: number, duration: number): void {
  node.animate(
    [
      { filter: `drop-shadow(0 0 0 ${color})` },
      {
        filter: `drop-shadow(0 0 ${peak}px ${color}) drop-shadow(0 0 ${peak / 3}px white)`,
        offset: 0.3,
      },
      { filter: `drop-shadow(0 0 ${peak * 0.4}px ${color})` },
    ],
    { duration, easing: "ease-out" },
  );
}

interface BurstOptions {
  x: number;
  y: number;
  count: number;
  shape: "star" | "heart" | "dot";
  colors: readonly string[];
  speed: readonly [number, number];
  up?: number;
  gravity: number;
  duration: number;
  size: readonly [number, number];
}

/**
 * 抛物线粒子。
 *
 * 粒子层（fx）只给这里用：Solid 渲染出空容器后不再碰它的子节点，这里建立的 span
 * 也只在建立时设一次 className，跑完自己移除，不会跟框架抢同一个元素。
 */
function burst(layer: HTMLElement, options: BurstOptions): void {
  const { x, y, count, shape, colors, speed, up = 0, gravity, duration, size } = options;
  for (let k = 0; k < count; k += 1) {
    const angle = rand(0, Math.PI * 2);
    const velocity = rand(speed[0], speed[1]);
    const vx = Math.cos(angle) * velocity;
    const vy = Math.sin(angle) * velocity - up;
    const width = rand(size[0], size[1]);
    const spin = rand(-540, 540);

    const particle = document.createElement("span");
    particle.className = "gct-sim-particle";
    particle.dataset.shape = shape;
    Object.assign(particle.style, {
      left: `${x}px`,
      top: `${y}px`,
      width: `${width}px`,
      height: `${width}px`,
      marginLeft: `${-width / 2}px`,
      marginTop: `${-width / 2}px`,
      background: colors[k % colors.length],
    });
    layer.append(particle);

    const seconds = duration / 1000;
    const frames: Keyframe[] = [];
    for (let s = 0; s <= 8; s += 1) {
      const t = (s / 8) * seconds;
      frames.push({
        transform: `translate(${vx * t}px, ${vy * t + 0.5 * gravity * t * t}px) rotate(${spin * (s / 8)}deg) scale(${1 - (s / 8) * 0.5})`,
        opacity: s < 6 ? 1 : 1 - (s - 5) / 3,
      });
    }
    particle
      .animate(frames, { duration: duration * rand(0.85, 1.15), easing: "linear" })
      .finished.then(
        () => particle.remove(),
        () => particle.remove(),
      );
  }
}

/** 可被一次取消的计时：跳过、重置、离开页面时全部清掉。 */
function createTimers() {
  const pending = new Set<ReturnType<typeof setTimeout>>();
  return {
    sleep(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const handle = setTimeout(() => {
          pending.delete(handle);
          resolve();
        }, ms);
        pending.add(handle);
      });
    },
    clear() {
      for (const handle of pending) clearTimeout(handle);
      pending.clear();
    },
  };
}

/** 洗牌长度。发牌动画的 delay 从这里起算，洗牌期间牌还停在牌堆里（fill: backwards）。 */
/** 累计表与摘要的排序：由稀有到常见，同机率照奖品表顺序。 */
function byRarity(a: { rate: number; index: number }, b: { rate: number; index: number }): number {
  return a.rate - b.rate || a.index - b.index;
}

const SHUFFLE_MS = 900;
const DEAL_MS = 560;

/** 牌堆三张牌的静止位置，要跟 CSS 的 .gct-sim-deck .gct-sim-face:nth-child() 一致。 */
const DECK_REST = [
  "translate(-4px, 4px) rotate(-5deg)",
  "translate(3px, 2px) rotate(4deg)",
  "none",
];
/** 洗牌时往外甩的位置。 */
const DECK_SPREAD = [
  "translate(-40px, 6px) rotate(-16deg)",
  "translate(40px, 4px) rotate(14deg)",
  "translateY(-10px) scale(1.04)",
];

export default function GachaSimulator(props: GachaSimulatorProps) {
  const [sim, setSim] = createStore<{ phase: Phase; cards: SimCard[] }>({
    phase: "idle",
    cards: [],
  });
  const [tally, setTally] = createStore<{
    pulls: number;
    counts: Record<number, number>;
    miss: number;
  }>({ pulls: 0, counts: {}, miss: 0 });

  const timers = createTimers();
  /** 每次开抽、跳过、重置都 +1；还在跑的旧时间轴醒来发现对不上就自己收手。 */
  let runId = 0;
  let stage: HTMLDivElement | undefined;
  let deck: HTMLButtonElement | undefined;
  /** 点牌堆一次抽几张。预设 1：点一下翻一张，最直觉。 */
  const [deckCount, setDeckCount] = createSignal(1);
  let dim: HTMLDivElement | undefined;
  let fx: HTMLDivElement | undefined;
  const lifts: HTMLElement[] = [];
  const inners: HTMLElement[] = [];

  const busy = () => sim.phase === "drawing" || sim.phase === "revealing";

  /** 取消舞台里所有脚本动画；CSS 动画（常驻发光、流光）留着。 */
  const cancelScriptAnimations = () => {
    for (const animation of stage?.getAnimations({ subtree: true }) ?? []) {
      if (animation instanceof CSSAnimation || animation instanceof CSSTransition) continue;
      animation.cancel();
    }
    fx?.replaceChildren();
  };

  const stop = () => {
    runId += 1;
    timers.clear();
    cancelScriptAnimations();
  };

  onCleanup(stop);

  const setCard = (index: number, state: CardState) => setSim("cards", index, "state", state);

  /** 跳过与自然结束都走这里：计数在这时才记，演出途中下面的表格不会先剧透。 */
  const finish = (natural: boolean) => {
    if (!busy()) return;
    if (natural) {
      runId += 1;
      timers.clear();
    } else {
      stop();
    }
    setTally(
      produce((draft) => {
        draft.pulls += sim.cards.length;
        for (const card of sim.cards) {
          if (card.prizeIndex === MISS) draft.miss += 1;
          else draft.counts[card.prizeIndex] = (draft.counts[card.prizeIndex] ?? 0) + 1;
        }
      }),
    );
    setSim(
      produce((draft) => {
        for (const card of draft.cards) {
          card.state = "revealed";
          card.focus = false;
        }
        draft.phase = "done";
      }),
    );
  };

  const resetAll = () => {
    stop();
    setSim({ phase: "idle", cards: [] });
    setTally({ pulls: 0, counts: {}, miss: 0 });
  };

  // 奖品表（名称、机率、目标列）一改，旧的抽取结果就对不上新的表了：中止演出、清空计数。
  // 只看会影响抽取的栏位，改「价值」不会把纪录打光。
  const signature = createMemo(() =>
    JSON.stringify([props.targetIndex, props.prizes.map((p) => [p.name, p.probabilityPercent])]),
  );
  createEffect(on(signature, resetAll, { defer: true }));

  // ── 演出 ──

  const shuffle = () => {
    const faces = deck?.querySelectorAll<HTMLElement>(".gct-sim-face") ?? [];
    faces.forEach((face, k) => {
      const base = DECK_REST[k] ?? "none";
      face.animate(
        [{ transform: base }, { transform: DECK_SPREAD[k] ?? base }, { transform: base }],
        {
          duration: 280,
          iterations: 3,
          delay: k * 40,
          easing: "ease-in-out",
        },
      );
    });
  };

  /** 弧线发牌：从牌堆飞出、中途抬高再落位。delay 含洗牌时间，期间牌停在牌堆（backwards）。 */
  const deal = (gap: number) => {
    if (!deck) return;
    const from = deck.getBoundingClientRect();
    lifts.forEach((lift, i) => {
      const to = lift.getBoundingClientRect();
      const dx = from.left + from.width / 2 - (to.left + to.width / 2);
      const dy = from.top + from.height / 2 - (to.top + to.height / 2);
      const scale = from.width / Math.max(1, to.width);
      const tilt = rand(-25, 25);
      const start = `translate(${dx}px, ${dy}px) rotate(${tilt}deg) scale(${scale})`;
      lift.animate(
        [
          { transform: start, opacity: 0 },
          { transform: start, opacity: 1, offset: 0.08 },
          {
            transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 30}px) rotate(${tilt * 0.4}deg) scale(1.08)`,
            offset: 0.6,
          },
          { transform: "translate(0, -3px) scale(1.02)", offset: 0.88 },
          { transform: "none" },
        ],
        {
          duration: DEAL_MS,
          delay: SHUFFLE_MS + i * gap,
          fill: "backwards",
          easing: "cubic-bezier(0.25, 0.7, 0.3, 1)",
        },
      );
    });
  };

  const centerOf = (node: HTMLElement) => {
    const box = stage?.getBoundingClientRect();
    const rect = node.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2 - (box?.left ?? 0),
      y: rect.top + rect.height / 2 - (box?.top ?? 0),
    };
  };

  const dimTo = (to: number, duration: number) => {
    if (!dim) return;
    const from = Number(getComputedStyle(dim).opacity);
    for (const animation of dim.getAnimations()) animation.cancel();
    dim.animate([{ opacity: from }, { opacity: to }], {
      duration,
      fill: "forwards",
      easing: "ease-out",
    });
  };

  const revealMiss = (i: number) => {
    setCard(i, "revealed");
    flip(lifts[i], inners[i], 380, 6, 1.04);
  };

  const revealHeart = async (i: number) => {
    setCard(i, "opening");
    tremble(lifts[i], 420, 2.5);
    await timers.sleep(420);
    setCard(i, "revealed");
    flip(lifts[i], inners[i], 480, 12, 1.12);
    await timers.sleep(240);
    bloom(lifts[i], "var(--gct-sim-heart)", 18, 700);
    if (fx) {
      burst(fx, {
        ...centerOf(inners[i]),
        count: 9,
        shape: "heart",
        colors: ["var(--gct-sim-heart-ink)", "var(--gct-sim-heart)", "oklch(0.95 0.03 355)"],
        speed: [70, 150],
        up: 40,
        gravity: 200,
        duration: 800,
        size: [7, 11],
      });
    }
    await timers.sleep(320);
  };

  const revealStar = async (i: number) => {
    setCard(i, "opening");
    // 这张牌浮到暗幕上面，其他牌一起暗下去，视线才会集中过来
    setSim("cards", i, "focus", true);
    dimTo(0.35, 500);
    tremble(lifts[i], 1100, 5);
    await timers.sleep(1100);
    setCard(i, "revealed");
    inners[i].animate([{ transform: "rotateY(0deg)" }, { transform: "rotateY(180deg)" }], {
      duration: 620,
      easing: "cubic-bezier(0.3, 0, 0.2, 1)",
    });
    lifts[i].animate(
      [
        { transform: "none" },
        { transform: "translateY(-16px) scale(1.32)", offset: 0.45 },
        { transform: "translateY(-6px) scale(1.18)", offset: 0.7 },
        { transform: "none" },
      ],
      { duration: 900, easing: "ease-out" },
    );
    await timers.sleep(300);
    bloom(lifts[i], "var(--gct-sim-star)", 30, 900);
    if (fx) {
      burst(fx, {
        ...centerOf(inners[i]),
        count: 16,
        shape: "star",
        colors: ["var(--gct-sim-star-ink)", "var(--gct-sim-star)", "white"],
        speed: [130, 280],
        gravity: 300,
        duration: 950,
        size: [6, 12],
      });
    }
    await timers.sleep(700);
    dimTo(0, 400);
    await timers.sleep(400);
    setSim("cards", i, "focus", false);
  };

  const play = async (count: number) => {
    const id = runId;
    const alive = () => id === runId;
    // 张数多时发得快一点，二十张也不会光发牌就等两秒
    const gap = count === 1 ? 0 : count > 10 ? 60 : 85;

    shuffle();
    deal(gap);
    await timers.sleep(SHUFFLE_MS + DEAL_MS + gap * (count - 1) + 150);
    if (!alive()) return;
    setSim("phase", "revealing");

    for (let i = 0; i < sim.cards.length; i += 1) {
      const tier = sim.cards[i].tier;
      if (tier === "star") {
        // oxlint-disable-next-line no-await-in-loop -- 逐张翻开本来就是依序的
        await revealStar(i);
      } else if (tier === "heart") {
        // oxlint-disable-next-line no-await-in-loop -- 同上
        await revealHeart(i);
      } else {
        // 素面奖品与没中：直接翻，不预告、不发光
        revealMiss(i);
        // oxlint-disable-next-line no-await-in-loop -- 同上
        await timers.sleep(count === 1 ? 500 : 170);
      }
      if (!alive()) return;
    }

    await timers.sleep(350);
    if (alive()) finish(true);
  };

  const pull = (requested: number) => {
    if (busy()) return;
    const count = clampPullCount(requested);
    stop();
    const prizes = props.prizes;
    const tierTable = tiers();
    const cards = drawMany(prizes, count).map<SimCard>((prizeIndex) => ({
      prizeIndex,
      tier: tierOf(prizeIndex, tierTable),
      name: prizeIndex === MISS ? "沒中" : (prizes[prizeIndex]?.name ?? ""),
      state: "dealt",
      focus: false,
    }));
    lifts.length = 0;
    inners.length = 0;
    // Solid 的更新是同步的：这一行回来时牌已经在 DOM 里、ref 也都接上了，
    // 发牌动画可以在第一次绘制前就把牌拉回牌堆，不会先闪一下终点位置。
    setSim({ phase: "drawing", cards });

    if (globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      finish(false);
      return;
    }
    void play(count);
  };

  // ── 显示用的衍生值 ──

  const rates = createMemo(() => effectiveRates(props.prizes));
  /** 每一列翻开时的演出层级：最稀有的一组星星、次稀有的一组爱心，其余素面。 */
  const tiers = createMemo(() => rarityTiers(props.prizes));
  const overflow = createMemo(
    () => props.prizes.reduce((sum, p) => sum + Math.max(0, p.probabilityPercent), 0) > 100,
  );

  /**
   * 累计表的列：目标列永远在，其余只列真的抽到过的（奖品表可能有三百列）。
   * 由稀有到常见排，跟牌面的星星、爱心顺序一致。
   */
  const tallyRows = createMemo(() =>
    props.prizes
      .map((prize, index) => ({
        index,
        name: prize.name,
        tier: tierOf(index, tiers()),
        isTarget: index === props.targetIndex,
        rate: rates().rates[index] ?? 0,
        count: tally.counts[index] ?? 0,
      }))
      .filter((row) => row.isTarget || row.count > 0)
      .toSorted(byRarity),
  );

  const summary = createMemo(() => {
    if (sim.phase !== "done") return null;
    const hits = new Map<number, number>();
    for (const card of sim.cards) {
      if (card.prizeIndex !== MISS) hits.set(card.prizeIndex, (hits.get(card.prizeIndex) ?? 0) + 1);
    }
    return {
      head:
        sim.cards.length === 1
          ? "這一抽"
          : sim.cards.length === 10
            ? "這次十連"
            : `這次 ${sim.cards.length} 連`,
      // 由稀有到常见：星星的奖品先讲
      hits: [...hits.entries()]
        .map(([index, count]) => ({
          index,
          rate: rates().rates[index] ?? 0,
          name: props.prizes[index]?.name ?? "",
          count,
          tier: tierOf(index, tiers()),
        }))
        .toSorted(byRarity),
    };
  });

  const share = (count: number) =>
    tally.pulls === 0 ? "—" : formatProbability(count / tally.pulls);

  return (
    <div
      class="gct-block gct-sim"
      style={{ "--gct-sim-star-mask": STAR_MASK, "--gct-sim-heart-mask": HEART_MASK }}
    >
      <h3 class="gct-block-title">模擬轉蛋</h3>

      <div class="gct-btn-row">
        <button class="gct-btn" type="button" disabled={busy()} onClick={() => pull(1)}>
          單抽
        </button>
        <button
          class="gct-btn"
          type="button"
          data-variant="primary"
          disabled={busy()}
          onClick={() => pull(10)}
        >
          十連
        </button>
        <label class="gct-sim-count">
          <span>點牌堆抽</span>
          <input
            type="number"
            inputmode="numeric"
            min="1"
            max={MAX_PULLS_PER_DRAW}
            step="1"
            aria-label={`點牌堆一次抽幾張（1–${MAX_PULLS_PER_DRAW}）`}
            value={deckCount()}
            onInput={(event) => {
              // 打字途中只收读得懂的值；空栏位留给使用者继续打，失焦时再补回来
              const typed = Number.parseInt(event.currentTarget.value, 10);
              if (Number.isFinite(typed)) setDeckCount(clampPullCount(typed));
            }}
            onBlur={(event) => {
              event.currentTarget.value = String(deckCount());
            }}
          />
          <span>次</span>
        </label>
        <button class="gct-btn" type="button" disabled={!busy()} onClick={() => finish(false)}>
          跳過
        </button>
        <span class="gct-sim-spacer" />
        <button
          class="gct-btn"
          type="button"
          disabled={busy() || tally.pulls === 0}
          onClick={resetAll}
        >
          清空紀錄
        </button>
      </div>

      <div
        class="gct-sim-stage"
        ref={(element) => {
          stage = element;
        }}
      >
        {/* 牌堆本身就是一颗按钮：点它抽上方栏位填的张数 */}
        <button
          class="gct-sim-deck"
          type="button"
          disabled={busy()}
          aria-label={`抽 ${deckCount()} 次`}
          onClick={() => pull(deckCount())}
          ref={(element) => {
            deck = element;
          }}
        >
          <SakuraBack />
          <SakuraBack />
          <SakuraBack />
        </button>

        <Show
          when={sim.cards.length > 0}
          fallback={<p class="gct-sim-hint">點牌堆，或按「單抽」「十連」開始</p>}
        >
          {/*
            用 div + role 而不是 ul/li：文章内文的 li 会被主题补上红色项目符号（::before），
            在这里每张牌左边都会多一颗红点。
            欄數跟張數走（最多 5 欄），張數少時不會一張張靠左擠在第一排。
          */}
          <div
            class="gct-sim-tray"
            role="list"
            data-count={sim.cards.length}
            data-size={sim.cards.length > 10 ? "small" : undefined}
            style={{ "--gct-sim-cols": String(Math.min(5, sim.cards.length)) }}
            aria-label="抽到的牌"
          >
            <For each={sim.cards}>
              {(card, index) => (
                <div
                  role="listitem"
                  class="gct-sim-card"
                  data-tier={card.tier}
                  data-state={card.state}
                  data-focus={card.focus ? "true" : undefined}
                  aria-label={card.state === "revealed" ? card.name : "還沒翻開的牌"}
                >
                  <div
                    class="gct-sim-lift"
                    ref={(element) => {
                      lifts[index()] = element;
                    }}
                  >
                    <div
                      class="gct-sim-inner"
                      ref={(element) => {
                        inners[index()] = element;
                      }}
                    >
                      <SakuraBack />
                      <Show when={card.state === "revealed"}>
                        <CardFront tier={card.tier} />
                      </Show>
                    </div>
                  </div>
                  <Show when={card.state === "revealed"}>
                    <span class="gct-sim-name">{card.name}</span>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </Show>

        <div
          class="gct-sim-dim"
          ref={(element) => {
            dim = element;
          }}
        />
        <div
          class="gct-sim-fx"
          ref={(element) => {
            fx = element;
          }}
        />
      </div>

      <p class="gct-sim-summary" aria-live="polite">
        <Show when={summary()} fallback={busy() ? "抽取中…" : ""}>
          {(current) => (
            <Show when={current().hits.length > 0} fallback={`${current().head}什麼都沒中。`}>
              {`${current().head}：`}
              <For each={current().hits}>
                {(hit, i) => (
                  <>
                    {i() > 0 ? "、" : ""}
                    <b data-tier={hit.tier}>
                      {hit.name} ×{hit.count}
                    </b>
                  </>
                )}
              </For>
            </Show>
          )}
        </Show>
      </p>

      <table class="gct-sim-tally">
        <thead>
          <tr>
            <th scope="col">累計 {formatCount(tally.pulls)} 抽</th>
            <th scope="col">{overflow() ? "實際機率" : "公告機率"}</th>
            <th scope="col">抽到</th>
            <th scope="col">實際比例</th>
          </tr>
        </thead>
        <tbody>
          <For each={tallyRows()}>
            {(row) => (
              <tr>
                <td>
                  <span class="gct-sim-swatch" data-tier={row.tier} />
                  {row.name}
                  {row.isTarget ? "（目標）" : ""}
                </td>
                <td>{formatProbability(row.rate / 100)}</td>
                <td>{formatCount(row.count)}</td>
                <td>{share(row.count)}</td>
              </tr>
            )}
          </For>
          <tr>
            <td>
              <span class="gct-sim-swatch" data-tier="miss" />
              沒中
            </td>
            <td>{formatProbability(rates().missRate / 100)}</td>
            <td>{formatCount(tally.miss)}</td>
            <td>{share(tally.miss)}</td>
          </tr>
        </tbody>
      </table>
      <Show when={overflow()}>
        <p class="gct-block-note">
          {"獎品表的機率總和超過 100%，模擬時已按比例縮小，所以這裡顯示的是縮放後的機率。"}
        </p>
      </Show>
    </div>
  );
}
