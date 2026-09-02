import { isTool } from "./content";

function trimSlashes(input: string): string {
  return input.replace(/^\/+/g, "").replace(/\/+$/g, "");
}

function removeMarkdownExtension(input: string): string {
  return input.replace(/\.mdx?$/i, "");
}

function encodePathSegments(input: string): string {
  return input
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function toTagSlug(name: string): string {
  const normalized = (name || "").trim().toLowerCase();

  if (!normalized) {
    return "";
  }

  return normalized
    .replaceAll(/[\\/]+/g, "-")
    .replaceAll(/\s+/g, "-")
    .replaceAll(/-+/g, "-")
    .replaceAll(/^-|-$/g, "");
}

export function toTagHref(name: string): string {
  const slug = toTagSlug(name);
  return slug ? `/tags/${encodeURIComponent(slug)}/` : "/tags/";
}

export function toCategoryHref(name: string): string {
  const normalized = (name || "").trim();
  return normalized ? `/categories/${encodeURIComponent(normalized)}/` : "/categories/";
}

export function toPostHref(idOrSlug: string): string {
  const normalized = trimSlashes(removeMarkdownExtension((idOrSlug || "").trim()));

  if (!normalized) {
    return "/posts/";
  }

  return `/posts/${encodePathSegments(normalized)}/`;
}

export function toToolHref(idOrSlug: string): string {
  const normalized = trimSlashes(removeMarkdownExtension((idOrSlug || "").trim()));

  if (!normalized) {
    return "/tools/";
  }

  return `/tools/${encodePathSegments(normalized)}/`;
}

/** toContentHref 只需要 id 与 tool 声明，不要求完整的 CollectionEntry。 */
export interface RoutableContent {
  id: string;
  data: { tool?: boolean };
}

/**
 * 依内容型别选出详情 namespace：工具进 /tools/，一般文章进 /posts/。
 *
 * 任何可能同时拿到两种内容的地方（工具索引、详情 canonical／permalink、卡片、
 * sitemap lastmod）都该用这个，不要自己拼接 `/posts/`。
 */
export function toContentHref(entry: RoutableContent): string {
  return isTool(entry) ? toToolHref(entry.id) : toPostHref(entry.id);
}
