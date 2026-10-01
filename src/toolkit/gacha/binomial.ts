/**
 * 二项分布的纯函式实作，专门服务「转蛋抽奖」这个场景。
 *
 * 抽奖的机率常常小到 0.6%、0.15%，次数却可以上千，所以这里的每一个决定都是为了
 * 在「p 很小、n 很大」这一区不掉精度：
 * - 机率一律先在 log 空间算再 exp，避免 C(n, k) 在 n 稍大时就溢位成 Infinity
 * - `1 - (1 - p)^n` 改用 `-expm1(n * log1p(-p))`，直接算差值而不是两个接近 1 的数相减
 * - 累积机率永远直接加「比较小的那一侧尾巴」，另一侧用 1 减，不做灾难性相消
 *
 * 刻意不含任何 DOM／signal，才能被 vitest 直接测。UI 的输入夹紧在 state.ts。
 */

/**
 * 抽取次数的硬上限。
 *
 * 尾巴求和是 O(n)，而这颗工具在使用者每打一个字时都会重算一次。十万次以内在
 * 主执行绪上是瞬间完成，再往上就会开始卡住分页——这是效能上限，不是数学上限。
 */
export const MAX_TRIALS = 100_000;

/** Lanczos 近似（g=7, n=9）的系数，相对误差约在 1e-15。 */
const LANCZOS = [
  0.999_999_999_999_809_93, 676.520_368_121_885_1, -1259.139_216_722_402_8, 771.323_428_777_653_13,
  -176.615_029_162_140_59, 12.507_343_278_686_905, -0.138_571_095_265_720_12,
  9.984_369_578_019_571_6e-6, 1.505_632_735_149_311_6e-7,
];

/**
 * log Γ(z)。
 *
 * 用它而不是先算阶乘再取 log：C(1000, 500) 本身远远超过 Number.MAX_VALUE，
 * 只有全程留在 log 空间才算得出来。
 */
function logGamma(z: number): number {
  if (z < 0.5) {
    // 反射公式，把 z < 0.5 折到右半平面再算。
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }
  const x = z - 1;
  let series = LANCZOS[0];
  for (let i = 1; i < LANCZOS.length; i++) {
    series += LANCZOS[i] / (x + i);
  }
  const t = x + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(series);
}

/** log C(n, k)。 */
export function logBinomialCoefficient(n: number, k: number): number {
  if (k < 0 || k > n) return Number.NEGATIVE_INFINITY;
  if (k === 0 || k === n) return 0;
  return logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);
}

/** 输入必须是「n 次独立试验、每次成功机率 p」这个模型说得通的值。 */
function isValidTrial(n: number, p: number): boolean {
  return Number.isInteger(n) && n >= 0 && Number.isFinite(p) && p >= 0 && p <= 1;
}

/**
 * log P(X = k)。
 *
 * k 或 n - k 为 0 时对应的项直接给 0：`0 * Math.log(0)` 在 JS 里是 NaN 而不是 0，
 * 而 p = 0 抽 0 次中 0 次这种边界在转蛋计算里是天天会碰到的（例如「一次都没中」）。
 */
function logPmf(n: number, k: number, p: number): number {
  const successTerm = k === 0 ? 0 : k * Math.log(p);
  const failureTerm = n === k ? 0 : (n - k) * Math.log1p(-p);
  return logBinomialCoefficient(n, k) + successTerm + failureTerm;
}

/** 恰好成功 k 次的机率 P(X = k)。 */
export function binomialPmf(n: number, k: number, p: number): number {
  if (!isValidTrial(n, p) || !Number.isInteger(k) || k < 0 || k > n) return 0;
  if (p === 0) return k === 0 ? 1 : 0;
  if (p === 1) return k === n ? 1 : 0;
  return Math.exp(logPmf(n, k, p));
}

/**
 * 把 [lo, hi] 区间的 pmf 加起来。
 *
 * 呼叫端保证整个区间落在众数的同一侧，所以从靠近平均数的那一端往外走时，每一项
 * 都单调递减；一旦某项小到对累加值已无贡献就可以停，n 很大而尾巴很短时省下的是
 * 数万次迭代。
 */
