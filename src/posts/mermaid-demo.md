---
title: Mermaid 图表示例
description: 展示 mermaid 围栏代码块如何渲染成可缩放、可全屏的图表卡片。
date: 2026-08-28
categories:
  - 主题功能
---

## 无标题图表

```mermaid
graph LR
    A[开始] --> B{判断}
    B -->|是| C[处理]
    B -->|否| D[结束]
    C --> D
```

## 带标题的图表

```mermaid title="部署流程"
sequenceDiagram
    participant Dev
    participant CI
    participant CDN
    Dev->>CI: push
    CI->>CI: build
    CI->>CDN: deploy
    CDN-->>Dev: ok
```
