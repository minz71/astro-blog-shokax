import { filterPublishableGeneralArticles, type ContentFlags } from "./content";
import { toTagSlug } from "./url";

/**
 * 「这个 taxonomy 页会不会被产生」的建置期索引。
 *
 * `/tags/[tag]` 与 `/categories/[category]` 的 getStaticPaths 都只从
 * `filterPublishableGeneralArticles()` 取来源集合——工具不在其中。但工具详情页
 * 照样渲染面包屑与标签，于是工具若用了没有任何一般文章使用的分类或标签，链接就
 * 指向一个根本不存在的页面。
 *
 * 这里把「哪些 taxonomy 页真的存在」算出来，交给呈现层决定要渲染成链接还是纯文字。
 * 判准与两个路由的 getStaticPaths 必须一致：标签以 `toTagSlug()` 为键、分类以
 * 原字串为键。
 */
export interface LinkableTaxonomy {
  /** 已产生 `/tags/<slug>/` 的标签 slug */
  tagSlugs: string[];
  /** 已产生 `/categories/<name>/` 的分类原名 */
  categories: string[];
}

export interface TaxonomyLookup {
  hasTag(tag: string): boolean;
  hasCategory(category: string): boolean;
}

/**
 * 保持纯函式：吃结构型别而非 CollectionEntry，呼叫端自己 getCollection。
 * 输出排序过，让建置产物与快照测试稳定。
 */
export function collectLinkableTaxonomy(entries: readonly ContentFlags[]): LinkableTaxonomy {
  const tagSlugs = new Set<string>();
  const categories = new Set<string>();

  for (const entry of filterPublishableGeneralArticles(entries)) {
    for (const tag of entry.data.tags ?? []) {
      const slug = toTagSlug(tag);
      // 空 slug 不对应任何 /tags/<slug>/，当作不可链接
      if (slug) {
        tagSlugs.add(slug);
      }
    }

    for (const category of entry.data.categories ?? []) {
      if (category) {
        categories.add(category);
      }
    }
  }

  return {
    tagSlugs: [...tagSlugs].toSorted(),
    categories: [...categories].toSorted(),
  };
}

/** 建一次 Set 反复查询，避免每个标签都扫一次阵列。 */
export function createTaxonomyLookup(taxonomy?: LinkableTaxonomy): TaxonomyLookup {
  const tagSlugs = new Set(taxonomy?.tagSlugs ?? []);
  const categories = new Set(taxonomy?.categories ?? []);

  return {
    hasTag: (tag) => tagSlugs.has(toTagSlug(tag)),
    hasCategory: (category) => categories.has(category),
  };
}
