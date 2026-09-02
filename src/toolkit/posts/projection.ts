import type { CollectionEntry } from "astro:content";

import { toCategoryHref, toContentHref } from "./url";

/**
 * Post 中间投影：各消费端 DTO（TransformedIndexPost / WidgetPost / RelatedPost 等）
 * 共有的基础字段。数据源始终是 CollectionEntry<"posts"> 规范数据。
 *
 * url 走 toContentHref：工具与一般文章共用同一套列表元件（工具页也是文章形式
 * 浏览），所以投影层不能写死 `/posts/`——型别由 frontmatter 的 tool 决定。
 */
export interface PostProjection {
  slug: string;
  title: string;
  url: string;
  date: Date;
  /** 最深一层分类（若有） */
  category?: string;
  categoryUrl?: string;
}

export function toPostProjection(post: CollectionEntry<"posts">): PostProjection {
  const lastCategory = post.data.categories?.at(-1);

  return {
    slug: post.id,
    title: post.data.title,
    url: toContentHref(post),
    date: post.data.date,
    category: lastCategory,
    categoryUrl: lastCategory ? toCategoryHref(lastCategory) : undefined,
  };
}
