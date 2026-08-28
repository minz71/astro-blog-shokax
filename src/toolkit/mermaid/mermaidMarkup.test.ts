import { describe, expect, it } from "vitest";
import { buildMermaidBlockHtml, buildMermaidInnerHtml, parseMermaidTitle } from "./mermaidMarkup";

describe("parseMermaidTitle", () => {
  it("解析双引号、单引号与裸值", () => {
    expect(parseMermaidTitle('title="部署流程"')).toBe("部署流程");
    expect(parseMermaidTitle("title='部署流程'")).toBe("部署流程");
    expect(parseMermaidTitle("title=部署流程")).toBe("部署流程");
  });

  it("忽略 meta 中的其他内容", () => {
    expect(parseMermaidTitle('foo=1 title="A" bar')).toBe("A");
  });

  it("没有 title 时返回空字符串", () => {
    expect(parseMermaidTitle("")).toBe("");
    expect(parseMermaidTitle(undefined)).toBe("");
    expect(parseMermaidTitle("subtitle=不该命中")).toBe("");
  });
});

describe("buildMermaidInnerHtml", () => {
  it("换行编码成 &#10;，整段保持单行", () => {
    const html = buildMermaidInnerHtml("graph TD\n  A --> B");
    expect(html).not.toContain("\n");
    expect(html).toContain("graph TD&#10;  A --&gt; B");
  });

  it("空行同样编码，不会截断 .md 的 HTML 块", () => {
    // 这是 .md 路径最容易踩的坑：HTML block（type 6）遇到空行即终止
    const html = buildMermaidInnerHtml("graph TD\n  A --> B\n\n  B --> C");
    expect(html).toContain("&#10;&#10;");
    expect(html).not.toMatch(/\n\s*\n/);
  });

  it("CRLF 与 LF 结果一致", () => {
    expect(buildMermaidInnerHtml("A\r\nB")).toBe(buildMermaidInnerHtml("A\nB"));
  });

  it("转义 HTML 特殊字符但保留 mermaid 箭头语义", () => {
    const html = buildMermaidInnerHtml('A["载入 & <渲染>"] --> B');
    expect(html).toContain("&amp;");
    expect(html).toContain("&lt;渲染&gt;");
    // 引号保持直引号，不能被改写
    expect(html).toContain('A["载入');
  });
});

describe("buildMermaidBlockHtml", () => {
  it("最外层是块级 div，避免 .md 把整段当行内 HTML 解析", () => {
    const html = buildMermaidBlockHtml("graph TD", "构建流程");
    expect(html.startsWith('<div class="mermaid-block">')).toBe(true);
    expect(html.endsWith("</div>")).toBe(true);
  });

  it("带上 pagefind 忽略标记与标题属性", () => {
    const html = buildMermaidBlockHtml("graph TD", '含"引号"的标题');
    expect(html).toContain("data-pagefind-ignore");
    expect(html).toContain('data-title="含&quot;引号&quot;的标题"');
  });

  it("没有标题时不输出 data-title", () => {
    expect(buildMermaidBlockHtml("graph TD", "")).not.toContain("data-title");
  });
});
