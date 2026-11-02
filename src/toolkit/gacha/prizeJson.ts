/**
 * 奖品表的 JSON 汇入／汇出，以及给 AI 用的提示词。
 *
 * 存在的理由很实际：官方机率公告通常是一大张表，手打又慢又容易抄错，丢给 AI
 * 整理成 JSON 再贴回来快得多。所以这里要解决的不是「解析 JSON」，而是「解析一段**不
 * 保证干净**的 AI 输出」——前后会有寒暄、可能包在 markdown 程式码框里、栏位名可能
 * 少一截。
 *
 * 唯一不肯放宽的是机率的单位：`0.6` 到底是 0.6% 还是 60%，猜错会让整页数字差一百倍，
 * 而且错得很安静。所以只认 `probabilityPercent` 与 `percent` 这两个自带单位的栏名，
 * 裸的 `probability` 一律当成缺栏位并报错。提示词那边也把这条写死。
 *
 * 公告超过 MAX_PRIZES 列时靠 `count` 合并：同级、单个机率相同的奖品收成一列，
 * `probabilityPercent` 照抄公告上**单个**奖品的机率，乘法由这里做。不让 AI 自己加总，
 * 是因为模型加几十个小数并不可靠，而照抄一个数字、数一个个数，它做得到。
 *
 * 这样合并对期望值是精确的而不是近似：各列互斥，合并列的机率就是各列相加；
 * 同一列共用一个价值，Σpᵢ·v = (Σpᵢ)·v。会失去的只有「单独把其中一个当目标」，
 * 所以提示词要求目标列绝不合并。
 */

import { MAX_AMOUNT, MAX_PRIZE_NAME_LENGTH, MAX_PRIZES, MIN_PROBABILITY_PERCENT } from "./state";
import type { GachaPrize } from "./state";

/** 汇入成功后要套用到 state 上的部分栏位。没出现在 JSON 里的栏位不会被动到。 */
export interface PrizeImportPatch {
  prizes: GachaPrize[];
  targetPrizeIndex?: number;
  costPerTrial?: number;
}

export type PrizeImportResult =
  | { ok: true; patch: PrizeImportPatch; warnings: string[] }
  | { ok: false; error: string };

/** 合并列名称后缀用的乘号，例如「R 道具 ×20」。 */
const COUNT_SEPARATOR = " ×";

/**
 * 贴给 AI 的提示词。
 *
 * 刻意把「放进程式码框」「percent 是百分比数字」「总和不可超过 100」「怎么合并」写成
 * 编号规则：这几条是实际会出错的地方，写成散文的话模型很容易漏掉其中一条。
 *
 * 要求程式码框而不是裸 JSON：网页版 AI 只会替程式码框渲染「复制」按钮，裸 JSON
 * 得自己拖选，长表很容易漏选头尾。程式码框本来就会在 extractJsonText 被剥掉。
 */
export const PRIZE_JSON_PROMPT = `請幫我把下面這個轉蛋卡池的機率整理成 JSON。

輸出規則：
1. 把 JSON 放在一個 markdown 程式碼框裡（用 \`\`\`json 開頭、\`\`\` 結尾），
   程式碼框外面不要有任何說明文字。
2. 格式如下：
{
  "prizes": [
    { "name": "SSR 角色", "probabilityPercent": 0.6, "value": 0 },
    { "name": "SR 武器", "probabilityPercent": 5.1, "value": 0 },
    { "name": "R 道具", "probabilityPercent": 0.5, "count": 20, "value": 0 }
  ],
  "targetPrizeIndex": 0,
  "costPerTrial": 0
}
3. probabilityPercent 一律是「百分比數字」：0.6 代表 0.6%，不要寫成 0.006。
4. 同一抽裡各列互斥，所有列的 probabilityPercent × count 加起來不可以超過 100。
   什麼都沒中的剩餘機率不用另外列一行。
5. name 最多 16 個字。公告有逐一列出的獎品就一個一列照列，不要自行合併。
6. 只有在逐一列出會超過 ${MAX_PRIZES} 列時才合併，合併方式固定如下：
   - 只合併「同一稀有度、而且公告上單個機率完全相同」的獎品，收成一列。
   - 這一列加上 "count"：合併了幾個獎品（整數）。
   - probabilityPercent 照抄公告上「單個」獎品的機率，不要自己把它們加起來，我的工具會自己乘。
   - name 寫這一級的統稱（例如「R 道具」），不要在 name 裡寫個數。
   - 我最想要的那一個獎品（targetPrizeIndex 指向的那一列）絕對不合併。
   沒有合併的列不用寫 count。
   如果我給你的資料裡已經有名稱以「×數字」結尾的列，那是先前合併好的，
   它的 probabilityPercent 已經是總和：原樣保留，不要替它加 count。
7. value 是該獎品對我的價值，不知道就填 0，我會自己改。合併的列填單個獎品的價值。
8. targetPrizeIndex 指向我最想要的那一列（從 0 開始數）。
9. costPerTrial 是單抽成本，只填數字，要跟 value 用同一個單位。不知道就填 0。

以下是卡池資料：
`;

