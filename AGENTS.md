# AGENTS.md — astro-blog-shokax

本文件定义你在此仓库工作的最小安全边界与执行流程。

## 运行环境与总原则

- 运行时与包管理器：**Bun**（`packageManager: bun@1.3.6`）
- 默认沟通语言：**中文**（输出与代码注释优先中文）
- 优先使用仓库脚本，不要自创命令
- 路由要求：`trailingSlash: "always"`（内部链接保留尾 `/`）
- 不要随意偏离现有架构（Astro + Svelte 5 + UnoCSS + Pagefind）
- Svelte 5 交互代码遵循现有 runes 风格（`$state/$props/$effect`）
- 有代码改动后至少执行：
  1. `bun run format`
  2. `bun run lint`
  3. `bun run check`

## 注释

- 默认中文输出与中文注释
- 不要新增“工作总结 Markdown 报告”文件

## 代码标准

- 可复用独立 helper 优先放置到`/src/toolkit/`中，并编写独立单元测试
- 较为复杂的 UI 组件或页面需编写对应 E2E 测试
- 如果需要添加测试用或展示效果的 Markdown/MDX 页面，优先复用现有文件

## 分支策略

- 默认维护两个长期分支：`dev` 与 `cloudflare`
- `dev` 用于主题内部改动，只处理主题能力、共享组件、布局、样式、工具函数、测试与构建相关调整
- `cloudflare` 用于直接发布到 CDN，基于 `dev` 同步主题改动后，再承载站点内容与部署相关更新
- `dev` 不应包含文章与站点私有内容；如果任务会改动文章、站点配置或站点素材，默认应在 `cloudflare` 处理

### `dev` 应承载的内容

- 主题内部实现：`src/components/**`、`src/layouts/**`、`src/styles/**`、`src/toolkit/**`、`src/i18n/**`
- 主题页面与通用路由逻辑：如归档、分类、标签、文章详情、共享页面壳
- 构建与依赖支持：如 `package.json`、`bun.lock`、`astro.config.mjs`、`hyacine.plugin.ts`、`src/content.config.ts`
- 纯主题修复：例如布局、交互、分页、页脚、图片预览、国际化等问题

### `dev` 不应承载的内容

- 文章与文章资源：`src/posts/**`
- 站点内容素材：`src/content/**`
- 站点个性化配置：`src/theme.config.ts`
- 直接发布资源：`public/images/**`、`public/_redirects`、站点 favicon、站点头像等私有站点资源
- 只服务当前站点的 about、links、友链内容文本

### `cloudflare` 应承载的内容

- 站点内容：`src/posts/**`
- 站点内容页素材：`src/content/**`
- 站点配置与主题设定值：`src/theme.config.ts`
- 站点图片与发布素材：`public/images/**`、`public/_redirects`、头像、favicon 等站点资源
- 直接面向发布的文章更新、友链内容、about/links 内容、Cloudflare 发布相关配置

### 工作规则

- 主题能力先在 `dev` 开发，再合并到 `cloudflare`
- 文章、站点配置、站点内容默认直接在 `cloudflare` 修改
- 如果在 `cloudflare` 修到了主题内部文件，必须尽快回补到 `dev`
- 不要把新的文章更新直接提交到 `dev`
- `links`、`about` 这类内容型页面，其实际内容文件应优先放在 `src/content/`，页面路由层再负责包裹与渲染
