---
title: "使用 diskpart 指令強制刪除磁碟分割區"
date: 2025-06-28
updated: 2025-06-28
description: "使用 diskpart 指令強制刪除磁碟分割區，解決磁碟區殘留問題。"
tags:
  - "diskpart"
categories:
  - "tool"
---

diskpart 是 Windows 的磁碟分割工具。

## 開啟系統管理員權限的命令提示字元(CMD) 進入 diskpart

```shell
diskpart
```

執行後，命令提示字元會變為 `DISKPART>`

## 列出電腦磁碟

```shell
list disk
```

範例輸出:

```shell
DISKPART> list disk

  磁碟 ###  狀態           大小     可用     Dyn  Gpt
  --------  -------------  -------  -------  ---  ---
  磁碟 0    連線              931 GB      0 B
  磁碟 1    連線              476 GB  1024 KB        *
```

## 選擇哪個硬碟

```shell
Select Disk 1
```

範例輸出:

```shell
DISKPART> select disk 1

磁碟 1 是所選擇的磁碟。
```

## 列出該磁碟所有分割區

```shell
list partition
```

範例輸出:

```shell
DISKPART> list partition

  磁碟分割  ###  類型              大小     位移
  -------------  ----------------  -------  -------
  磁碟分割  1    主要                 931 GB  1024 KB
```

## 選擇哪個分割區

```shell
select partition 1
```

範例輸出:

```shell
DISKPART> select partition 1

磁碟分割 1 是所選擇的磁碟分割。
```

## 刪除選擇的分割區

**執行後會強制刪除**所選的分割區

```shell
delete partition override
```
