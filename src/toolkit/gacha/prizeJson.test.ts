import { describe, expect, it } from "vitest";

import { MAX_PRIZES, MIN_PROBABILITY_PERCENT } from "./state";
import { PRIZE_JSON_PROMPT, parsePrizeImport, serializePrizes } from "./prizeJson";

const CLEAN = JSON.stringify({
  prizes: [
    { name: "SSR 角色", probabilityPercent: 0.6, value: 3000 },
    { name: "SR 武器", probabilityPercent: 5.1, value: 300 },
  ],
  targetPrizeIndex: 1,
  costPerTrial: 60,
});

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

  it("ships an example that the parser itself accepts", () => {
    // 提示词里的范例若解析不了，等于教模型输出坏资料。
    const start = PRIZE_JSON_PROMPT.indexOf("{");
    const end = PRIZE_JSON_PROMPT.lastIndexOf("}");
    const result = parsePrizeImport(PRIZE_JSON_PROMPT.slice(start, end + 1));
    expect(result.ok).toBe(true);
  });
});
