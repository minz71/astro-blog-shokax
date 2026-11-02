import { describe, expect, it } from "vitest";

import { MAX_PRIZE_NAME_LENGTH, MAX_PRIZES, MIN_PROBABILITY_PERCENT } from "./state";
import type { GachaPrize } from "./state";
import { PRIZE_JSON_PROMPT, parsePrizeImport, serializePrizes } from "./prizeJson";

const CLEAN = JSON.stringify({
  prizes: [
    { name: "SSR 角色", probabilityPercent: 0.6, value: 3000 },
    { name: "SR 武器", probabilityPercent: 5.1, value: 300 },
  ],
  targetPrizeIndex: 1,
  costPerTrial: 60,
});

/** 每抽期望价值 Σ p·v（百分比单位，只拿来比较两张表是否相等）。 */
function expectedValue(rows: readonly GachaPrize[]): number {
  return rows.reduce((sum, row) => sum + row.probabilityPercent * row.value, 0);
}

function expectOk(result: ReturnType<typeof parsePrizeImport>) {
  if (!result.ok) throw new Error(`expected success, got: ${result.error}`);
  return result;
}

describe("parsePrizeImport", () => {
  it("reads a clean object", () => {
    const { patch, warnings } = expectOk(parsePrizeImport(CLEAN));
    expect(warnings).toEqual([]);
    expect(patch.prizes).toEqual([
      { name: "SSR 角色", probabilityPercent: 0.6, value: 3000 },
      { name: "SR 武器", probabilityPercent: 5.1, value: 300 },
    ]);
    expect(patch.targetPrizeIndex).toBe(1);
    expect(patch.costPerTrial).toBe(60);
  });

  it("accepts a bare array as the whole payload", () => {
    const { patch } = expectOk(parsePrizeImport('[{ "name": "SSR", "probabilityPercent": 0.6 }]'));
    expect(patch.prizes).toHaveLength(1);
    expect(patch.prizes[0].value).toBe(0);
    expect(patch.targetPrizeIndex).toBeUndefined();
  });

  it("digs the JSON out of an AI's chattier answer", () => {
    const chatty = `好的，這是整理後的結果：\n\n\`\`\`json\n${CLEAN}\n\`\`\`\n\n有問題再跟我說！`;
    expect(expectOk(parsePrizeImport(chatty)).patch.prizes).toHaveLength(2);

    const noFence = `這是 JSON：${CLEAN} 希望有幫助`;
    expect(expectOk(parsePrizeImport(noFence)).patch.prizes).toHaveLength(2);
  });

  it("accepts numbers that came back as strings", () => {
    const { patch } = expectOk(
      parsePrizeImport('{"prizes":[{"name":"SSR","probabilityPercent":"0.6","value":"3000"}]}'),
    );
    expect(patch.prizes[0].probabilityPercent).toBe(0.6);
    expect(patch.prizes[0].value).toBe(3000);
  });

  it("refuses a bare `probability` field rather than guessing the unit", () => {
    // 0.6 是 0.6% 还是 60%？猜错整页数字差一百倍，而且错得很安静。
    const result = parsePrizeImport('{"prizes":[{"name":"SSR","probability":0.006}]}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("probabilityPercent");
  });

  it("accepts `percent` as the one alias that still carries its unit", () => {
    const { patch } = expectOk(parsePrizeImport('{"prizes":[{"name":"SSR","percent":0.6}]}'));
    expect(patch.prizes[0].probabilityPercent).toBe(0.6);
  });

  it("names the rows that arrived without a name", () => {
    const { patch } = expectOk(
      parsePrizeImport(
        '{"prizes":[{"probabilityPercent":1},{"name":"  ","probabilityPercent":2}]}',
      ),
    );
    expect(patch.prizes[0].name).toBe("獎品 1");
    expect(patch.prizes[1].name).toBe("獎品 2");
  });

  it("takes a 0% row at face value, with no warning", () => {
    // 「這一層存在但我不在乎」是正常的一列。夾成 0.00001 再跳警告，等於默默改掉
    // 使用者填的值，還要他去讀懂一個看不懂的訊息。
    const { patch, warnings } = expectOk(
      parsePrizeImport('{"prizes":[{"name":"墊底","probabilityPercent":0,"value":0}]}'),
    );
    expect(patch.prizes[0].probabilityPercent).toBe(0);
    expect(warnings).toEqual([]);
  });

  it("clamps out-of-range probabilities and says so", () => {
    const { patch, warnings } = expectOk(
      parsePrizeImport('{"prizes":[{"name":"a","probabilityPercent":140}]}'),
    );
    expect(patch.prizes[0].probabilityPercent).toBe(100);
    expect(warnings.join()).toContain("夾成");

    const low = expectOk(parsePrizeImport('{"prizes":[{"name":"a","probabilityPercent":-5}]}'));
    expect(low.patch.prizes[0].probabilityPercent).toBe(MIN_PROBABILITY_PERCENT);
  });

  it("warns when the rows add up to more than certainty", () => {
    const { warnings } = expectOk(
      parsePrizeImport(
        '{"prizes":[{"name":"a","probabilityPercent":80},{"name":"b","probabilityPercent":50}]}',
      ),
    );
    expect(warnings.join()).toContain("超過 100%");
  });

  it("truncates past the row cap and says so", () => {
    // 每列 0.1%：列数超过上限时总和仍在 100% 内，警告只会来自截断这一条。
    const many = Array.from({ length: MAX_PRIZES + 20 }, (_, i) => ({
      name: `p${i}`,
      probabilityPercent: 0.1,
    }));
    const { patch, warnings } = expectOk(parsePrizeImport(JSON.stringify({ prizes: many })));
    expect(patch.prizes).toHaveLength(MAX_PRIZES);
    expect(warnings.join()).toContain(String(MAX_PRIZES));
  });

  it("multiplies a merged row's per-item probability by its count", () => {
    // 让模型照抄单个机率、数个数，乘法由解析器做：模型加总几十个小数并不可靠。
    const { patch, warnings } = expectOk(
      parsePrizeImport(
        '{"prizes":[{"name":"R 道具","probabilityPercent":0.05,"count":20,"value":10}]}',
      ),
    );
    expect(warnings).toEqual([]);
    // 0.05 × 20 的浮点尾巴要被收掉，不能是 1.0000000000000002。
    expect(patch.prizes[0]).toEqual({ name: "R 道具 ×20", probabilityPercent: 1, value: 10 });
  });

  it("keeps the expectation of a merged row identical to listing every item", () => {
    const items = Array.from({ length: 7 }, (_, i) => ({
      name: `R${i}`,
      probabilityPercent: 0.3,
      value: 40,
    }));
    const listed = expectOk(parsePrizeImport(JSON.stringify({ prizes: items }))).patch.prizes;
    const merged = expectOk(
      parsePrizeImport('{"prizes":[{"name":"R","probabilityPercent":0.3,"count":7,"value":40}]}'),
    ).patch.prizes;
    expect(expectedValue(merged)).toBeCloseTo(expectedValue(listed), 10);
  });

  it("treats a missing or 1 count as an ordinary row with no suffix", () => {
    const { patch } = expectOk(
      parsePrizeImport('{"prizes":[{"name":"SSR","probabilityPercent":0.6,"count":1}]}'),
    );
    expect(patch.prizes[0]).toEqual({ name: "SSR", probabilityPercent: 0.6, value: 0 });
  });

  it("fits the count suffix inside the name length cap", () => {
    const { patch } = expectOk(
      parsePrizeImport(
        `{"prizes":[{"name":"${"道".repeat(20)}","probabilityPercent":0.1,"count":150}]}`,
      ),
    );
    expect(patch.prizes[0].name).toHaveLength(MAX_PRIZE_NAME_LENGTH);
    expect(patch.prizes[0].name.endsWith(" ×150")).toBe(true);
  });

  it("still multiplies when the name already carries the count, but warns loudly", () => {
    // 分不出是「模型把个数写进名称」还是「汇出的合并列被补上 count 又贴回来」，
    // 后者再乘一次会放大二十倍，所以不能安静地乘。
    const { patch, warnings } = expectOk(
      parsePrizeImport('{"prizes":[{"name":"R 道具 ×20","probabilityPercent":0.5,"count":20}]}'),
    );
    expect(patch.prizes[0].name).toBe("R 道具 ×20");
    expect(patch.prizes[0].probabilityPercent).toBe(10);
    expect(warnings.join()).toContain("已經帶著 ×20");
  });

  it("round-trips a merged row through export without multiplying again", () => {
    const merged = expectOk(
      parsePrizeImport('{"prizes":[{"name":"R 道具","probabilityPercent":0.5,"count":20}]}'),
    ).patch;
    const { patch, warnings } = expectOk(parsePrizeImport(serializePrizes(merged)));
    expect(warnings).toEqual([]);
    expect(patch.prizes[0]).toEqual({ name: "R 道具 ×20", probabilityPercent: 10, value: 0 });
  });

  it("fixes a non-integer count and says so", () => {
    const { patch, warnings } = expectOk(
      parsePrizeImport('{"prizes":[{"name":"R","probabilityPercent":1,"count":2.6}]}'),
    );
    expect(patch.prizes[0].probabilityPercent).toBe(3);
    expect(warnings.join()).toContain("count");

    const zero = expectOk(
      parsePrizeImport('{"prizes":[{"name":"R","probabilityPercent":1,"count":0}]}'),
    );
    expect(zero.patch.prizes[0].probabilityPercent).toBe(1);
    expect(zero.warnings.join()).toContain("count");
  });

  it("clamps a merged row that adds up past 100% and says so", () => {
    const { patch, warnings } = expectOk(
      parsePrizeImport('{"prizes":[{"name":"R","probabilityPercent":5,"count":30}]}'),
    );
    expect(patch.prizes[0].probabilityPercent).toBe(100);
    expect(warnings.join()).toContain("夾成 100");
  });

  it("keeps the target index inside the imported table", () => {
    const { patch } = expectOk(
      parsePrizeImport('{"prizes":[{"name":"a","probabilityPercent":1}],"targetPrizeIndex":7}'),
    );
    expect(patch.targetPrizeIndex).toBe(0);
  });

  it("reports readable errors instead of throwing", () => {
    expect(parsePrizeImport("")).toEqual({
      ok: false,
      error: "看不到 JSON。請把整段 JSON 貼進來。",
    });
    expect(parsePrizeImport("完全沒有 JSON 的一段話").ok).toBe(false);

    const broken = parsePrizeImport('{"prizes":[{"name":"a",}]}');
    expect(broken.ok).toBe(false);
    if (!broken.ok) expect(broken.error).toContain("格式");

    const empty = parsePrizeImport('{"prizes":[]}');
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error).toContain("prizes");
  });
});