/** 把目前的奖品表输出成可以直接贴回来的 JSON。 */
export function serializePrizes(patch: PrizeImportPatch): string {
  return JSON.stringify(
    {
      prizes: patch.prizes.map((prize) => ({
        name: prize.name,
        probabilityPercent: prize.probabilityPercent,
        value: prize.value,
      })),
      targetPrizeIndex: patch.targetPrizeIndex ?? 0,
      costPerTrial: patch.costPerTrial ?? 0,
    },
    null,
    2,
  );
}

/**
 * 从一段可能夹杂散文的文字里把 JSON 物件挖出来。
 *
 * 先剥掉 markdown 程式码框，再退而求其次取第一个 `{` 到最后一个 `}`——模型很爱在
 * JSON 前后各补一句「好的，這是整理後的結果」。取最外层的大括号而不是做完整的括号
 * 配对，是因为真正的失败情况（根本没有 JSON）会在 JSON.parse 那一步被挡下来，
 * 不需要在这里重写一个解析器。
 */
function extractJsonText(input: string): string | null {
  const withoutFence = input.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const trimmed = withoutFence.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return trimmed;

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  return trimmed.slice(start, end + 1);
}

/** 型别守卫而不是 `as`：JSON.parse 回来的是 unknown，断言等于放弃检查。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNumber(raw: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    // 模型偶尔会把数字包成字串（"0.6"）。能无歧义转成数字就收。
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 名称里是不是已经带着「×个数」。
 *
 * 这是有歧义的一列：可能是模型没照规则把个数写进名称（机率仍是单个的，该乘），
 * 也可能是「复制目前的奖品表」汇出的合并列被 AI 补上 count 又贴回来（机率已经是
 * 总和，再乘一次就放大 count 倍）。分不出来，所以照主规则乘，但一定要警告。
 */
function nameHasCount(name: string, count: number): boolean {
  return name.replace(/\s+/g, "").includes(`${COUNT_SEPARATOR.trim()}${count}`);
}

/**
 * 合并列的名称：统称后面补上「 ×个数」，整串仍守住 16 字上限。
 *
 * 个数一定要留在名称里：合并之后画面上只剩一个总机率，没有这个后缀，使用者看不出
 * 「R 道具 10%」其实是二十个各 0.5% 的道具，会误以为能单独抽中某一个的机会有 10%。
 * 名称里已经写了同一个个数就不重复补（这种情况由呼叫端另外警告，见 nameHasCount）。
 */
function mergedName(name: string, count: number): string {
  const suffix = `${COUNT_SEPARATOR}${count}`;
  if (nameHasCount(name, count)) return name.slice(0, MAX_PRIZE_NAME_LENGTH);
  const base = name.slice(0, Math.max(0, MAX_PRIZE_NAME_LENGTH - suffix.length)).trimEnd();
  return `${base}${suffix}`;
}

/**
 * 读 `count`：没写就是 1，写了就必须是正整数。
 *
 * 不合格的值修成最接近的正整数并回报，而不是整笔拒收：个数写成 `20.0` 或 `"20"`
 * 是模型常见的小毛病，意思并不含糊。
 */
function readCount(raw: Record<string, unknown>, row: number, warnings: string[]): number {
  const count = readNumber(raw, ["count"]);
  if (count === null) return 1;
  const fixed = Math.max(1, Math.round(count));
  if (fixed !== count) warnings.push(`第 ${row} 列的 count ${count} 不是正整數，已改成 ${fixed}。`);
  return fixed;
}

