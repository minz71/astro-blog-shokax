import { describe, expect, it } from "vitest";

import { type ContentFlags } from "./content";
import { collectLinkableTaxonomy, createTaxonomyLookup } from "./taxonomy";

function entry(data: ContentFlags["data"]): ContentFlags {
  return { data };
}

describe("collectLinkableTaxonomy", () => {
  it("只收一般文章的标签与分类", () => {
    const taxonomy = collectLinkableTaxonomy([
      entry({ tags: ["Astro"], categories: ["前端"] }),
      entry({ tool: true, tags: ["WebAssembly"], categories: ["工具"] }),
    ]);

    expect(taxonomy.tagSlugs).toEqual(["astro"]);
    expect(taxonomy.categories).toEqual(["前端"]);
  });

  it("排除草稿的标签与分类", () => {
    const taxonomy = collectLinkableTaxonomy([
      entry({ draft: true, tags: ["Astro"], categories: ["前端"] }),
    ]);

    expect(taxonomy.tagSlugs).toEqual([]);
    expect(taxonomy.categories).toEqual([]);
  });

  it("标签以 toTagSlug 为键，与 /tags/[tag] 的 getStaticPaths 一致", () => {
    const taxonomy = collectLinkableTaxonomy([entry({ tags: ["Oh My Posh", "ShokaX"] })]);

    expect(taxonomy.tagSlugs).toEqual(["oh-my-posh", "shokax"]);
  });

  it("分类保留原字串，与 /categories/[category] 的 getStaticPaths 一致", () => {
    const taxonomy = collectLinkableTaxonomy([entry({ categories: ["ShokaX"] })]);

    expect(taxonomy.categories).toEqual(["ShokaX"]);
  });

  it("去重并排序，缺席与空字串都不进集合", () => {
    const taxonomy = collectLinkableTaxonomy([
      entry({ tags: ["b", "a", "b", ""], categories: ["B", "A", "B", ""] }),
      entry({}),
      entry({ tags: null, categories: null }),
    ]);

    expect(taxonomy.tagSlugs).toEqual(["a", "b"]);
    expect(taxonomy.categories).toEqual(["A", "B"]);
  });
});

describe("createTaxonomyLookup", () => {
  const taxonomy = collectLinkableTaxonomy([
    entry({ tags: ["Astro", "组件"], categories: ["前端"] }),
    entry({ tool: true, tags: ["WebAssembly", "组件"], categories: ["工具", "前端"] }),
  ]);
  const lookup = createTaxonomyLookup(taxonomy);

  it("工具独有的标签不可链接", () => {
    expect(lookup.hasTag("WebAssembly")).toBe(false);
  });

  it("工具与文章共用的标签可链接", () => {
    expect(lookup.hasTag("组件")).toBe(true);
  });

  it("查询走 toTagSlug，大小写与空白不影响命中", () => {
    expect(lookup.hasTag("astro")).toBe(true);
    expect(lookup.hasTag("ASTRO")).toBe(true);
  });

  it("工具独有的分类不可链接，共用的可以", () => {
    expect(lookup.hasCategory("工具")).toBe(false);
    expect(lookup.hasCategory("前端")).toBe(true);
  });

  it("没有传入 taxonomy 时一律不可链接", () => {
    const empty = createTaxonomyLookup();

    expect(empty.hasTag("Astro")).toBe(false);
    expect(empty.hasCategory("前端")).toBe(false);
  });
});
