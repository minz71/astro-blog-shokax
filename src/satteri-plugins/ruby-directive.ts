import {
  defineMdastPlugin,
  type MdastPluginDefinition,
  type MdastVisitorContext,
  type MdxJsxTextElement,
} from "satteri";

/**
 * ruby-directive（satteri 版）：
 * 将 :ruby[文本(注音)] 行内指令转换为 <ruby> HTML 元素
 *
 * 等价于 remark-ruby-directive，适配 satteri 插件 API：
 * - 订阅 textDirective visitor（需要 features.directive: true）
 * - 通过 ctx.replaceNode 输出 HTML
 *
 * 输出方式按文件类型分两条路径：
 * - .md：替换为 { rawHtml }，Rust 侧按 markdown 重新解析，HTML 原样输出
 * - .mdx：替换为带 set:html 属性的 mdxJsxTextElement（Astro jsx-runtime
 *   会把 set:html 渲染为原始 HTML）
 *
 * .mdx 不能走 rawHtml：satteri 0.9.4 的原生层对 RAW_HTML 载荷的重新解析
 * 只在 handle 的首次 apply 时使用 MDX 模式；只要前面有任何插件做过声明式
 * 变更（如 auto-import 注入 mdxjsEsm、emoji 替换 text 节点），后续 apply
 * 的 rawHtml 会退回 markdown 模式解析，HTML 标签被编译成转义文本，
 * 页面上直接显示 <ruby ... 源码。set:html 属性是纯字符串，
 * 不经过重新解析，因此与插件顺序无关。
 *
 * 支持的语法：
 *   :ruby[とある科学の超電磁砲(レールガン)]
 *   :ruby[とある科学の超電磁砲（レールガン）]  （全角括号）
 *
 * 约束（与 remark-ruby-directive 一致）：
 * - 正文不能包含空格
 * - 只能有一对括号
 * - 括号不能嵌套
 *
 * 渲染结果：
 *   <ruby data-ruby="注音">正文<rp>(</rp><rt>注音</rt><rp>)</rp></ruby>
 */

// 匹配 "正文(注音)" 格式，支持全角/半角括号
const RUBY_REGEX = /^([^\s(（]+)([（(])([^）)]+)([）)])$/;

// 转义 HTML 特殊字符
function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildRubyHtml(value: string, ruby: string): string {
  const escapedValue = escapeHtml(value);
  const escapedRuby = escapeHtml(ruby);
  return `<ruby data-ruby="${escapedRuby}">${escapedValue}<rp>(</rp><rt>${escapedRuby}</rt><rp>)</rp></ruby>`;
}

function isMdxFile(ctx: MdastVisitorContext): boolean {
  return ctx.fileURL?.pathname.endsWith(".mdx") ?? false;
}

function jsxWithRawHtml(html: string): MdxJsxTextElement {
  return {
    type: "mdxJsxTextElement",
    name: "span",
    attributes: [{ type: "mdxJsxAttribute", name: "set:html", value: html }],
    children: [],
  };
}

export default function rubyDirective(): MdastPluginDefinition {
  return defineMdastPlugin({
    name: "ruby-directive",
    textDirective(node, ctx) {
      if (node.name !== "ruby") return;

      // 取第一个子节点（必须是 text 节点）
      const firstChild = node.children?.[0];
      if (firstChild?.type !== "text" || typeof firstChild.value !== "string") return;

      const text = firstChild.value;
      const matches = text.match(RUBY_REGEX);
      if (!matches) return;

      const [, value, , ruby] = matches;
      const html = buildRubyHtml(value, ruby);
      ctx.replaceNode(node, isMdxFile(ctx) ? jsxWithRawHtml(html) : { rawHtml: html });
    },
  });
}
