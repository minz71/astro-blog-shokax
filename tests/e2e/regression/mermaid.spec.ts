import { expect, test } from "@playwright/test";
import { POSTS } from "../support/routes";

/** 与 high-value-interactions.spec.ts 中的加密链路保持一致 */
const ENCRYPTED_PASSWORD = "test123";

/**
 * 按钮顺序与 MermaidDiagram.svelte 的模板一致：
 * 缩小 / 放大 / 还原 / 复制 / 全屏。
 * 这里用位置而非 aria-label 定位，避免测试与站点语言设置耦合。
 */
const BUTTON = {
  zoomOut: 0,
  zoomIn: 1,
  reset: 2,
  copy: 3,
  fullscreen: 4,
} as const;

test("@regression mermaid 围栏渲染成主题化的 SVG 图表", async ({ page }) => {
  const response = await page.goto(POSTS.postMigrationTest);
  expect(response?.ok()).toBeTruthy();

  const diagram = page.locator("mermaid-diagram").first();
  await expect(diagram).toBeVisible();

  // 图表由客户端懒加载 mermaid 后渲染
  const svg = diagram.locator(".stage svg");
  await expect(svg).toBeVisible();

  // 围栏 meta 里的 title 显示在卡片头部
  await expect(diagram.locator(".title-text")).toHaveText("构建流程");

  // 节点填充色取自 palette.css 的 --mermaid-node-bg，而不是 mermaid 默认色
  const nodeFill = await diagram
    .locator(".stage svg .node .basic.label-container, .stage svg .node rect")
    .first()
    .evaluate((node) => globalThis.getComputedStyle(node).fill);
  expect(nodeFill).not.toBe("rgb(0, 0, 0)");

  // 源码不应参与站内搜索
  await expect(diagram).toHaveAttribute("data-pagefind-ignore", "");
});

test("@regression mermaid 图表支持缩放与还原", async ({ page }) => {
  await page.goto(POSTS.postMigrationTest);

  const diagram = page.locator("mermaid-diagram").first();
  await expect(diagram.locator(".stage svg")).toBeVisible();

  const stage = diagram.locator(".stage");
  const buttons = diagram.locator(".action-btn");

  await expect(stage).toHaveAttribute("style", /scale\(1\)/);

  await buttons.nth(BUTTON.zoomIn).click();
  await expect(stage).toHaveAttribute("style", /scale\(1\.25\)/);

  await buttons.nth(BUTTON.reset).click();
  await expect(stage).toHaveAttribute("style", /translate\(0px, 0px\) scale\(1\)/);
});

test("@regression mermaid 图表可进入全屏并用 Escape 退出", async ({ page }) => {
  await page.goto(POSTS.postMigrationTest);

  const diagram = page.locator("mermaid-diagram").first();
  await expect(diagram.locator(".stage svg")).toBeVisible();

  const card = diagram.locator(".mermaid-card");
  await diagram.locator(".action-btn").nth(BUTTON.fullscreen).click();

  await expect(card).toHaveClass(/fullscreen/);
  await expect.poll(async () => page.evaluate(() => document.body.style.overflow)).toBe("hidden");

  await page.keyboard.press("Escape");
  await expect(card).not.toHaveClass(/fullscreen/);
  await expect.poll(async () => page.evaluate(() => document.body.style.overflow)).toBe("");
});

test("@regression 加密文章解密后注入的图表同样会渲染", async ({ page }) => {
  await page.goto(POSTS.encryptedTest);

  // 解密前正文尚未注入 DOM，元素不存在
  await expect(page.locator("mermaid-diagram")).toHaveCount(0);

  const passwordInput = page.getByPlaceholder("请输入密码");
  await expect(passwordInput).toBeVisible();
  await passwordInput.fill(ENCRYPTED_PASSWORD);
  await page.getByRole("button", { name: "解密" }).click();

  // 客户端注入 HTML 后自定义元素才 upgrade，此时 mermaid 需要被懒加载
  const diagram = page.locator("mermaid-diagram").first();
  await expect(diagram.locator(".stage svg")).toBeVisible();
  await expect(diagram.locator(".title-text")).toHaveText("解密流程");
});

test("@regression 切换深浅色后 mermaid 图表按新主题重绘", async ({ page }) => {
  await page.goto(POSTS.postMigrationTest);

  const diagram = page.locator("mermaid-diagram").first();
  const node = diagram
    .locator(".stage svg .node .basic.label-container, .stage svg .node rect")
    .first();
  await expect(node).toBeVisible();

  const readFill = async () =>
    node.evaluate((element) => globalThis.getComputedStyle(element).fill);
  const before = await readFill();

  await page.evaluate(() => {
    const root = document.documentElement;
    root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
  });

  await expect.poll(readFill).not.toBe(before);
});
