---
title: "Astro ShokaX 點擊愛心效果"
date: 2026-07-25
description: "在 Astro ShokaX 中把預設的點擊圓形特效換成愛心。"
tags:
  - "ShokaX"
categories:
  - "ShokaX"
---

# 介紹

ShokaX Astro 預設就有點擊特效：`hyacine.plugin.ts` 中啟用了 `@hyacine/mouse-firework` 插件，點擊時噴出圓形粒子。它底層用的是 D-Sketon 的 [mouse-firework](https://github.com/D-Sketon/mouse-firework) 套件，支援用 `registerEntity` 註冊自訂形狀（Custom Entity）。

仿照主題自身的做法：site-uptime 就是一個從本地檔案 import 的 runtime-only 插件（`src/toolkit/siteUptimePlugin.ts`）。

- manifest：在 **build 期**由 `hyacine.plugin.ts` 讀取，宣告插件名稱、注入點、選項，並指向 runtime 檔
- runtime：實際執行的邏輯，匯出一個 `init(options)` 函數，會被塞進每一頁的瀏覽器 bundle，插件系統對它只做一件事 —— `import { init } from "<path>"`。所以 `init` 必須待在獨立的模組裡

# 做法

## 1. 移除預設的煙火插件 `@hyacine/mouse-firework`

因為該插件只支援固定形狀，編輯根目錄的 `hyacine.plugin.ts`，刪掉 `@hyacine/mouse-firework` 的 import 與 `plugins` 中的呼叫：

```ts hyacine.plugin.ts
import MouseFirework from "@hyacine/mouse-firework"; // ← 刪除這行

export default defineConfig({
  // ...
  plugins: [
    SiteUpTime({
      // ...保留
    }),
    // ↓ 刪除整個預設 MouseFirework 區塊
    MouseFirework({
      colors: ["rgba(255,182,185,.9)" /* ... */],
      count: 30,
      radius: 16,
    }),
  ],
});
```

## 2. 建立插件 manifest：`src/toolkit/mouseFireworkPlugin.ts`

插件的 `options` 必須可序列化（不能傳類別、函數），原因是它會在 build 期被 `JSON.stringify` 後寫進自動產生的注入檔，大致長這樣：

```js
import { init as init_LocalMouseFireworkRuntime } from ".../mouseFireworkRuntime.ts";
init_LocalMouseFireworkRuntime({
  colors: ["rgba(255,182,185,.9)" /* ... */],
  count: 6,
  radius: 20,
});
```

所以愛心形狀無法透過選項傳遞，只能寫死在 runtime 檔裡。manifest 這層透過 `options` 對外開放的就只有 `colors` / `count` / `radius`：

```ts src/toolkit/mouseFireworkPlugin.ts
import type { PluginManifest } from "@hyacine/core";

export interface MouseFireworkOptions {
  /** 愛心顏色陣列 */
  colors?: string[];
  /** 每次點擊噴出的愛心數量，預設 6 */
  count?: number;
  /** 愛心半徑，預設 20 */
  radius?: number;
}

const DEFAULT_COLORS = [
  "rgba(255,182,185,.9)",
  "rgba(250,227,217,.9)",
  "rgba(187,222,214,.9)",
  "rgba(138,198,209,.9)",
];

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
```

## 3. 建立插件 runtime：`src/toolkit/mouseFireworkRuntime.ts`

愛心形狀繼承 `firework.BaseEntity`，在 `paint()` 裡用 canvas 貝茲曲線畫出來。
runtime 匯出的 `init(options)` 會被插件系統以序列化後的選項呼叫：

```ts src/toolkit/mouseFireworkRuntime.ts
import type { PluginInitFunction } from "@hyacine/helper/runtime";
import firework from "mouse-firework";

interface MouseFireworkRuntimeOptions {
  colors: string[];
  count: number;
  radius: number;
}

const HEART_ENTITY_NAME = "heart";

class HeartEntity extends firework.BaseEntity {
  paint() {
    const { ctx, radius } = this;
    const scale = radius / 256;
    const centerX = 256;
    const centerY = 256;

    ctx.beginPath();
    ctx.save();
    ctx.translate(0, 0);
    ctx.scale(scale, scale);

    ctx.moveTo(462.3 - centerX, 62.6 - centerY);
    ctx.bezierCurveTo(
      407.5 - centerX,
      15.9 - centerY,
      326 - centerX,
      24.3 - centerY,
      275.7 - centerX,
      76.2 - centerY,
    );
    ctx.lineTo(256 - centerX, 96.5 - centerY);
    ctx.lineTo(236.3 - centerX, 76.2 - centerY);
    ctx.bezierCurveTo(
      186.1 - centerX,
      24.3 - centerY,
      104.5 - centerX,
      15.9 - centerY,
      49.7 - centerX,
      62.6 - centerY,
    );
    ctx.bezierCurveTo(
      -13.1 - centerX,
      116.2 - centerY,
      -16.4 - centerX,
      212.4 - centerY,
      39.8 - centerX,
      270.5 - centerY,
    );
    ctx.lineTo(233.3 - centerX, 470.3 - centerY);
    ctx.bezierCurveTo(
      239.5 - centerX,
      476.75 - centerY,
      249.25 - centerX,
      480 - centerY,
      256 - centerX,
      480 - centerY,
    );
    ctx.bezierCurveTo(
      262.75 - centerX,
      480 - centerY,
      272.5 - centerX,
      476.75 - centerY,
      278.7 - centerX,
      470.3 - centerY,
    );
    ctx.lineTo(472.2 - centerX, 270.5 - centerY);
    ctx.bezierCurveTo(
      528.5 - centerX,
      212.4 - centerY,
      525.2 - centerX,
      116.2 - centerY,
      462.3 - centerX,
      62.6 - centerY,
    );
    ctx.closePath();
    ctx.restore();
  }
}

export const init: PluginInitFunction<MouseFireworkRuntimeOptions> = (options) => {
  firework.registerEntity(HEART_ENTITY_NAME, HeartEntity); // 註冊後才能在 `particles` 中使用 `shape: "heart"`
  firework({
    excludeElements: ["a", "button", "input", "textarea", "select", "summary"],
    particles: [
      {
        shape: HEART_ENTITY_NAME,
        move: "emit",
        easing: "easeOutExpo",
        colors: options.colors,
        number: options.count,
        duration: [1600, 2400],
        shapeOptions: {
          radius: [options.radius * 0.7, options.radius * 1.15],
          alpha: [0.85, 1],
        },
        moveOptions: {
          emitRadius: [60, 160],
          radius: [options.radius * 0.3, options.radius * 0.6],
          alphaChange: true,
          alpha: 0,
          alphaEasing: "easeOutQuad",
          alphaDuration: [1200, 2000],
        },
      },
      {
        shape: "circle",
        move: ["diffuse"],
        easing: "easeOutExpo",
        colors: ["#FFF"],
        number: 1,
        duration: [3000, 4000],
        shapeOptions: {
          radius: options.radius,
          alpha: 0.5,
          lineWidth: 6,
        },
      },
    ],
  });
};
```

## 4. 在 hyacine.plugin.ts 註冊

從本地路徑 import，加進 `plugins` 陣列，用法跟 `site-uptime` 一樣：

```ts hyacine.plugin.ts
import SiteUpTime from "./src/toolkit/siteUptimePlugin";
import MouseFirework from "./src/toolkit/mouseFireworkPlugin";

export default defineConfig({
  // ...
  plugins: [
    SiteUpTime({
      // ...
    }),
    MouseFirework({
      // 可自訂參數 參考文檔 https://github.com/D-Sketon/mouse-firework
      colors: ["rgba(255,182,185,.9)", "rgba(250,227,217,.9)", "rgba(138,198,209,.9)"],
      count: 6,
      radius: 20,
    }),
  ],
});
```

完成，重新啟動 `pnpm run dev`，點擊頁面就能看到愛心的效果了。