/**
 * 解析贴进来的文字。
 *
 * 回传 warnings 而不是默默修掉：被夹紧的机率、被截断的列数都是使用者该知道的事，
 * 否则他会以为工具算错，而不是知道自己的 JSON 被改过。
 */
export function parsePrizeImport(text: string): PrizeImportResult {
  const jsonText = extractJsonText(text);
  if (!jsonText) return { ok: false, error: "看不到 JSON。請把整段 JSON 貼進來。" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false, error: "JSON 格式有誤，解析不了。檢查有沒有多餘的逗號或中文引號。" };
  }

  // 顶层允许直接是阵列（模型常常只给 prizes 那一段）。
  const root = isRecord(parsed) ? parsed : Array.isArray(parsed) ? { prizes: parsed } : {};

  const rawPrizes: unknown = root.prizes;
  if (!Array.isArray(rawPrizes) || rawPrizes.length === 0) {
    return { ok: false, error: "JSON 裡找不到 prizes 陣列，或是陣列是空的。" };
  }

  const warnings: string[] = [];
  const prizes: GachaPrize[] = [];

  for (const [index, entry] of (rawPrizes as unknown[]).entries()) {
    if (prizes.length >= MAX_PRIZES) {
      warnings.push(`超過 ${MAX_PRIZES} 列的部分已略過。`);
      break;
    }
    if (!isRecord(entry)) continue;
    const raw = entry;

    const percent = readNumber(raw, ["probabilityPercent", "percent"]);
    if (percent === null) {
      return {
        ok: false,
        error: `第 ${index + 1} 列缺少 probabilityPercent。這個欄位不能省略，因為 0.6 是 0.6% 還是 60% 只有欄位名說得清楚。`,
      };
    }

    const clampedPercent = clamp(percent, MIN_PROBABILITY_PERCENT, 100);
    if (clampedPercent !== percent) {
      warnings.push(`第 ${index + 1} 列的機率 ${percent} 超出 0–100，已夾成 ${clampedPercent}。`);
    }

    const count = readCount(raw, index + 1, warnings);
    // toPrecision 收掉浮点尾巴：0.05 × 20 会算成 1.0000000000000002，填回输入框很难看。
    const mergedPercent = Number((clampedPercent * count).toPrecision(12));
    const totalPercent = clamp(mergedPercent, MIN_PROBABILITY_PERCENT, 100);
    if (totalPercent !== mergedPercent) {
      warnings.push(
        `第 ${index + 1} 列 ${clampedPercent}% × ${count} 個 = ${mergedPercent}%，超過 100%，已夾成 100。`,
      );
    }

    const trimmedName = typeof raw.name === "string" ? raw.name.trim() : "";
    const name = trimmedName || `獎品 ${prizes.length + 1}`;
    if (count > 1 && nameHasCount(name, count)) {
      warnings.push(
        `第 ${index + 1} 列「${name}」名稱已經帶著 ×${count}，機率照單個算成 ${totalPercent}%。如果原本的 ${clampedPercent}% 已經是合併後的總和，請把它改回 ${clampedPercent}。`,
      );
    }
    const value = readNumber(raw, ["value"]) ?? 0;

    prizes.push({
      name: count > 1 ? mergedName(name, count) : name.slice(0, MAX_PRIZE_NAME_LENGTH),
      probabilityPercent: totalPercent,
      // 合并列共用单个奖品的价值：期望值 (Σpᵢ)·v 与逐列相加的 Σpᵢ·v 完全相等。
      value: clamp(value, 0, MAX_AMOUNT),
    });
  }

  if (prizes.length === 0) {
    return { ok: false, error: "prizes 陣列裡沒有任何一列看得懂的獎品。" };
  }

  const total = prizes.reduce((sum, prize) => sum + prize.probabilityPercent, 0);
  if (total > 100) {
    warnings.push(`機率總和 ${total.toFixed(2)}% 超過 100%，同一抽不可能同時中兩列，請檢查。`);
  }

  const patch: PrizeImportPatch = { prizes };

  const targetIndex = readNumber(root, ["targetPrizeIndex"]);
  if (targetIndex !== null) {
    patch.targetPrizeIndex = Math.round(clamp(targetIndex, 0, prizes.length - 1));
  }

  const cost = readNumber(root, ["costPerTrial"]);
  if (cost !== null) patch.costPerTrial = clamp(cost, 0, MAX_AMOUNT);

  return { ok: true, patch, warnings };
}
