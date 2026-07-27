import { describe, expect, it } from "bun:test";
import {
  MERMAID_COLOR_TOKENS,
  buildMermaidThemeVariables,
  resolveMermaidColors,
} from "./mermaidTheme";

const OKLCH_PALETTE: Record<string, string> = {
  "--mermaid-surface": "oklch(1 0 0)",
  "--mermaid-node-text": "oklch(0 0 0)",
};

describe("resolveMermaidColors", () => {
  it("把 oklch 令牌解析成 hex", () => {
    const colors = resolveMermaidColors((token) => OKLCH_PALETTE[token] ?? "");
    expect(colors["--mermaid-surface"]).toBe("#ffffff");
    expect(colors["--mermaid-node-text"]).toBe("#000000");
  });

  it("令牌缺失时回退到内置颜色而非黑色", () => {
    const colors = resolveMermaidColors(() => "");
    for (const token of MERMAID_COLOR_TOKENS) {
      expect(colors[token]).toMatch(/^#[\da-f]{6}$/);
    }
    expect(colors["--mermaid-line"]).not.toBe("#000000");
  });

  it("无法解析的颜色值同样走回退", () => {
    const colors = resolveMermaidColors(() => "鬼画符");
    expect(colors["--mermaid-surface"]).toBe("#ffffff");
  });
});

describe("buildMermaidThemeVariables", () => {
  it("所有颜色项都是具体色值，不含 var()", () => {
    const variables = buildMermaidThemeVariables((token) => OKLCH_PALETTE[token] ?? "");
    for (const [key, value] of Object.entries(variables)) {
      if (key === "darkMode") continue;
      expect(value).not.toContain("var(");
      expect(value).not.toContain("oklch");
    }
  });

  it("覆盖流程图与时序图的关键色槽", () => {
    const variables = buildMermaidThemeVariables(() => "");
    for (const key of [
      "primaryColor",
      "lineColor",
      "textColor",
      "actorBkg",
      "noteBkgColor",
      "clusterBkg",
    ]) {
      expect(variables[key]).toMatch(/^#[\da-f]{6}$/);
    }
  });

  it("按需注入字体设置", () => {
    const withoutFont = buildMermaidThemeVariables(() => "");
    expect(withoutFont.fontFamily).toBeUndefined();

    // 运行时传进来的是 --pf-font 的完整堆叠，不是单一字体名，
    // 这里用中性的假字体名，换正文字体时这个测试不该跟着改。
    const fontStack = '"Example Sans", "Example Fallback", sans-serif';
    const withFont = buildMermaidThemeVariables(() => "", {
      fontFamily: fontStack,
      fontSize: "15px",
    });
    expect(withFont.fontFamily).toBe(fontStack);
    expect(withFont.fontSize).toBe("15px");
  });
});
