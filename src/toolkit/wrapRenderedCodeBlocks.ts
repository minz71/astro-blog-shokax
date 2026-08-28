const TABLE_PATTERN = /<table(?<attributes>[^>]*)>(?<content>[\s\S]*?)<\/table>/g;

const CODE_BLOCK_PATTERN =
  /<pre(?<attributes>[^>]*\bclass=(?<quote>["'])[^"']*\bastro-code\b[^"']*\k<quote>[^>]*)>(?<content>[\s\S]*?)<\/pre>/g;

export function wrapRenderedCodeBlocks(html: string): string {
  return html
    .replace(CODE_BLOCK_PATTERN, (_match, attributes, _quote, content) => {
      return `<code-block><pre${attributes}>${content}</pre></code-block>`;
    })
    .replace(TABLE_PATTERN, (_match, attributes, content) => {
      return `<div class="table-container"><table${attributes}>${content}</table></div>`;
    });
}
