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
 */

import { MAX_PRIZES, MIN_PROBABILITY_PERCENT, MAX_AMOUNT } from "./state";
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

/**
 * 贴给 AI 的提示词。
 *
 * 刻意把「只输出 JSON」「percent 是百分比数字」「总和不可超过 100」写成编号规则：
 * 这三条是实际会出错的地方，写成散文的话模型很容易漏掉其中一条。
 */
export const PRIZE_JSON_PROMPT = `請幫我把下面這個轉蛋卡池的機率整理成 JSON。

輸出規則：
1. 只輸出 JSON 本身，不要有任何說明文字，也不要包在 markdown 程式碼框裡。
2. 格式如下：
{
  "prizes": [
    { "name": "SSR 角色", "probabilityPercent": 0.6, "value": 0 },
    { "name": "SR 武器", "probabilityPercent": 5.1, "value": 0 }
  ],
  "targetPrizeIndex": 0,
  "costPerTrial": 0
}
3. probabilityPercent 一律是「百分比數字」：0.6 代表 0.6%，不要寫成 0.006。
4. 同一抽裡各列互斥，所有 probabilityPercent 加起來不可以超過 100。
   什麼都沒中的剩餘機率不用另外列一行。
5. name 最多 16 個字；最多 ${MAX_PRIZES} 列。公告有逐一列出的獎品就照列，不要自行合併。
6. value 是該獎品對我的價值，不知道就填 0，我會自己改。
7. targetPrizeIndex 指向我最想要的那一列（從 0 開始數）。
8. costPerTrial 是單抽成本，只填數字，要跟 value 用同一個單位。不知道就填 0。

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

    const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 16) : "";
    const value = readNumber(raw, ["value"]) ?? 0;

    prizes.push({
      name: name || `獎品 ${prizes.length + 1}`,
      probabilityPercent: clampedPercent,
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
