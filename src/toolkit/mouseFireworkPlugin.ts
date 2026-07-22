import type { PluginManifest } from "@hyacine/core";

export interface MouseFireworkOptions {
  /**
   * 愛心顏色陣列
   * @default 粉／米／薄荷／藍綠四色
   */
  colors?: string[];

  /**
   * 每次點擊噴出的愛心數量
   * @default 6
   */
  count?: number;

  /**
   * 愛心半徑
   * @default 20
   */
  radius?: number;
}

const DEFAULT_COLORS = [
  "rgba(255,182,185,.9)",
  "rgba(250,227,217,.9)",
  "rgba(187,222,214,.9)",
  "rgba(138,198,209,.9)",
];

/**
 * 點擊愛心特效（本地 runtime-only 插件）。
 * 形狀（HeartEntity）寫死在 runtime 檔中，因為插件 options 必須可序列化，
 * 無法傳遞類別；透過 options 可調整的只有 colors / count / radius。
 */
export default function MouseFirework(options: MouseFireworkOptions = {}): PluginManifest {
  return {
    name: "local-mouse-firework",
    version: "0.0.1",
    minRenderCapability: "runtime-only",
    entry: [
      {
        type: "runtime-only",
        injectPoint: "layout",
        path: new URL("./mouseFireworkRuntime.ts", import.meta.url).href,
        name: "local-mouse-firework-runtime",
        options: {
          colors: options.colors ?? DEFAULT_COLORS,
          count: options.count ?? 6,
          radius: options.radius ?? 20,
        },
      },
    ],
  };
}