function sumRange(n: number, p: number, lo: number, hi: number): number {
  if (lo > hi) return 0;
  const mean = n * p;
  const startFromLo = Math.abs(lo - mean) <= Math.abs(hi - mean);
  const first = startFromLo ? lo : hi;
  const last = startFromLo ? hi : lo;
  const step = startFromLo ? 1 : -1;

  let sum = 0;
  for (let k = first; startFromLo ? k <= last : k >= last; k += step) {
    const term = Math.exp(logPmf(n, k, p));
    sum += term;
    if (k !== first && term < sum * 1e-18) break;
  }
  // 浮点误差可能把「几乎是 1」推到 1 之上，往回夹紧比让 UI 显示 100.0000001% 好。
  return Math.min(sum, 1);
}

/** 下侧累积 P(X ≤ k)。 */
export function binomialCdfAtMost(n: number, k: number, p: number): number {
  if (!isValidTrial(n, p)) return Number.NaN;
  if (k < 0) return 0;
  if (k >= n) return 1;
  if (p === 0) return 1;
  if (p === 1) return 0;
  const upper = Math.floor(k);
  // k 在平均数右边时下侧机率接近 1，改成 1 减右尾，避免用一堆接近 1 的项硬加。
  return upper > n * p ? 1 - sumRange(n, p, upper + 1, n) : sumRange(n, p, 0, upper);
}

/** 上侧累积 P(X ≥ k)。 */
export function binomialCdfAtLeast(n: number, k: number, p: number): number {
  if (!isValidTrial(n, p)) return Number.NaN;
  if (k <= 0) return 1;
  if (k > n) return 0;
  if (p === 0) return 0;
  if (p === 1) return 1;
  const lower = Math.ceil(k);
  // 「至少中一次」是整页最常被看的数字，走 expm1 专用路径：p = 1e-7 抽 10 次时
  // 1 - (1 - p)^n 会直接被舍入成 0，而正确答案是 1e-6。
  if (lower === 1) return atLeastOnce(n, p);
  return lower > n * p ? sumRange(n, p, lower, n) : 1 - sumRange(n, p, 0, lower - 1);
}

/**
 * 抽 n 次至少中 1 次的机率。
 *
 * 数学上就是 1 - (1 - p)^n，但那个写法在 p 很小时会被灾难性相消吃掉所有有效位数。
 * `expm1` 与 `log1p` 是成对的：前者算 e^x - 1，后者算 log(1 + x)，两者都在 x 接近 0
 * 时保住精度。
 */
export function atLeastOnce(n: number, p: number): number {
  if (!isValidTrial(n, p)) return Number.NaN;
  if (n === 0 || p === 0) return 0;
  if (p === 1) return 1;
  return -Math.expm1(n * Math.log1p(-p));
}

/** 期望成功次数 E[X] = n·p。 */
export function expectedSuccesses(n: number, p: number): number {
  if (!isValidTrial(n, p)) return Number.NaN;
  return n * p;
}

/** 标准差 √(n·p·(1-p))。 */
export function standardDeviation(n: number, p: number): number {
  if (!isValidTrial(n, p)) return Number.NaN;
  return Math.sqrt(n * p * (1 - p));
}

/**
 * 平均要抽几次才会中第一次：几何分布的期望值 1/p。
 *
 * 这个数字常被误读成「保底」。它是长期平均，不是保证——抽满 1/p 次却一次都没中的
 * 机率大约是 37%，这也是文章里要特别写一段的原因。
 */
export function expectedTrialsPerSuccess(p: number): number {
  if (!Number.isFinite(p) || p <= 0 || p > 1) return Number.NaN;
  return 1 / p;
}

/** 机率最高的那个成功次数（众数）。 */
export function mostLikelySuccesses(n: number, p: number): number {
  if (!isValidTrial(n, p)) return 0;
  if (p === 0) return 0;
  if (p === 1) return n;
  return Math.min(n, Math.floor((n + 1) * p));
}

