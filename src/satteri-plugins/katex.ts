import katexLib from "katex";
import {
  defineMdastPlugin,
  type MdastPluginDefinition,
  type MdastVisitorContext,
  type MdxJsxFlowElement,
  type MdxJsxTextElement,
} from "satteri";

/**
 * katex（satteri 版）：
 * 将 math/inlineMath 节点通过 KaTeX 渲染为 HTML
 *
 * 等价于 remark 管线中的 remark-math + rehype-katex 组合
 * 需要 features.math: true 在 satteri 配置中开启解析
 *
 * 输出方式按文件类型分两条路径：
 * - .md：返回 { rawHtml }，Rust 侧按 markdown 重新解析，HTML 原样输出
 * - .mdx：返回带 set:html 属性的 mdxJsx 元素（Astro jsx-runtime 会把
 *   set:html 渲染为原始 HTML）
 *
 * katex 必须静态 import：写成 await import("katex") 时，Vite 8 的 module
 * runner 在 MDX transform 阶段已经关闭，整个建置会以
 * 「MDXError: Vite module runner has been closed」直接崩掉（.md 不受影响，
 * 它走的是另一条管线）。
 *
 * .mdx 不能走 rawHtml：satteri 0.9.4 的原生层对 RAW_HTML 载荷的重新解析
 * 只在 handle 的首次 apply 时使用 MDX 模式；只要前面有任何插件做过声明式
 * 变更（如 auto-import 注入 mdxjsEsm、emoji 替换 text 节点），后续 apply
 * 的 rawHtml 会退回 markdown 模式解析，HTML 标签被编译成转义文本，
 * 页面上直接显示 <span class="katex">... 源码。set:html 属性是纯字符串，
 * 不经过重新解析，因此与插件顺序无关。
 */
export interface KatexOptions {
  /** KaTeX 渲染出错时是否抛出异常（默认 false，渲染为错误提示） */
  throwOnError?: boolean;
}

function isMdxFile(ctx: MdastVisitorContext): boolean {
  return ctx.fileURL?.pathname.endsWith(".mdx") ?? false;
}

function jsxWithRawHtml(name: "div", html: string): MdxJsxFlowElement;
function jsxWithRawHtml(name: "span", html: string): MdxJsxTextElement;
function jsxWithRawHtml(name: "div" | "span", html: string): MdxJsxFlowElement | MdxJsxTextElement {
  return {
    type: name === "div" ? "mdxJsxFlowElement" : "mdxJsxTextElement",
    name,
    attributes: [{ type: "mdxJsxAttribute", name: "set:html", value: html }],
    children: [],
  };
}

export default function katex(options: KatexOptions = {}): MdastPluginDefinition {
  const throwOnError = options.throwOnError ?? false;

  async function render(value: string, displayMode: boolean): Promise<string> {
    try {
      return katexLib.renderToString(value, { displayMode, throwOnError });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return `<span class="katex-error">${message}</span>`;
    }
  }

  return defineMdastPlugin({
    name: "katex",
    async math(node, ctx) {
      const html = await render(node.value, true);
      return isMdxFile(ctx) ? jsxWithRawHtml("div", html) : { rawHtml: html };
    },
    async inlineMath(node, ctx) {
      const html = await render(node.value, false);
      return isMdxFile(ctx) ? jsxWithRawHtml("span", html) : { rawHtml: html };
    },
  });
}
