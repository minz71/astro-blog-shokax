export const ROUTES = {
  home: "/",
  page2: "/page/2/",
  page3: "/page/3/",
  moments: "/moments/",
  tags: "/tags/",
  categories: "/categories/",
  archives: "/archives/",
  tools: "/tools/",
  rss: "/rss.xml",
} as const;

/**
 * 工具型内容（frontmatter `tool: true`）。
 *
 * 主题自带的示范工具，用来验证「工具只出现在 /tools/」这个机制；具体站点工具属于
 * 站点负载，不在这个仓库的 dev 分支上。
 */
export const TOOLS = {
  demo: "/tools/tool-demo/",
  demoSlug: "tool-demo",
  demoTitle: "工具页示范",
  /** 工具的旧文章路径：没有静态产物，应为 404 */
  demoUnderPosts: "/posts/tool-demo/",
  /** 草稿工具：不进任何公开 getStaticPaths，应为 404 */
  draft: "/tools/tool-demo-draft/",
  /** 一般文章被放到 /tools/ 底下：同样没有产物 */
  articleUnderTools: "/tools/hello-world/",
} as const;

export const POSTS = {
  helloWorld: "/posts/hello-world/",
  gettingStarted: "/posts/getting-started/",
  encryptedTest: "/posts/encrypted-test/",
  imageZoomTest: "/posts/image-zoom-test/",
  noteMdxDemo: "/posts/note-mdx-demo/",
  postMigrationTest: "/posts/post-migration-test/",
} as const;

export const SEARCH_TERMS = {
  publicPostTitle: "Hello World!",
  encryptedPostTitle: "加密文章测试",
  encryptedOnlyText: "AES-GCM",
} as const;
