import {
  defineMdastPlugin,
  type MdastPluginDefinition,
  type MdastVisitorContext,
  type MdxJsxAttributeNode,
} from "satteri";
import {
  buildMermaidBlockHtml,
  buildMermaidInnerHtml,
  parseMermaidTitle,
} from "../toolkit/mermaid/mermaidMarkup.ts";

/**
 * mermaid（satteri 版）：
 * 把 ```mermaid 围栏代码块转换为 <mermaid-diagram> 自定义元素，
 * 绕过 Shiki 高亮，改由 MermaidDiagram.svelte（Layout 中全局注册的
 * custom element）在浏览器端懒加载 mermaid 渲染成 SVG。
 *
 * 输出方式与 katex.ts 同理，按文件类型分两条路径：
 * - .md：返回 { rawHtml }，Rust 侧按 markdown 重新解析，HTML 原样输出
 * - .mdx：返回带 set:html 属性的 mdxJsx 元素
 *
 * .mdx 不能走 rawHtml（satteri 0.9.4 的原生层限制，详见 katex.ts 注释）；
 * 也不能把图表源码作为子节点交给 MDX 解析——mermaid 语法里的 `{}`
 * （如 `A{是否登入?}`）会被当成 JSX 表达式。set:html 是纯字符串属性，
 * 不经过重新解析，两个问题一并规避。
 *
 * 两条路径输出的 DOM 结构保持一致，样式与后处理才有单一形态可依赖；
 * 具体的转义与块级包裹规则见 toolkit/mermaid/mermaidMarkup.ts（有单测）。
 *
 * 语法：
 * ```mermaid
 * graph TD
 *   A[开始] --> B{判断}
 * ```
 *
 * 可选标题（渲染为卡片头部文字，缺省时显示本地化的“图表”）：
 * ```mermaid title="部署流程"
 */
function isMdxFile(ctx: MdastVisitorContext): boolean {
  return ctx.fileURL?.pathname.endsWith(".mdx") ?? false;
}

export default function mermaid(): MdastPluginDefinition {
  return defineMdastPlugin({
    name: "mermaid",
    code(node, ctx) {
      if (node.lang !== "mermaid") return undefined;

      const title = parseMermaidTitle(node.meta);

      if (!isMdxFile(ctx)) {
        return { rawHtml: buildMermaidBlockHtml(node.value, title) };
      }

      const attributes: MdxJsxAttributeNode[] = [
        { type: "mdxJsxAttribute", name: "data-pagefind-ignore", value: "" },
        { type: "mdxJsxAttribute", name: "set:html", value: buildMermaidInnerHtml(node.value) },
      ];
      if (title) {
        attributes.splice(1, 0, {
          type: "mdxJsxAttribute",
          name: "data-title",
          value: title,
        });
      }

      return {
        type: "mdxJsxFlowElement",
        name: "div",
        attributes: [{ type: "mdxJsxAttribute", name: "class", value: "mermaid-block" }],
        children: [
          {
            type: "mdxJsxFlowElement",
            name: "mermaid-diagram",
            attributes,
            children: [],
          },
        ],
      };
    },
  });
}