describe("serializePrizes", () => {
  it("round-trips through parsePrizeImport", () => {
    const original = {
      prizes: [{ name: "SSR", probabilityPercent: 0.6, value: 3000 }],
      targetPrizeIndex: 0,
      costPerTrial: 60,
    };
    const { patch } = expectOk(parsePrizeImport(serializePrizes(original)));
    expect(patch).toEqual(original);
  });

  it("fills in the optional fields with sane defaults", () => {
    const text = serializePrizes({ prizes: [{ name: "a", probabilityPercent: 1, value: 0 }] });
    expect(JSON.parse(text)).toMatchObject({ targetPrizeIndex: 0, costPerTrial: 0 });
  });
});

describe("PRIZE_JSON_PROMPT", () => {
  it("spells out the unit rule and the row cap", () => {
    // 提示词是这颗功能的一半：模型照着填，解析才有东西可读。
    expect(PRIZE_JSON_PROMPT).toContain("probabilityPercent");
    expect(PRIZE_JSON_PROMPT).toContain("0.6 代表 0.6%");
    expect(PRIZE_JSON_PROMPT).toContain(String(MAX_PRIZES));
  });

  it("asks for a code fence, so web chat UIs render a copy button", () => {
    expect(PRIZE_JSON_PROMPT).toContain("```json");
  });

  it("parses a reply that follows the prompt: one fenced JSON block", () => {
    const reply = `\`\`\`json\n${CLEAN}\n\`\`\``;
    expect(expectOk(parsePrizeImport(reply)).patch.prizes).toHaveLength(2);
  });

  it("tells the model to copy the per-item rate and leave the multiplying to us", () => {
    expect(PRIZE_JSON_PROMPT).toContain('"count"');
    expect(PRIZE_JSON_PROMPT).toContain("不要自己把它們加起來");
    expect(PRIZE_JSON_PROMPT).toContain("絕對不合併");
  });

  it("ships an example that the parser itself accepts", () => {
    // 提示词里的范例若解析不了，等于教模型输出坏资料。
    const start = PRIZE_JSON_PROMPT.indexOf("{");
    const end = PRIZE_JSON_PROMPT.lastIndexOf("}");
    const result = parsePrizeImport(PRIZE_JSON_PROMPT.slice(start, end + 1));
    expect(result.ok).toBe(true);
  });
});
