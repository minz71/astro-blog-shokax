---
title: "介紹 mora.jp 的幾個常見問題"
date: 2025-09-06
updated: 2025-09-06
description: "介紹 mora.jp 的幾個常見問題，說明容器與編碼的差異、WAV 與 FLAC（含無壓縮 FLAC）的特性與容量/位元率計算"
tags:
  - "mora"
  - "Hi-res"
  - "音樂"
---

## 介紹

mora.jp 是 Sony Music Entertainment 提供販售無損音樂的平台，提供無 DRM 保護的音樂檔案，也就是購買的音樂檔案沒有加密。

## mora 無損壓縮

<img src="/images/other/mora/moraFormat.webp" alt="mora提供的格式" style="width: 90%;">

來源:https://mora.jp/etc/highreso

Mora販售的 FLAC 有2種形式

1. 無損無壓縮
2. 無損有壓縮

:::default
對於 FLAC 的壓縮率每一首歌都不一樣，也就是相同時間的歌曲可能會有不同檔案大小
:::

## 容器（Container）與編碼（Codec / Encoding）

在音樂檔案中**編碼包含在容器中**

- 容器是一種檔案格式，用來**包裝音訊資料以及相關的資訊**（metadata，如標題、歌手、專輯封面等）。
- 編碼器是**壓縮和解壓縮音訊資料的方式。** (實際的音訊資料)

例如:

- `.m4a` 檔案（容器）裡，可以放 **AAC 編碼** 或 **ALAC 編碼**的音訊。
- `.ogg` 容器可以裝 **Vorbis 編碼**，但也可以裝 **Opus 編碼**。

### M4A AAC

- **編碼標準**：AAC-LC（有損壓縮）
- **容器格式**：MPEG-4標準（.mp4/.m4a副檔名）

https://mora.jp/help/faq_play#pd_07
該網址中有說明 mora 提供的 AAC-LC 檔案格式為 .mp4/.m4a

## 無損無壓縮 WAV 檔案大小

公式為: 取樣率 _ 位元深度 _ 聲道數 \* 時間(秒) bit

例如以 4 分鐘的 96Khz/24bit 歌曲來計算檔案大小

96000(取樣率) _ 24(位元深度) _ 2(雙聲道) \* 240(秒數) / 8(換Byte) / 1024(換KB) / 1024(換MB) = 大小約 131.8 MB

位元率(bitrate): 表示每秒傳輸的資料量，計算方式為：取樣率 _ 位元深度 _ 聲道數

- 48kHZ 24bit 無損無壓縮的位元率是: 2304kbps
- 96kHZ 24bit 無損無壓縮的位元率是: 4608kbps

:::info
FLAC也可以作為無損無壓縮的格式
:::

:::info
音源的檔案大小需要再加上專輯封面等 metadata (元數據)
:::

## 無壓縮 FLAC

- WAV 不支援部分標籤和專輯封面

[FLAC官方網站: https://xiph.org/flac/](https://xiph.org/flac/)

- 可以使用下面的參數產生出無壓縮 FLAC，無壓縮的FLAC儲存空間更大，且解碼時間比有壓縮的FLAC更多。

```
flac.exe -l 0 --disable-constant-subframes --disable-fixed-subframes 'input.flac' -o 'output.flac'
```

在 github 對於 flac 無損無壓縮的 issue https://github.com/xiph/flac/issues/73

## mora 下載器

可以使用下載器一鍵下載所有購買的歌曲

https://mora.jp/help/player
