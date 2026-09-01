import { expect, type Page } from "@playwright/test";

/**
 * 打开搜索面板，兼容 client:idle 水合延迟。
 *
 * SearchPage 使用 client:idle 指令，点击监听器在 Svelte 水合后才挂载到 #search 按钮。
 * 若在水合完成前点击，对话框不会打开，因此需要重试直到对话框可见。
 */
export async function openSearchDialog(page: Page) {
  const openSearchButton = page.locator("#search");
  const searchDialog = page.getByRole("dialog", { name: "Search" });

  await expect(openSearchButton).toBeVisible();

  if (await searchDialog.isVisible()) {
    return searchDialog;
  }

  // 先打开轻量面板，再等待按需下载的 Pagefind 自定义元素完成注册。
  // 这样测试不会在用户尚未触发搜索时提前拉取 Pagefind 资源。
  const shortcut = process.platform === "darwin" ? "Meta+K" : "Control+K";
  await page.keyboard.press(shortcut);

  try {
    await expect(searchDialog).toBeVisible({ timeout: 3000 });
  } catch {
    // fallback：快捷键未命中（如焦点在可编辑元素上）时改用点击，
    // 仅在对话框仍不可见时补一次，避免 toggle 翻转。
    await openSearchButton.click({ force: true });
    await expect(searchDialog).toBeVisible({ timeout: 5000 });
  }

  await page.waitForFunction(
    () => typeof customElements !== "undefined" && Boolean(customElements.get("pagefind-input")),
    undefined,
    { timeout: 5000 },
  );

  return searchDialog;
}
