---
title: 测试文章 - Post 页面完整功能展示
date: 2025-12-12
updated: 2025-12-12
description: 这是一篇用于测试 Post 页面所有功能的完整文章，包含了面包屑、标签、分类、版权等各种元素
tags: [测试, Astro, ShokaX, 迁移]
categories: [开发, 测试]
draft: false
---

## 欢迎来到新的 Post 页面

这是一篇测试文章，用于展示从 hexo-theme-shokaX 迁移过来的 Post 页面功能。

### 功能清单

我们已经成功迁移了以下功能：

1. **面包屑导航** - 显示文章的分类层级
2. **文章头部** - 包含标题、发布日期、字数统计、阅读时间
3. **文章内容** - Markdown 渲染的主体内容
4. **标签显示** - 文章底部的标签列表
5. **版权信息** - 包含作者、链接和许可协议
6. **文章导航** - 上一篇/下一篇文章链接

### 样式迁移

所有原始样式都已从 Stylus 转换为 CSS：

- Post 基础样式
- 面包屑样式
- 文章头部和元信息样式
- 标签样式
- 版权信息样式
- 文章导航样式

### 技术栈

- **Astro** - 主要框架
- **UnoCSS** - 样式工具
- **Svelte** - 部分交互组件
- **TypeScript** - 类型安全

## 代码示例

```typescript
function greet(name: string): string {
  return `Hello, ${name}!`;
}

console.log(greet("ShokaX"));
function greet(name: string): string {
  return `Hello, ${name}!`;
}

console.log(greet("ShokaX"));
function greet(name: string): string {
  return `Hello, ${name}!`;
}

console.log(greet("ShokaX"));
function greet(name: string): string {
  return `Hello, ${name}!`;
}

console.log(greet("ShokaX"));
function greet(name: string): string {
  return `Hello, ${name}!`;
}

console.log(greet("ShokaX"));
function greet(name: string): string {
  return `Hello, ${name}!`;
}

console.log(greet("ShokaX"));
function greet(name: string): string {
  return `Hello, ${name}!`;
}

console.log(greet("ShokaX"));
```

## 列表示例

### 无序列表

- 项目一
- 项目二
  - 子项目 2.1
  - 子项目 2.2
- 项目三

### 有序列表

1. 第一步
2. 第二步
3. 第三步

## 引用

> 这是一段引用文字。
>
> 可以包含多个段落。

!!隐藏内容隐藏内容!!

## 总结

通过这次迁移，我们成功地将 hexo-theme-shokaX 的 Post 页面功能完整地迁移到了 Astro 项目中，保持了原有的样式和布局，同时使用了更现代的技术栈。

---

## CodeBlock（Shiki Transformers）样式测试

下面这些代码块用于测试 `@shikijs/transformers` 在本主题中的渲染效果（对应你在 `astro.config.mjs` 里启用的 transformers）。

### transformerMetaHighlight（代码块 Meta 高亮行）

```ts {1,3-4}
const a = 1;
const b = 2;
const c = 3;
const d = 4;
console.log({ a, b, c, d });
```

### transformerNotationHighlight（行高亮）

```ts
console.log("Not highlighted");
console.log("Highlighted"); // [!code highlight]
console.log("Not highlighted");
```

```ts
// [!code highlight:3]
console.log("Highlighted 1");
console.log("Highlighted 2");
console.log("Not highlighted");
```

### transformerNotationDiff（Diff 增删行）

```ts
const oldName = "hewwo"; // [!code --]
const newName = "hello"; // [!code ++]
console.log({ oldName, newName });
```

### transformerNotationFocus（聚焦行）

```ts
console.log("Not focused");
console.log("Focused"); // [!code focus]
console.log("Not focused");
```

```ts
// [!code focus:2]
console.log("Focused 1");
console.log("Focused 2");
console.log("Not focused");
```

### transformerNotationErrorLevel（Error / Warning 级别）

```ts
console.log("No errors or warnings");
console.error("Error"); // [!code error]
console.warn("Warning"); // [!code warning]
```

### mermaid 流程图

```mermaid title="构建流程"
%% 注释：测试 .md 下的花括号与转义
flowchart LR
    A[Markdown] --> B{是否含 mermaid?}
    B -- 是 --> C["转成 &lt;mermaid-diagram&gt;"]
    B -- 否 --> D[Shiki 高亮]

    C --> E[浏览器懒加载渲染]
```
