export const ROUTES = {
  home: "/",
  page2: "/page/2/",
  page3: "/page/3/",
  moments: "/moments/",
  tags: "/tags/",
  categories: "/categories/",
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
  // 必须是站内真实存在的文章标题：命中列表只渲染标题（对齐旧版 ShokaX 设计），
  // 且 high-value-interactions 会断言跳转后的 h1 包含此字符串。
  publicPostTitle: "資料結構",
  encryptedPostTitle: "加密文章测试",
  encryptedOnlyText: "AES-GCM",
} as const;
