---
title: "工具页草稿示范"
date: 2026-03-02
updated: 2026-03-02
description: "草稿工具不产生任何静态详情，用来验证 /tools/{slug}/ 的 404"
tags:
  - 组件
  - 测试
categories:
  - 测试
tool: true
draft: true
---

这篇同时是工具与草稿，所以 `/tools/` 索引不列它，`/tools/tool-demo-draft/` 也不会
有静态产物——请求会由静态主机回 404。存在这个档案是为了让「草稿不进任何公开
getStaticPaths」这条规则有实际可验证的目标。
