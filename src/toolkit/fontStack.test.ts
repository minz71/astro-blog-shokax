import { describe, expect, it } from "vitest";
import { buildFontStacks, quoteFamily } from "./fontStack";

const METRIC_FALLBACK = '"Microsoft YaHei fallback default abc123"';

describe("quoteFamily", () => {
  it("给没引号的字体名加引号（含数字的名字不加引号会让整条声明失效）", () => {
    expect(quoteFamily("jf-openhuninn-2.1")).toBe('"jf-openhuninn-2.1"');
    expect(quoteFamily("Maple Mono CN")).toBe('"Maple Mono CN"');
  });

  it("已经有引号就原样保留", () => {
    expect(quoteFamily('"jf-openhuninn-2.1"')).toBe('"jf-openhuninn-2.1"');
  });
});

describe("buildFontStacks", () => {
  it("语系字体必须排在 metric 对齐字体之前", () => {
    // metric 对齐字体是 local("Microsoft YaHei") + size-adjust，排在前面会让
    // 子集外的字在繁中站全部渲染成简中字形 —— 这正是修复前线上的表现。
    const { body } = buildFontStacks({
      locale: "zh-TW",
      primaryFamily: "jf-openhuninn-2.1",
      monoFamily: "Maple Mono CN",
      metricFallback: METRIC_FALLBACK,
    });

    const families = body.split(", ");
    expect(families.indexOf('"Microsoft JhengHei"')).toBeGreaterThan(-1);
    expect(families.indexOf('"Microsoft JhengHei"')).toBeLessThan(
      families.indexOf(METRIC_FALLBACK),
    );
  });

  it("按 locale 给出对应字形的系统字体", () => {
    const tw = buildFontStacks({ locale: "zh-TW", primaryFamily: "P", monoFamily: "M" });
    const cn = buildFontStacks({ locale: "zh-CN", primaryFamily: "P", monoFamily: "M" });
    const ja = buildFontStacks({ locale: "ja", primaryFamily: "P", monoFamily: "M" });

    expect(tw.body).toContain('"Microsoft JhengHei"');
    expect(tw.body).not.toContain('"Microsoft YaHei"');
    expect(cn.body).toContain('"Microsoft YaHei"');
    expect(cn.body).not.toContain('"Microsoft JhengHei"');
    expect(ja.body).toContain('"Noto Sans JP"');
  });

  it("正文以子集字体开头、以 sans-serif 收尾", () => {
    const { body } = buildFontStacks({
      locale: "zh-TW",
      primaryFamily: "jf-openhuninn-2.1",
      monoFamily: "Maple Mono CN",
      metricFallback: METRIC_FALLBACK,
    });

    expect(body.startsWith('"jf-openhuninn-2.1", ')).toBe(true);
    expect(body.endsWith(", sans-serif")).toBe(true);
  });

  it("等宽以子集等宽字体开头、以 monospace 收尾", () => {
    const { mono } = buildFontStacks({
      locale: "zh-TW",
      primaryFamily: "jf-openhuninn-2.1",
      monoFamily: "Maple Mono CN",
    });

    expect(mono.startsWith('"Maple Mono CN", ')).toBe(true);
    expect(mono.endsWith(", monospace")).toBe(true);
  });

  it("family 缺席时堆叠仍然合法，不留空槽", () => {
    const { body, mono } = buildFontStacks({ locale: "zh-CN" });

    expect(body.split(", ").every((family) => family.length > 0)).toBe(true);
    expect(mono.split(", ").every((family) => family.length > 0)).toBe(true);
    expect(body.startsWith('"Microsoft YaHei"')).toBe(true);
  });
});
