/**
 * 内容型别与渲染模式的分类 helper。
 *
 * 两条正交的轴：
 * - `tool` 决定内容型别（工具／一般文章），是唯一的声明来源
 * - `clientIsland` 决定渲染模式（interactive／static）
 *
 * 这里刻意不呼叫 getCollection：保持纯函式、可单元测试，也强迫每个查询入口
 * 自己在排序／分页／聚合之前先分流，而不是让下游元件各自猜测型别。
 */

/**
 * 分类所需的最小 entry 形状。
 *
 * 用结构型别而非 CollectionEntry<"posts">，让 helper 能被纯单元测试直接餵假资料，
 * 不必载入 astro:content。实际呼叫端传入的 CollectionEntry 会结构相容。
 */
export interface ContentFlags {
  data: {
    tool?: boolean;
    draft?: boolean;
    clientIsland?: boolean;
    categories?: string[] | null;
    tags?: string[] | null;
  };
}

export type ContentRenderMode = "interactive" | "static";

/** 只有严格 `true` 才是工具；缺席与 `false` 都不是。 */
export function isTool(entry: ContentFlags): boolean {
  return entry.data.tool === true;
}

/** 一般文章是工具的反集合。 */
export function isGeneralArticle(entry: ContentFlags): boolean {
  return !isTool(entry);
}

function isPublishable(entry: ContentFlags): boolean {
  return entry.data.draft !== true;
}

export function isPublishableTool(entry: ContentFlags): boolean {
  return isTool(entry) && isPublishable(entry);
}

export function isPublishableGeneralArticle(entry: ContentFlags): boolean {
  return isGeneralArticle(entry) && isPublishable(entry);
}

/**
 * 保留原始相对顺序与 entry 物件本身（不复制、不修改 categories／tags 等 metadata）,
 * 呼叫端之后要自己排序。
 */
export function filterPublishableTools<T extends ContentFlags>(entries: readonly T[]): T[] {
  return entries.filter((entry) => isPublishableTool(entry));
}

export function filterPublishableGeneralArticles<T extends ContentFlags>(
  entries: readonly T[],
): T[] {
  return entries.filter((entry) => isPublishableGeneralArticle(entry));
}

/**
 * 渲染模式只看 `clientIsland`。
 *
 * 不得读取 tool、categories、entry id、目录或 slug——任意 slug 的工具与文章都该能
 * 使用同一套机制（见 AGENTS.md「文章专属组件」）。
 */
export function getContentRenderMode(entry: ContentFlags): ContentRenderMode {
  return entry.data.clientIsland === true ? "interactive" : "static";
}
