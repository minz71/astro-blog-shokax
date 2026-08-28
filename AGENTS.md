# AGENTS.md — astro-blog-shokax

本文件定义你在此仓库工作的最小安全边界与执行流程。

## 运行环境与总原则

- 运行时与包管理器：**Node.js ≥ 22.12 + pnpm**（`packageManager: pnpm@11.22.0`）
- 默认沟通语言：**中文**（输出与代码注释优先中文）
- 优先使用仓库脚本，不要自创命令
- 路由要求：`trailingSlash: "always"`（内部链接保留尾 `/`）
- 不要随意偏离现有架构（Astro + SolidJS + UnoCSS + Pagefind）
- SolidJS 交互代码遵循现有风格（createSignal/createEffect/createMemo + JSX）
- 有代码改动后至少执行：
  1. `pnpm run format`
  2. `pnpm run lint`
  3. `pnpm run check`

## 注释

- 默认中文输出与中文注释
- 不要新增“工作总结 Markdown 报告”文件

## 已知踩坑（防再犯）

- **UnoCSS 工具类挟持**：UnoCSS 会为扫描到的每个 class 名生成工具类，用作样式钩子的 id/class 一旦与工具类重名（如 `contents`→`display: contents`）就会被覆盖。样式钩子类名加业务前缀（`panel-*`），或显隐规则用更高特异性选择器（`.panels .panel`）防御。
- **框架渲染与手改 DOM class 是双写者**：Solid/React 重新渲染 `className` 会整体覆盖 JS 直接 `classList.add()` 的类（曾致分类卡片悬停时 `show` 丢失、卡片消失）。动态可见等状态一律收编为组件状态，class 由唯一来源拼装。
- **shadow DOM 样式够不着 slot 分发内容**：`<code-block>` 等自定义元素 shadow 内 `:host pre`/`:host code` 选择器不匹配 light DOM 子元素；作用于插槽内容的样式放全局 CSS（宿主前缀选择器 `code-block pre`）或 `::slotted`（无法带后代选择器）。shadow 内只留结构样式，内容样式见 `src/styles/code-block-light.css`。
- **CSS 默认隐藏 + JS 异步加显示类很脆**：默认 `opacity/display` 隐藏、由脚本迟加显示类的模式，水合失败或 class 被重写时内容就“消失”。能默认可见就默认可见，或用 Solid 状态驱动。

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
- 构建与依赖支持：如 `package.json`、`pnpm-lock.yaml`、`astro.config.mjs`、`hyacine.plugin.ts`、`src/content.config.ts`
- 纯主题修复：例如布局、交互、分页、页脚、图片预览、国际化等问题

### `dev` 不应承载的内容

- 文章与文章资源：`src/posts/**`
- 站点内容素材：`src/content/**`
- 站点个性化配置：`src/theme.config.ts`
- 直接发布资源：`public/images/**`、`public/_redirects`、站点 favicon、站点头像等私有站点资源
- 只服务当前站点的 about、links、友链内容文本
- 站点自己换上去的封面图与其署名（见下方「封面图片与署名」）

### `cloudflare` 应承载的内容

- 站点内容：`src/posts/**`
- 站点内容页素材：`src/content/**`
- 站点配置与主题设定值：`src/theme.config.ts`
- 站点图片与发布素材：`public/images/**`、`public/_redirects`、头像、favicon 等站点资源
- 直接面向发布的文章更新、友链内容、about/links 内容、Cloudflare 发布相关配置
- 更换封面图片，以及随之而来的署名（见下方「封面图片与署名」）

### 插件的归属

Hyacine 插件**按轴切，不按档案切**，分三层：

1. **能力（实作）→ `dev`**：2.0 起大部分插件改用上游发布的 `@hyacine/plugin-*` npm
   套件，直接在 `hyacine.plugin.ts` 引入即可。**只有上游没有的插件**（例如 sakura）
   才在本仓库写 `src/toolkit/*Plugin.ts`（manifest）与 `*Runtime.ts`（浏览器逻辑）。
   这类自写实作留在 `dev`——别人拿这个主题也该拿得到，不要因为「是个人风格」就搬去
   `cloudflare`。
2. **观感预设值 → `hyacine.plugin.ts`（`dev`）**：粒子数量、颜色、飘落方向这类
   换个站点依然成立的值，当主题预设放这里，站点想改再覆写。这个档案同时是插件系统的
   建置入口与 i18n 接线处，整个搬走会让 `dev` 的示范站失去所有效果，插件坏掉也测不出来。
