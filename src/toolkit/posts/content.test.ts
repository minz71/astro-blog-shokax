import { describe, expect, it } from "vitest";

import {
  type ContentFlags,
  filterPublishableGeneralArticles,
  filterPublishableTools,
  getContentRenderMode,
  isGeneralArticle,
  isPublishableGeneralArticle,
  isPublishableTool,
  isTool,
} from "./content";
import { createSeededRandom, type SeededRandom } from "../testing/seededRandom";

const PROPERTY_RUNS = 100;

interface TestEntry extends ContentFlags {
  id: string;
  data: {
    tool?: boolean;
    draft?: boolean;
    clientIsland?: boolean;
    categories?: string[] | null;
    tags?: string[] | null;
  };
}

/** 三态：栏位缺席 / false / true，覆盖「缺席与 false 等价」这条语意。 */
const TRISTATE: (boolean | undefined)[] = [undefined, false, true];

function entry(id: string, data: TestEntry["data"] = {}): TestEntry {
  return { id, data };
}

function randomEntry(random: SeededRandom, id: string): TestEntry {
  const data: TestEntry["data"] = {};

  const tool = random.pick(TRISTATE);
  if (tool !== undefined) {
    data.tool = tool;
  }

  const draft = random.pick(TRISTATE);
  if (draft !== undefined) {
    data.draft = draft;
  }

  const clientIsland = random.pick(TRISTATE);
  if (clientIsland !== undefined) {
    data.clientIsland = clientIsland;
  }

  const categoryPool = ["AI", "tool", "other", "CS"];
  const tagPool = ["astro", "solid", "unocss"];
  data.categories = random.bool(0.2)
    ? null
    : Array.from({ length: random.int(0, 2) }, () => random.pick(categoryPool));
  data.tags = random.bool(0.2)
    ? null
    : Array.from({ length: random.int(0, 2) }, () => random.pick(tagPool));

  return { id, data };
}

/** 聚合出 taxonomy 计数，用来断言污染物不改变一般文章流的统计。 */
function countTaxonomy(items: TestEntry[]) {
  const categories = new Set<string>();
  const tags = new Set<string>();

  for (const item of items) {
    item.data.categories?.forEach((c) => categories.add(c));
    item.data.tags?.forEach((t) => tags.add(t));
  }

  return { categories: categories.size, tags: tags.size, posts: items.length };
}

function randomEntries(random: SeededRandom, count: number, prefix = "e"): TestEntry[] {
  return Array.from({ length: count }, (_, index) => randomEntry(random, `${prefix}${index}`));
}

describe("isTool / isGeneralArticle", () => {
  it("只有严格 true 才是工具", () => {
    expect(isTool(entry("a", { tool: true }))).toBe(true);
    expect(isTool(entry("b", { tool: false }))).toBe(false);
    expect(isTool(entry("c"))).toBe(false);
  });

  it("一般文章是工具的反集合", () => {
    for (const tool of TRISTATE) {
      const target = entry("x", tool === undefined ? {} : { tool });
      expect(isGeneralArticle(target)).toBe(!isTool(target));
    }
  });

  it("categories、tags、id 不参与型别判定", () => {
    const asTool = entry("tool/anything", {
      tool: true,
      categories: ["tool"],
      tags: ["tool"],
    });
    const asArticle = entry("tool/anything", {
      categories: ["tool"],
      tags: ["tool"],
    });

    expect(isTool(asTool)).toBe(true);
    expect(isTool(asArticle)).toBe(false);
  });
});

