import { expect, test } from "@playwright/test";
import { POSTS, ROUTES, TOOLS } from "../support/routes";

test("@critical 工具索引列出每个公开工具，链接带尾斜线", async ({ page }) => {
  const response = await page.goto(ROUTES.tools);
  expect(response?.ok()).toBeTruthy();

  const cards = page.locator(".tool-card");
  await expect(cards.first()).toBeVisible();

  const hrefs = await page
    .locator(".tool-card .tool-card__link")
    .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));

  // 每个工具恰好出现一次
  expect(new Set(hrefs).size).toBe(hrefs.length);
  expect(hrefs).toContain(TOOLS.demo);

  // 全部落在 /tools/ 命名空间且保留尾斜线
  for (const href of hrefs) {
    expect(href.startsWith("/tools/")).toBeTruthy();
    expect(href.endsWith("/")).toBeTruthy();
  }

  // 索引本身不渲染文章流的侧栏与 widgets
  await expect(page.locator("#sidebar")).toHaveCount(0);
  await expect(page.locator(".layout-main-widgets")).toHaveCount(0);
});

test("@critical 工具详情可达，标题与 canonical 正确", async ({ page }) => {
  const response = await page.goto(TOOLS.demo);
  expect(response?.ok()).toBeTruthy();

  await expect(page.locator("article.post h1.title")).toHaveText(TOOLS.demoTitle);

  const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
  expect(canonical).toBeTruthy();
  expect(new URL(canonical!).pathname).toBe(TOOLS.demo);

  const ogUrl = await page.locator('meta[property="og:url"]').getAttribute("content");
  expect(new URL(ogUrl!).pathname).toBe(TOOLS.demo);
});

test("@critical clientIsland 工具在浏览器中完成水合且可交互", async ({ page }) => {
  await page.goto(TOOLS.demo);

  const probe = page.getByTestId("client-island-probe");
  await expect(probe).toBeVisible();

  const count = page.getByTestId("client-island-probe-count");
  await expect(count).toHaveText("0");

  /**
   * 先等水合真的完成再点。
   *
   * astro-island 水合成功后会移除 `ssr` 属性（见 astro/dist/runtime/server/
   * astro-island.js）。少了这一步，在多 worker 平行跑时点击会落在水合之前，
   * 计数不动，测试变成偶发失败——那是测试的时序问题，不是功能坏了。
   */
  const island = page.locator('astro-island:has([data-testid="client-island-probe"])');
  await expect(island).toHaveCount(1);
  await expect
    .poll(async () => island.evaluate((element) => element.hasAttribute("ssr")))
    .toBe(false);

  // 水合成功后计数才会动；这里验证的是通用 clientIsland 通路，
  // 不检查路由程式码里的任何具体 slug 分支
  await page.getByTestId("client-island-probe-button").click();
  await expect(count).toHaveText("1");

  await page.getByTestId("client-island-probe-button").click();
  await expect(count).toHaveText("2");
});

test("@critical 工具详情不渲染文章流的导航、相关文章与侧栏", async ({ page }) => {
  await page.goto(TOOLS.demo);

  await expect(page.locator(".post-nav")).toHaveCount(0);
  await expect(page.locator("#sidebar")).toHaveCount(0);
  await expect(page.locator("#rightSidebar, .layout-extra-column")).toHaveCount(0);
  await expect(page.locator(".layout-main-widgets")).toHaveCount(0);
  await expect(page.locator(".widgets")).toHaveCount(0);

  // 独立版面只有主栏
  await expect(page.locator(".layout-standalone")).toHaveCount(1);
});

test("@critical 工具不出现在任何一般文章流的页面上", async ({ page }) => {
  const articleFlowRoutes = [
    ROUTES.home,
    ROUTES.page2,
    ROUTES.archives,
    ROUTES.categories,
    ROUTES.tags,
    POSTS.helloWorld,
  ];

  /**
   * 只看内容区与侧栏，不看整页。
   *
   * 站点把「工具」加进 theme.config.ts 的 nav 是很自然的下一步，那会让 NavBar
   * 合理地出现 /tools/ 链接。断言范围若是整个 page，这个测试就会因为一个正确的
   * 站点设定而失败——要验的是「工具不出现在文章流的列表与导航里」，不是
   * 「整站没有 /tools/ 这个字」。
   */
  const articleFlowScopes = ["#main", "#sidebar", ".layout-extra-column"].join(", ");

  for (const route of articleFlowRoutes) {
    // 逐页依序导航：共用同一个 page，平行化会互相覆盖
    // oxlint-disable-next-line eslint/no-await-in-loop
    const response = await page.goto(route);
    expect(response?.ok(), `${route} 应可访问`).toBeTruthy();

    // oxlint-disable-next-line eslint/no-await-in-loop
    const toolLinks = await page
      .locator(articleFlowScopes)
      .locator('a[href*="/tools/"]')
      .evaluateAll((links) => links.map((link) => link.getAttribute("href")));

    expect(toolLinks, `${route} 的内容区或侧栏不该出现工具链接`).toEqual([]);
  }
});

test("@critical RSS 与 llms.txt 不含工具项目", async ({ request }) => {
  const rss = await request.get(ROUTES.rss);
  expect(rss.ok()).toBeTruthy();
  expect(await rss.text()).not.toContain("/tools/");

  const llms = await request.get("/llms.txt");
  expect(llms.ok()).toBeTruthy();
  expect(await llms.text()).not.toContain("/tools/");
});

test("@critical 工具的旧文章路径、草稿工具与错命名空间的文章都回 404", async ({ request }) => {
  for (const path of [TOOLS.demoUnderPosts, TOOLS.draft, TOOLS.articleUnderTools]) {
    // oxlint-disable-next-line eslint/no-await-in-loop
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), `${path} 应为 404`).toBe(404);
  }
});
