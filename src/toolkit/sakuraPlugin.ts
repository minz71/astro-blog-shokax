import { definePlugin, type PluginManifest } from "@hyacine/plugin-core";

export interface SakuraOptions {
  /** 樱花数量，默认 30 */
  count?: number;
  /** X 轴飘落速度，默认 0.5 */
  xSpeed?: number;
  /** Y 轴飘落速度，默认 0.5 */
  ySpeed?: number;
  /** 旋转速度，默认 0.03 */
  rSpeed?: number;
  /** 飘落方向，默认 "TopRight" */
  direction?: string;
  /** 樱花图层层级，默认 -1（位于主体内容后方） */
  zIndex?: number;
  /** 樱花脚本来源，默认使用 jsDelivr 指向 sakura-rain */
  scriptSrc?: string;
}

const DEFAULT_SCRIPT_SRC = "https://cdn.jsdelivr.net/gh/minz71/sakura-rain/sakura-rain.js";

// 上游 2.0 没有官方的 sakura 插件，所以实作留在本仓库（见 AGENTS.md
// 「插件的归属」）。写法对齐 @hyacine/plugin-* 的官方插件：definePlugin +
// runtime-only entry，运行期档案不依赖 @hyacine/helper（仍停在 0.0.3 世代）。
export function sakura(options: SakuraOptions = {}): PluginManifest {
  return definePlugin({
    name: "local-sakura",
    version: "0.1.0",
    minRenderCapability: "runtime-only",
    entry: [
      {
        name: "local-sakura-runtime",
        type: "runtime-only",
        injectPoint: "layout",
        path: new URL("./sakuraRuntime.ts", import.meta.url).href,
        options: {
          count: options.count ?? 30,
          xSpeed: options.xSpeed ?? 0.5,
          ySpeed: options.ySpeed ?? 0.5,
          rSpeed: options.rSpeed ?? 0.03,
          direction: options.direction ?? "TopRight",
          zIndex: options.zIndex ?? -1,
          scriptSrc: options.scriptSrc?.trim() || DEFAULT_SCRIPT_SRC,
        },
      },
    ],
  });
}

export default sakura;
