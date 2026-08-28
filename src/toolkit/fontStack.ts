import type { Locale } from "@/i18n";
import { DEFAULT_LOCALE } from "@/toolkit/i18n/resolveLocale";

/**
 * 子集外的字（生僻字、评论区等运行时才拿到的文本）该落到哪套系统字体。
 *
 * 必须按 locale 分：vite-plugin-font 生成的 metric 对齐字体是
 * local("Microsoft YaHei") + size-adjust，一旦排在这些之前，
 * 繁中站的子集外字会全部渲染成简中字形。
 */
const SC_FALLBACK = [
  '"Microsoft YaHei"',
  '"PingFang SC"',
  '"Noto Sans SC"',
  '"Source Han Sans SC"',
];

const LANG_FALLBACK: Record<Locale, readonly string[]> = {
  "zh-CN": SC_FALLBACK,
  "zh-TW": ['"Microsoft JhengHei"', '"PingFang TC"', '"Noto Sans TC"', '"Source Han Sans TC"'],
  ja: ['"Yu Gothic"', '"Hiragino Sans"', '"Hiragino Kaku Gothic ProN"', '"Noto Sans JP"'],
  // en 站的正文是拉丁字母，但文章里照样可能出现 CJK，所以后面仍接一套 CJK 兜底
  en: ["ui-sans-serif", "system-ui", '"Segoe UI"', "Roboto", ...SC_FALLBACK],
};

const GENERIC_MONO = ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", '"Courier New"'];

/**
 * cn-font-split 给的是没加引号的字体名。含数字或空格的字体名（如
 * "jf-openhuninn-2.1"）不加引号会让整条 font-family 声明失效。
 */
export function quoteFamily(family: string): string {
  return /^["']/.test(family) ? family : `"${family}"`;
}

export interface FontStackInput {
  locale: Locale;
  /** vite-plugin-font 从正文字体文件读出的 family */
  primaryFamily?: string;
  /** vite-plugin-font 从等宽字体文件读出的 family */
  monoFamily?: string;
  /** vite-plugin-font 生成的 metric 对齐字体堆叠（名字带构建期 hash） */
  metricFallback?: string;
}

export interface FontStacks {
  body: string;
  mono: string;
}

/**
 * 在构建期把完整堆叠算出来，而不是在 CSS 里靠 var() 拼。
 *
 * 字体名是 vite-plugin-font 构建期从字体文件读出来的（metric 对齐字体名还带
 * hash），静态 CSS 里写不出来，所以只能在这里拼好再注入 <head>。
 *
 * 注：dev 上这段原本还有一条理由——@playform/inline 的 Beasties 需要看到字面的
 * 字体名才会把 @font-face 一起内联。2.0 已移除 @playform/inline（见 a7da8ba），
 * 那条理由不再成立；改由 astro.config 的 fontDisplay: "swap" 兜底。
 */
export function buildFontStacks({
  locale,
  primaryFamily,
  monoFamily,
  metricFallback,
}: FontStackInput): FontStacks {
  const langFallback = LANG_FALLBACK[locale] ?? LANG_FALLBACK[DEFAULT_LOCALE];
  // family 缺席时（插件没生成）整条堆叠仍要是合法的，不能留空槽
  const primary = primaryFamily ? quoteFamily(primaryFamily) : undefined;
  const mono = monoFamily ? quoteFamily(monoFamily) : undefined;

  return {
    body: [primary, ...langFallback, metricFallback, "sans-serif"].filter(Boolean).join(", "),
    mono: [mono, ...GENERIC_MONO, ...langFallback, "monospace"].filter(Boolean).join(", "),
  };
}
