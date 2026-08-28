import { buildMermaidThemeVariables } from "./mermaidTheme";
import type { MermaidColorToken } from "./mermaidTheme";

/**
 * mermaid 运行时封装：懒加载 mermaid、按当前主题配置一次全局参数、渲染 SVG。
 *
 * mermaid 体积较大（约 500KB gzip），所以只在页面上真的存在
 * <mermaid-diagram> 且元素进入 DOM 时才动态 import——加密文章解密后
 * 才注入内容，页面级扫描会漏掉，因此加载时机交给元素自己决定。
 */

type MermaidApi = typeof import("mermaid").default;

let mermaidLoader: Promise<MermaidApi> | null = null;
let configuredThemeSignature = "";
let renderSequence = 0;

/** 当前主题标识，深浅色切换时用它判断是否需要重新 initialize */
export function themeSignature(): string {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme ?? "light";
}

function loadMermaid(): Promise<MermaidApi> {
  mermaidLoader ??= import("mermaid").then((module) => module.default);
  return mermaidLoader;
}

function createTokenResolver(): (token: MermaidColorToken) => string {
  const computed = globalThis.getComputedStyle(document.documentElement);
  return (token) => computed.getPropertyValue(token);
}

/** 正文字体堆叠由 src/styles/font.css 定义在 :root 上（var() 会在 computed value 阶段展开） */
function readFontFamily(): string | undefined {
  const family = globalThis
    .getComputedStyle(document.documentElement)
    .getPropertyValue("--pf-font")
    .trim();
  return family || undefined;
}

function configure(mermaid: MermaidApi): void {
  const signature = themeSignature();
  if (configuredThemeSignature === signature) return;

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    themeVariables: buildMermaidThemeVariables(createTokenResolver(), {
      fontFamily: readFontFamily(),
      fontSize: "15px",
    }),
    flowchart: { curve: "basis", useMaxWidth: true, htmlLabels: true },
    sequence: { useMaxWidth: true },
    gantt: { useMaxWidth: true },
  });

  configuredThemeSignature = signature;
}

/** 语法校验：失败时抛出 mermaid 的原始错误信息 */
export async function parseMermaid(code: string): Promise<void> {
  const mermaid = await loadMermaid();
  configure(mermaid);
  await mermaid.parse(code);
}

export async function renderMermaidSvg(code: string): Promise<string> {
  const mermaid = await loadMermaid();
  configure(mermaid);

  renderSequence += 1;
  const id = `mermaid-diagram-${renderSequence}`;

  try {
    const { svg } = await mermaid.render(id, code);
    return svg;
  } finally {
    // 渲染失败时 mermaid 可能把临时测量节点留在 body 上
    document.querySelector(`#d${id}`)?.remove();
  }
}