describe("isPublishableTool / isPublishableGeneralArticle", () => {
  it("草稿不算公开内容", () => {
    expect(isPublishableTool(entry("a", { tool: true, draft: true }))).toBe(false);
    expect(isPublishableTool(entry("b", { tool: true, draft: false }))).toBe(true);
    expect(isPublishableTool(entry("c", { tool: true }))).toBe(true);
    expect(isPublishableGeneralArticle(entry("d", { draft: true }))).toBe(false);
    expect(isPublishableGeneralArticle(entry("e", { draft: false }))).toBe(true);
    expect(isPublishableGeneralArticle(entry("f"))).toBe(true);
  });

  it("两个 publishable 判定互斥", () => {
    for (const tool of TRISTATE) {
      for (const draft of TRISTATE) {
        const target = entry("x", {
          ...(tool === undefined ? {} : { tool }),
          ...(draft === undefined ? {} : { draft }),
        });

        expect(isPublishableTool(target) && isPublishableGeneralArticle(target)).toBe(false);
      }
    }
  });
});

describe("filterPublishableTools / filterPublishableGeneralArticles", () => {
  it("空集合回传空数组", () => {
    expect(filterPublishableTools([])).toEqual([]);
    expect(filterPublishableGeneralArticles([])).toEqual([]);
  });

  it("保留原始 entry 参照，不复制物件", () => {
    const tool = entry("t", { tool: true });
    const article = entry("a");

    expect(filterPublishableTools([tool, article])[0]).toBe(tool);
    expect(filterPublishableGeneralArticles([tool, article])[0]).toBe(article);
  });

  it("不修改 categories 与 tags", () => {
    const categories = ["AI"];
    const tags = ["astro"];
    const tool = entry("t", { tool: true, categories, tags });

    filterPublishableTools([tool]);

    expect(tool.data.categories).toBe(categories);
    expect(tool.data.tags).toBe(tags);
    expect(categories).toEqual(["AI"]);
    expect(tags).toEqual(["astro"]);
  });

  it("重复传入同一个 entry 参照时按出现次数保留", () => {
    const tool = entry("t", { tool: true });

    expect(filterPublishableTools([tool, tool])).toEqual([tool, tool]);
  });
});

describe("getContentRenderMode", () => {
  it("只有严格 true 才 interactive", () => {
    expect(getContentRenderMode(entry("a", { clientIsland: true }))).toBe("interactive");
    expect(getContentRenderMode(entry("b", { clientIsland: false }))).toBe("static");
    expect(getContentRenderMode(entry("c"))).toBe("static");
  });

  it("工具与文章使用同一套判定", () => {
    expect(getContentRenderMode(entry("t", { tool: true, clientIsland: true }))).toBe(
      "interactive",
    );
    expect(getContentRenderMode(entry("a", { clientIsland: true }))).toBe("interactive");
    expect(getContentRenderMode(entry("t2", { tool: true }))).toBe("static");
  });
});