3. **启用与站点专属值 → `cloudflare` 的 `theme.config.ts`**：`plugins.siteUptime.siteCreatedAt`、
   `plugins.sakura.scriptSrc` 这类换个站点就不成立的值。

**装饰性插件在 `dev` 一律预设关闭**。`hyacine.plugin.ts` 里的注册要 gate 在
`theme.config.ts` 的值上，没给值就不进 `plugins` 数组。实作留在 `dev` 是为了别人
拿得到，不是为了强迫别人用。

> 现状与这条规则不符：2.0 的 `hyacine.plugin.ts` 把 `mouseFirework`、`nyxPlayer`
> 等全部无条件注册，`siteUptime` 的 `siteCreatedAt` 也写死在档案里。这是上游写法，
> 尚未按本规则收敛。

判准两问：

- **这个值换一个站点还成立吗？**不成立就进 `theme.config.ts`。
- **别人不设定任何东西，会看到这个效果吗？**装饰性插件的答案必须是「不会」。

### 文章专属组件

判准一句话：**`dev` 不该认识任何一篇具体文章。**

工具类文章（文章内嵌一个可交互的小工具）会产出三种东西，全部归 `cloudflare`：

- 组件本体与样式：即使放在 `src/components/mdx/` 底下也一样，它是文章负载不是主题能力。
  这类组件由文章自己 `import`，不进 `initMdxComponents.ts` 的全局注册
- 只为它引入的执行期依赖：写进 `cloudflare` 的 `package.json`
- 文章 frontmatter 里的声明字段值

归 `dev` 的只有**机制**：让「带 client island 的文章」这件事可被声明、可被处理。
所以 `src/pages/posts/[...slug].astro` 读的是 frontmatter 字段，
绝不是 `post.id === "tool/local_code_copy"` 这种写死的分支。

看到 `dev` 的主题档案里出现具体文章 slug，就是这条线划错了。

### 站点网址

`themeConfig.siteUrl` 不只喂 `astro.config` 的 `site`：canonical、`og:url`、
JSON-LD 的 `url` / `mainEntityOfPage`、`robots.txt` 的 `Sitemap` 行全部取自它。
指错网域等于把每一页的 canonical 交给别人，搜索引擎会据此把本站剔出索引。

预设值是 `https://blog.minz.li`。上游预设的 `preview.astro.kaitaku.xyz` 是
**别人的网域**，不可留。站点如需其他网址，在 `cloudflare` 的 `theme.config.ts` 覆写。

### 封面图片与署名

> 本节描述目标状态。`coverCredits.ts` 与 `src/assets/images/cover/` 的目录结构
> 由 dev 的 `53133a2` 带入，2.0 重整尚未移植完成时以本节为准。

- `dev` 上的封面图（`src/assets/images/cover/`）与头像（`src/assets/avatar.avif`）
  **随主题一起散布、走主题授权，不需要个别署名**，因此 `dev` 的
  `src/toolkit/coverCredits.ts` 里 `COVER_CREDITS` 为空，这几个 key 列在
  `THEME_LICENSED_KEYS` 中豁免 `/credits/` 的构建期校验
- **更换封面图片属于站点行为，一律在 `cloudflare` 做**：把图换掉之后，要把对应 key
  从 `THEME_LICENSED_KEYS` 移走，并在 `COVER_CREDITS` 补上作者署名与出处
- 站点自己新增的分类封面（`src/assets/images/category-cover/`）与文章封面
  （`src/assets/images/post-cover/`）同理，只留在 `cloudflare`
- 所以 `src/toolkit/coverCredits.ts` 与上述两个图片目录在两个分支会长得不一样，
  **这是刻意的**，回补主题改动时不要把它们同步过去

### 工作规则

- 主题能力先在 `dev` 开发，再合并到 `cloudflare`
- 文章、站点配置、站点内容默认直接在 `cloudflare` 修改
- 如果在 `cloudflare` 修到了主题内部文件，必须尽快回补到 `dev`。
  但**先确认它真的是主题能力**：只服务某一篇文章的组件、样式与依赖不回补，
  它本来就该只存在于 `cloudflare`（见「文章专属组件」）
- 不要把新的文章更新直接提交到 `dev`
- `links`、`about` 这类内容型页面，其实际内容文件应优先放在 `src/content/`，页面路由层再负责包裹与渲染
