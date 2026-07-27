---
title: 加密文章测试
date: 2026-02-27
encrypted: true
password: test123
tags:
  - 测试
categories:
  - 教程
---

这是一篇加密文章的测试内容。

## 加密功能说明

这篇文章使用了 AES-GCM 加密算法进行加密，需要输入正确的密码才能查看内容。

### 功能特点

1. **整篇文章加密** - 所有内容在构建时加密
2. **独立密码** - 每篇文章可以有自己的密码
3. **SEO 隐藏** - 加密文章不会被搜索引擎索引
4. **TOC 支持** - 解密后目录会自动显示

### 使用方法

在文章的 frontmatter 中添加：

```yaml
encrypted: true
password: your_password
```

密码：test123

### 图表也能在解密后渲染

```mermaid title="解密流程"
flowchart LR
    A[输入密码] --> B{校验通过?}
    B -- 是 --> C[注入正文 HTML]
    C --> D[mermaid-diagram 上屏渲染]
    B -- 否 --> A
```
