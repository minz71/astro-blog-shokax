import { definePlugin, type PluginManifest } from "@hyacine/plugin-core";

export interface MouseFireworkOptions {
  /** 愛心顏色陣列 */
  colors?: string[];
  /** 每次點擊噴出的愛心數量 */
  count?: number;
  /** 愛心半徑 */
  radius?: number;
}

const DEFAULT_COLORS = [
  "rgba(255,182,185,.9)",
  "rgba(250,227,217,.9)",
  "rgba(187,222,214,.9)",
  "rgba(138,198,209,.9)",
];

/**
 * 點擊愛心特效。Hyacine 官方包裝插件只提供圓點，因此由主題保留
 * runtime-only 包裝，並在瀏覽器端向 mouse-firework 註冊愛心 Entity；
 * manifest options 只放可序列化的顏色與尺寸設定。
 */
export function mouseFirework(options: MouseFireworkOptions = {}): PluginManifest {
  return definePlugin({
    name: "local-mouse-firework",
    version: "0.1.0",
    minRenderCapability: "runtime-only",
    entry: [
      {
        name: "local-mouse-firework-runtime",
        type: "runtime-only",
        injectPoint: "layout",
        path: new URL("./mouseFireworkRuntime.ts", import.meta.url).href,
        options: {
          colors: options.colors ?? DEFAULT_COLORS,
          count: options.count ?? 6,
          radius: options.radius ?? 20,
        },
      },
    ],
  });
}

export default mouseFirework;
