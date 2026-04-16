const CODE_BLOCK_PATTERN =
  /<pre(?<attributes>[^>]*\bclass=(?<quote>["'])[^"']*\bastro-code\b[^"']*\k<quote>[^>]*)>(?<content>[\s\S]*?)<\/pre>/g;
const TABLE_PATTERN = /<table(?<attributes>[^>]*)>(?<content>[\s\S]*?)<\/table>/g;

export function wrapRenderedCodeBlocks(html: string): string {
  return html
    .replace(CODE_BLOCK_PATTERN, (_, attributes = "", _quote, content = "") => {
      return `<code-block><pre${attributes}>${content}</pre></code-block>`;
    })
    .replace(TABLE_PATTERN, (_, attributes = "", content = "") => {
      return `<div class="table-container"><table${attributes}>${content}</table></div>`;
    });
}
