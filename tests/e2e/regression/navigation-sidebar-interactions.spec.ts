import { expect, test } from "@playwright/test";
import { POSTS, ROUTES } from "../support/routes";

test("@regression 导航栏入口与随机文章按钮可用", async ({ page }) => {
  await page.goto(ROUTES.home);

  const mainNav = page.getByRole("navigation", { name: "主导航" });
  await expect(mainNav).toBeVisible();

  await mainNav.getByRole("link", { name: "友链" }).click();
  await expect(page).toHaveURL(/\/friends\/$/);

  await page.goto(ROUTES.home);
  await page.locator('#nav a[href="/random/"]').click();
  await expect(page).toHaveURL(/\/posts\/[^/]+\/$/);
});

test("@regression 移动端侧边栏可通过导航按钮与遮罩开关", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTES.home);

  const sidebar = page.locator("#sidebar");
  await expect(sidebar).not.toHaveClass(/\bon\b/);

  await page.getByRole("button", { name: "Toggle sidebar" }).click();
  await expect(sidebar).toHaveClass(/\bon\b/);

  // 抽屉从左侧滑出，与左上角的汉堡按钮同一边
  const box = await sidebar.boundingBox();
  expect(box?.x).toBeCloseTo(0, 0);

  const closeOverlay = page.getByRole("button", { name: "Close sidebar" });
  await expect(closeOverlay).toBeVisible();

  // 点击而非键盘触发：遮罩曾被另一层无处理器的 .dimmer 盖住，只有真实点击才能发现。
  // x=350 落在 280px 宽抽屉右侧的露出区域
  await page.mouse.click(350, 400);
  await expect(sidebar).not.toHaveClass(/\bon\b/);

  await page.getByRole("button", { name: "Toggle sidebar" }).click();
  await expect(sidebar).toHaveClass(/\bon\b/);
  await closeOverlay.focus();
  await closeOverlay.press("Enter");
  await expect(sidebar).not.toHaveClass(/\bon\b/);
});

test("@regression 侧边栏目录面板可切换并响应目录点击", async ({ page }) => {
  await page.goto(POSTS.postMigrationTest);

  const contentsTab = page.locator("#sidebar .tab button.contents");
  if ((await contentsTab.count()) > 0) {
    await contentsTab.first().click();
  }

  const contentsPanel = page.locator("#sidebar .panel.contents");
  await expect(contentsPanel).toBeVisible();

  const firstTocItem = contentsPanel.locator(".toc > .toc-item").first();
  await expect(firstTocItem).toBeVisible();

  const beforeScrollY = await page.evaluate(() => window.scrollY);
  const tocLink = firstTocItem.locator(".toc-link");
  const tocHref = await tocLink.getAttribute("href");
  expect(tocHref).toBeTruthy();

  if (!tocHref) {
    return;
  }

  await tocLink.click();

  await expect(firstTocItem).toHaveClass(/active|current/);
  await expect
    .poll(async () => {
      return page.evaluate(() => window.scrollY);
    })
    .not.toBe(beforeScrollY);
});

test("@regression 浮动工具栏返回顶部与移动端切换侧栏可用", async ({ page }) => {
  await page.goto(POSTS.postMigrationTest);

  await page.evaluate(() => {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
  });

  await expect
    .poll(async () => {
      return page.evaluate(() => window.scrollY);
    })
    .toBeGreaterThan(200);

  await page.getByRole("button", { name: "返回顶部" }).click();

  await expect
    .poll(async () => {
      return page.evaluate(() => window.scrollY);
    })
    .toBeLessThan(20);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTES.home);

  const sidebar = page.locator("#sidebar");
  await expect(sidebar).not.toHaveClass(/\bon\b/);
  await page.getByRole("button", { name: "切换侧栏" }).click();
  await expect(sidebar).toHaveClass(/\bon\b/);
});
