---
title: "ShokaX-櫻花飄落效果"
date: 2026-08-04
description: "在 Astro ShokaX 中以 Hyacine 插件的形式加上櫻花飄落效果。"
tags:
  - "ShokaX插件"
categories:
  - "ShokaX"
cover: "../../assets/images/category-cover/shokax.avif"
---

# 介紹

![](/images/shokaX/sakuraScript.webp "添加櫻花掉落的效果")

使用: https://github.com/minz71/sakura-rain

Astro ShokaX 交給主題的 Hyacine 插件系統處理，跟 site-uptime、點擊特效一致。插件是 **runtime-only** 型別，由兩個檔案組成：

- manifest：在 **build 期**由 `hyacine.plugin.ts` 讀取，宣告注入點與選項，並指向 runtime 檔
- runtime：實際跑在瀏覽器的邏輯，匯出 `init(options)`

# 做法

## 1. 建立插件 manifest：`src/toolkit/sakuraPlugin.ts`

```ts src/toolkit/sakuraPlugin.ts
import type { PluginManifest } from "@hyacine/core";

export interface SakuraOptions {
  /** 櫻花數量，預設 30 */
  count?: number;
  /** X 軸飄落速度，預設 0.5 */
  xSpeed?: number;
  /** Y 軸飄落速度，預設 0.5 */
  ySpeed?: number;
  /** 旋轉速度，預設 0.03 */
  rSpeed?: number;
  /** 飄落方向，預設 "TopRight" */
  direction?: string;
  /** 櫻花圖層層級，預設 -1（位於主體內容後方） */
  zIndex?: number;
  /** 櫻花腳本來源，預設走 jsDelivr */
  scriptSrc?: string;
}

const DEFAULT_SCRIPT_SRC = "https://cdn.jsdelivr.net/gh/minz71/sakura-rain/sakura-rain.js";

export default function Sakura(options: SakuraOptions = {}): PluginManifest {
  return {
    name: "local-sakura",
    version: "0.0.1",
    minRenderCapability: "runtime-only",
    entry: [
      {
        type: "runtime-only",
        injectPoint: "layout",
        path: new URL("./sakuraRuntime.ts", import.meta.url).href,
        name: "local-sakura-runtime",
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
  };
}
```

## 2. 建立插件 runtime：`src/toolkit/sakuraRuntime.ts`

```ts src/toolkit/sakuraRuntime.ts
import { injectScript, type PluginInitFunction } from "@hyacine/helper/runtime";

interface SakuraRuntimeOptions {
  count: number;
  xSpeed: number;
  ySpeed: number;
  rSpeed: number;
  direction: string;
  zIndex: number;
  scriptSrc: string;
}

declare global {
  interface Window {
    __shokaxSakuraBound?: boolean;
    sakuraConfig?: {
      sakura: number;
      xSpeed: number;
      ySpeed: number;
      rSpeed: number;
      direction: string;
      zIndex: number;
    };
  }
}

const SAKURA_SCRIPT_ID = "shokax-sakura-script";

const startSakura = (options: SakuraRuntimeOptions) => {
  if (typeof window === "undefined" || window.__shokaxSakuraBound) {
    return;
  }

  // sakura-rain 從 window.sakuraConfig 讀取參數，必須在腳本載入前寫入
  window.sakuraConfig = {
    sakura: options.count,
    xSpeed: options.xSpeed,
    ySpeed: options.ySpeed,
    rSpeed: options.rSpeed,
    direction: options.direction,
    zIndex: options.zIndex,
  };

  window.__shokaxSakuraBound = true;

  if (document.getElementById(SAKURA_SCRIPT_ID)) {
    return;
  }

  injectScript({
    src: options.scriptSrc,
    defer: true,
    attributes: { id: SAKURA_SCRIPT_ID },
  });
};

export const init: PluginInitFunction<SakuraRuntimeOptions> = (options) => {
  // 插件系統在頁面腳本頂層立即呼叫 init，此時 DOM 可能尚未就緒
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => startSakura(options), {
      once: true,
    });
  } else {
    startSakura(options);
  }

  // 避免日後啟用 ClientRouter（View Transitions），模組腳本不會重跑
  document.addEventListener("astro:page-load", () => startSakura(options));
};
```

## 3. 在 hyacine.plugin.ts 註冊

```ts hyacine.plugin.ts
import Sakura from "./src/toolkit/sakuraPlugin";

export default defineConfig({
  // ...
  plugins: [
    // ...其他插件
    // 櫻花飄落效果，移除本區塊即可關閉
    Sakura({
      count: 30,
      xSpeed: 0.5,
      ySpeed: 0.5,
      rSpeed: 0.03,
      direction: "TopRight",
      zIndex: -1,
      scriptSrc: "https://cdn.jsdelivr.net/gh/minz71/sakura-rain/sakura-rain.js",
    }),
  ],
});
```
