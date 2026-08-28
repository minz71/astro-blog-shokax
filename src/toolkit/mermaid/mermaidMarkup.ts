/**
 * mermaid 围栏 → HTML 的纯字符串处理，供 satteri 插件在构建期调用。
 * 抽到 toolkit 里是因为这两条规则都很容易被后来的改动踩坏，需要单测守住。
 */

const TITLE_META_RE = /(?:^|\s)title=(?:"([^"]*)"|'([^']*)'|(\S+))/;

export function escapeHtmlText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function escapeHtmlAttribute(value: string): string {
  return escapeHtmlText(value).replaceAll('"', "&quot;");
}

/** 从围栏 meta 中提取 title="..."，没有则返回空字符串 */
export function parseMermaidTitle(meta: string | null | undefined): string {
  if (!meta) return "";
  const matched = TITLE_META_RE.exec(meta);
  if (!matched) return "";
  return matched[1] ?? matched[2] ?? matched[3] ?? "";
}

/**
 * 生成 <mermaid-diagram> 的内部 HTML：未渲染前即为无脚本回退内容。
 *
 * 换行统一编码成 &#10;，让整段 HTML 保持单行。.md 路径的 rawHtml 会被
 * Rust 侧按 markdown 重新解析，CommonMark 的 HTML 块（type 6）遇到空行
 * 即终止——图表源码里只要有一个空行，后半段就会退回 markdown 解析，
 * `-->` 被智能标点改写成 `–>`，mermaid 语法随即失效。
 */
export function buildMermaidInnerHtml(source: string): string {
  const escaped = escapeHtmlText(source).replaceAll("\r\n", "\n").replaceAll("\n", "&#10;");
  return `<pre class="mermaid-source">${escaped}</pre>`;
}

/** 完整的 .md 输出（外层块级标签见 buildMermaidBlockHtml 的注释） */
export function buildMermaidBlockHtml(source: string, title: string): string {
  const titleAttribute = title ? ` data-title="${escapeHtmlAttribute(title)}"` : "";
  // 外层必须是 div 等块级标签：<mermaid-diagram> 不在 CommonMark 的 HTML 块
  // 标签表里，直接输出会被当成行内 HTML 塞进 <p>，源码再走一次 inline 解析，
  // `-->` 被智能标点改写成 `–>`、引号变成弯引号，mermaid 语法即告失效。
  return (
    `<div class="mermaid-block">` +
    `<mermaid-diagram data-pagefind-ignore${titleAttribute}>${buildMermaidInnerHtml(source)}</mermaid-diagram>` +
    `</div>`
  );
}
