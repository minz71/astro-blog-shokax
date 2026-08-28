---
title: "Astro ShokaX 移除頂部霧面效果"
date: 2026-08-01
description: "Astro ShokaX 的導覽列在頁面頂部有毛玻璃效果，封面圖沒有完整顯示。"
tags:
  - "ShokaX"
categories:
  - "ShokaX"
---

# 介紹

<img src="/images/shokaX/removeTopFrosted_before.avif" alt="" title="移除前" style="width: 80%;">
<img src="/images/shokaX/removeTopFrosted_after.avif" alt="" title="移除後" style="width: 80%;">

- 並且在頂部以外的地方保留模糊效果
  <img src="/images/shokaX/removeTopFrosted_other.avif" alt="" title="頂部以外的地方保留模糊效果" style="width: 80%;">


Astro ShokaX 的導覽列固定在視窗頂部（`#nav`），毛玻璃寫在元件的 class list 上：

```svelte src/components/navbar/NavBar.svelte
<nav
  id="nav"
  aria-label={t("nav.mainAria")}
  class={`h-12.5 fixed top-0 w-full z-9 backdrop-blur-8 backdrop-saturate-180 ${atTop ? "nav-top" : "nav-bg"}`.trim()}
>
```

`backdrop-blur-8 backdrop-saturate-180` 這兩個 UnoCSS utility 落在共同的部分，`atTop` 只切換底色，所以兩種狀態都吃得到毛玻璃，停在頁面頂部 `.nav-top`，往下滾動後`.nav-bg`。

# 做法

## 1. 新增 `src/styles/nav-blur.css`

`.nav-top` 只在頁面頂部出現，關掉它的 `backdrop-filter`，`.nav-bg` 不動：

```css src/styles/nav-blur.css
/* 導航欄毛玻璃效果的局部調整 */

/* 頁面頂部（.nav-top）時移除毛玻璃，避免糊掉封面圖頂部；
   捲動後（.nav-bg）保留 NavBar 上的 backdrop-blur-8 backdrop-saturate-180 */

/* 只寫無前綴屬性：build 時 esbuild 會把同族的 -webkit- 聲明當成重複項收掉，
   只留下後寫的那條；若把 -webkit- 寫在後面，覆蓋不到 utility 的 backdrop-filter */

#nav.nav-top {
  backdrop-filter: none;
}
```

## 2. 在 `Layout.astro` 匯入

跟其他全站樣式放在一起：

```ts src/layouts/Layout.astro {4}
import "@/styles/palette.css";
import "@/styles/style.css";
import "@/styles/header-cover.css";
import "@/styles/nav-blur.css";
import "@/styles/mdx-components.css";
```