describe("property tests", () => {
  it("Feature: dedicated-tools-page, Property 1: 内容型别只由 Tool Declaration 决定", () => {
    for (let run = 0; run < PROPERTY_RUNS; run += 1) {
      const random = createSeededRandom(0x1000 + run);
      const original = randomEntry(random, `p1-${run}`);
      const expected = original.data.tool === true;

      expect(isTool(original)).toBe(expected);
      expect(isGeneralArticle(original)).toBe(!expected);

      // 对 tool 以外的栏位做任意修改，型别不得改变
      const mutated: TestEntry = {
        id: `${original.id}-mutated/${random.int(0, 999)}`,
        data: {
          ...original.data,
          categories: random.bool(0.5)
            ? null
            : Array.from({ length: random.int(0, 3) }, () =>
                random.pick(["tool", "tools", "AI", "misc"]),
              ),
          tags: random.bool(0.5) ? null : ["tool", random.pick(["a", "b"])],
          draft: random.bool(),
          clientIsland: random.bool(),
        },
      };

      expect(isTool(mutated)).toBe(expected);
      expect(isGeneralArticle(mutated)).toBe(!expected);

      // 分类过程不修改 taxonomy metadata
      const categoriesBefore = original.data.categories;
      const tagsBefore = original.data.tags;
      filterPublishableTools([original]);
      filterPublishableGeneralArticles([original]);
      expect(original.data.categories).toBe(categoriesBefore);
      expect(original.data.tags).toBe(tagsBefore);
    }
  });

  it("Feature: dedicated-tools-page, Property 2: 公开工具筛选精确且不重复", () => {
    for (let run = 0; run < PROPERTY_RUNS; run += 1) {
      const random = createSeededRandom(0x2000 + run);
      const entries = randomEntries(random, random.int(0, 20), `p2-${run}-`);
      const filtered = filterPublishableTools(entries);

      const expected = entries.filter((e) => e.data.tool === true && e.data.draft !== true);

      // 恰好包含所有且仅包含公开工具
      expect(filtered).toEqual(expected);

      // 每个输入 entry 最多出现一次
      expect(new Set(filtered).size).toBe(filtered.length);

      // 保留原始相对顺序
      const filteredIds = new Set(filtered.map((e) => e.id));
      expect(filtered.map((e) => e.id)).toEqual(
        entries.map((e) => e.id).filter((id) => filteredIds.has(id)),
      );
    }
  });

  it("Feature: dedicated-tools-page, Property 3: 一般文章流对工具与草稿具有抗污染性", () => {
    for (let run = 0; run < PROPERTY_RUNS; run += 1) {
      const random = createSeededRandom(0x3000 + run);

      // 基准：一批公开一般文章
      const baseline: TestEntry[] = Array.from({ length: random.int(1, 8) }, (_, index) => ({
        id: `p3-${run}-base${index}`,
        data: {
          categories: Array.from({ length: random.int(0, 2) }, () =>
            random.pick(["AI", "CS", "other"]),
          ),
          tags: Array.from({ length: random.int(0, 2) }, () => random.pick(["astro", "solid"])),
          ...(random.bool(0.3) ? { tool: false } : {}),
          ...(random.bool(0.3) ? { draft: false } : {}),
        },
      }));

      // 污染物：任意数量的工具与草稿
      const pollutants: TestEntry[] = Array.from({ length: random.int(1, 10) }, (_, index) => ({
        id: `p3-${run}-poison${index}`,
        data: random.bool()
          ? { tool: true, ...(random.bool() ? { draft: true } : {}) }
          : { draft: true, ...(random.bool() ? { tool: false } : {}) },
      }));

      const before = filterPublishableGeneralArticles(baseline);
      const after = filterPublishableGeneralArticles(random.shuffle([...baseline, ...pollutants]));

      // 集合相同（顺序由呼叫端自己排序，这里比对内容）
      expect(new Set(after)).toEqual(new Set(before));
      expect(after.length).toBe(before.length);

      // taxonomy 计数与文章数不受污染
      expect(countTaxonomy(after)).toEqual(countTaxonomy(before));
    }
  });

  it("Feature: dedicated-tools-page, Property 6: 渲染模式只由 Client Island Declaration 决定", () => {
    for (let run = 0; run < PROPERTY_RUNS; run += 1) {
      const random = createSeededRandom(0x6000 + run);
      const original = randomEntry(random, `p6-${run}`);
      const expectedMode = original.data.clientIsland === true ? "interactive" : "static";
      const expectedIsTool = isTool(original);

      expect(getContentRenderMode(original)).toBe(expectedMode);

      // 改 slug / tool / categories 等栏位，渲染模式不变
      const modeInvariant: TestEntry = {
        id: `${random.pick(["tool/", "posts/", ""])}${original.id}-${random.int(0, 99)}`,
        data: {
          ...original.data,
          tool: random.bool(),
          categories: random.bool(0.5) ? null : ["tool"],
          tags: random.bool(0.5) ? null : ["tool"],
        },
      };
      expect(getContentRenderMode(modeInvariant)).toBe(expectedMode);

      // 改 clientIsland，型别不变
      const typeInvariant: TestEntry = {
        id: original.id,
        data: { ...original.data, clientIsland: original.data.clientIsland !== true },
      };
      expect(isTool(typeInvariant)).toBe(expectedIsTool);
    }
  });
});