/**
 * 要有 `confidence` 的把握至少中 k 次，需要抽几次。
 *
 * k = 1 有封闭解，直接算；k ≥ 2 时 P(X ≥ k) 对 n 单调递增，用二分搜寻。
 * 超过 MAX_TRIALS 仍达不到就回传 null——与其给一个被截断的数字，不如让 UI 老实说
 * 「这个信心水准在上限内做不到」。
 */
export function trialsForConfidence(p: number, confidence: number, successes = 1): number | null {
  if (!Number.isFinite(p) || p <= 0 || p > 1) return null;
  if (!Number.isFinite(confidence) || confidence <= 0 || confidence >= 1) return null;
  if (!Number.isInteger(successes) || successes < 1) return null;
  if (p === 1) return successes;

  if (successes === 1) {
    const exact = Math.ceil(Math.log1p(-confidence) / Math.log1p(-p));
    return exact > MAX_TRIALS ? null : Math.max(1, exact);
  }

  if (binomialCdfAtLeast(MAX_TRIALS, successes, p) < confidence) return null;

  let low = successes;
  let high = MAX_TRIALS;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (binomialCdfAtLeast(mid, successes, p) >= confidence) high = mid;
    else low = mid + 1;
  }
  return low;
}

export interface DistributionBar {
  successes: number;
  /** P(X = k)，机率质量。 */
  probability: number;
  /** P(X ≤ k)，下侧累积。 */
  atMost: number;
  /** P(X ≥ k)，上侧累积。 */
  atLeast: number;
}

/**
 * 取众数附近的一段分布，连同两侧的累积机率，给 UI 的分布表用。
 *
 * 只回传 `span` 根柱子而不是全部 n + 1 根：n = 100000 时把整条分布塞进 DOM 只会
 * 让分页停住，而且两端的机率早就小到画不出来。区间会被推回 [0, n] 内，靠近边界时
 * 仍然给满 span 根。
 *
 * 累积值刻意**不是**每一列各呼叫一次 binomialCdf*：那是 span 次 O(n) 求和，n 很大
 * 时每打一个字就要跑上百万次 exp。改成只在窗口两端各取一个锚点（两次 cdf），窗口内
 * 用已经算好的 pmf 逐项累加。两侧各自从自己那一端往内加，小机率那一侧才不会被
 * 「1 减掉一个接近 1 的数」吃掉有效位数。
 */
export function distributionAroundMode(n: number, p: number, span = 13): DistributionBar[] {
  if (!isValidTrial(n, p) || span < 1) return [];
  const width = Math.min(span, n + 1);
  const mode = mostLikelySuccesses(n, p);
  let start = mode - Math.floor((width - 1) / 2);
  start = Math.max(0, Math.min(start, n - width + 1));
  const end = start + width - 1;

  const pmf: number[] = [];
  for (let k = start; k <= end; k++) pmf.push(binomialPmf(n, k, p));

  const atMost: number[] = [];
  let lower = start > 0 ? binomialCdfAtMost(n, start - 1, p) : 0;
  for (let i = 0; i < width; i++) {
    lower += pmf[i];
    atMost.push(Math.min(1, lower));
  }

  const atLeast: number[] = Array.from({ length: width });
  let upper = end < n ? binomialCdfAtLeast(n, end + 1, p) : 0;
  for (let i = width - 1; i >= 0; i--) {
    upper += pmf[i];
    atLeast[i] = Math.min(1, upper);
  }

  /*
   * 支撑区间的两端在定义上就是 1：P(X ≥ 0) 与 P(X ≤ n) 不可能是别的值。逐项累加
   * 会停在 0.9999999999999998 那种地方，被格式化成「> 99.9999%」——那不是精度不足，
   * 是把一个确定的 1 显示成近似值。直接钉死。
   */
  if (start === 0) atLeast[0] = 1;
  if (end === n) atMost[width - 1] = 1;

  return pmf.map((probability, i) => ({
    successes: start + i,
    probability,
    atMost: atMost[i],
    atLeast: atLeast[i],
  }));
}
