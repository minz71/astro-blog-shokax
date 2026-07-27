import { cssColorToHexWithCanvas } from "./cssColor";

/**
 * 把 palette.css 中的 --mermaid-* 令牌映射成 mermaid 的 themeVariables。
 *
 * mermaid 只接受具体颜色字符串（内部还要做色彩运算），不能直接吃 var()，
 * 所以这里统一先解析令牌、再落地成 hex；深浅色切换时重新调用即可。
 */

/** palette.css 中约定的 mermaid 颜色令牌 */
export const MERMAID_COLOR_TOKENS = [
  "--mermaid-surface",
  "--mermaid-node-bg",
  "--mermaid-node-border",
  "--mermaid-node-text",
  "--mermaid-secondary-bg",
  "--mermaid-secondary-border",
  "--mermaid-tertiary-bg",
  "--mermaid-tertiary-border",
  "--mermaid-cluster-bg",
  "--mermaid-cluster-border",
  "--mermaid-note-bg",
  "--mermaid-note-border",
  "--mermaid-line",
  "--mermaid-text",
  "--mermaid-title",
  "--mermaid-error",
] as const;

export type MermaidColorToken = (typeof MERMAID_COLOR_TOKENS)[number];

/** 令牌缺失或无法解析时的兜底色，保证图表永远不会退化成纯黑 */
const FALLBACK_COLORS: Record<MermaidColorToken, string> = {
  "--mermaid-surface": "#ffffff",
  "--mermaid-node-bg": "#fdeef4",
  "--mermaid-node-border": "#e5a3bd",
  "--mermaid-node-text": "#4a3540",
  "--mermaid-secondary-bg": "#e8f4f6",
  "--mermaid-secondary-border": "#9cc6cf",
  "--mermaid-tertiary-bg": "#fbf3e0",
  "--mermaid-tertiary-border": "#dcc48a",
  "--mermaid-cluster-bg": "#faf5f7",
  "--mermaid-cluster-border": "#e0cdd5",
  "--mermaid-note-bg": "#fbf3e0",
  "--mermaid-note-border": "#dcc48a",
  "--mermaid-line": "#b08497",
  "--mermaid-text": "#4a4a4a",
  "--mermaid-title": "#b0455f",
  "--mermaid-error": "#d94f4f",
};

export type TokenResolver = (token: MermaidColorToken) => string;

export interface MermaidThemeOptions {
  /** 图表文字字体，缺省时由 mermaid 自行决定 */
  fontFamily?: string;
  /** 图表基准字号，如 "15px" */
  fontSize?: string;
}

/**
 * 读取一组令牌并转成 hex。resolver 只负责取出原始 CSS 值
 * （浏览器端即 getComputedStyle().getPropertyValue()），便于单测替换。
 */
export function resolveMermaidColors(resolve: TokenResolver): Record<MermaidColorToken, string> {
  const colors: Record<MermaidColorToken, string> = { ...FALLBACK_COLORS };
  for (const token of MERMAID_COLOR_TOKENS) {
    const raw = resolve(token)?.trim() ?? "";
    colors[token] = (raw && cssColorToHexWithCanvas(raw)) || FALLBACK_COLORS[token];
  }
  return colors;
}

/**
 * 生成 mermaid `theme: "base"` 下的 themeVariables。
 * 覆盖流程图、时序图、类图/状态图共用的主要色槽，其余由 base 主题自行推导。
 */
export function buildMermaidThemeVariables(
  resolve: TokenResolver,
  options: MermaidThemeOptions = {},
): Record<string, string> {
  const color = resolveMermaidColors(resolve);

  const surface = color["--mermaid-surface"];
  const nodeBg = color["--mermaid-node-bg"];
  const nodeBorder = color["--mermaid-node-border"];
  const nodeText = color["--mermaid-node-text"];
  const secondaryBg = color["--mermaid-secondary-bg"];
  const secondaryBorder = color["--mermaid-secondary-border"];
  const tertiaryBg = color["--mermaid-tertiary-bg"];
  const tertiaryBorder = color["--mermaid-tertiary-border"];
  const clusterBg = color["--mermaid-cluster-bg"];
  const clusterBorder = color["--mermaid-cluster-border"];
  const noteBg = color["--mermaid-note-bg"];
  const noteBorder = color["--mermaid-note-border"];
  const line = color["--mermaid-line"];
  const text = color["--mermaid-text"];
  const title = color["--mermaid-title"];
  const error = color["--mermaid-error"];

  return {
    darkMode: "false",
    background: surface,

    primaryColor: nodeBg,
    primaryBorderColor: nodeBorder,
    primaryTextColor: nodeText,
    secondaryColor: secondaryBg,
    secondaryBorderColor: secondaryBorder,
    secondaryTextColor: nodeText,
    tertiaryColor: tertiaryBg,
    tertiaryBorderColor: tertiaryBorder,
    tertiaryTextColor: nodeText,

    lineColor: line,
    textColor: text,
    titleColor: title,
    mainBkg: nodeBg,
    nodeBorder: nodeBorder,
    nodeTextColor: nodeText,
    clusterBkg: clusterBg,
    clusterBorder: clusterBorder,
    edgeLabelBackground: surface,
    defaultLinkColor: line,

    errorBkgColor: error,
    errorTextColor: surface,

    // 时序图
    actorBkg: nodeBg,
    actorBorder: nodeBorder,
    actorTextColor: nodeText,
    actorLineColor: line,
    signalColor: text,
    signalTextColor: text,
    labelBoxBkgColor: secondaryBg,
    labelBoxBorderColor: secondaryBorder,
    labelTextColor: nodeText,
    loopTextColor: text,
    activationBkgColor: secondaryBg,
    activationBorderColor: secondaryBorder,
    sequenceNumberColor: surface,
    noteBkgColor: noteBg,
    noteBorderColor: noteBorder,
    noteTextColor: text,

    // 类图 / 状态图
    classText: nodeText,
    altBackground: clusterBg,

    ...(options.fontFamily ? { fontFamily: options.fontFamily } : {}),
    ...(options.fontSize ? { fontSize: options.fontSize } : {}),
  };
}
