import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { TOOLS } from "../support/routes";

/**
 * 模拟转蛋（转蛋计算机底下的翻牌区）的端对端测试。
 *
 * 抽到什么是乱数，所以这里只断言「张数、翻开状态、累计数」这些跟手气无关的东西，
 * 不断言抽到哪一层。
 *
 * playwright.config 全域开着 reducedMotion: "reduce"，预设走的就是「不播动画、直接出结果」
 * 那条路；演出与「跳过」另外在 no-preference 底下测。
 */

async function openSimulator(page: Page): Promise<Locator> {
  const response = await page.goto(TOOLS.gachaCalculator);
  expect(response?.ok()).toBeTruthy();
  // client:only 的岛屿：等它挂上来
  const sim = page.locator(".gct-sim");
  await expect(sim).toBeVisible();
  await sim.scrollIntoViewIfNeeded();
  return sim;
}

const button = (sim: Locator, name: string) => sim.getByRole("button", { name, exact: true });
const tallyHead = (sim: Locator) => sim.locator(".gct-sim-tally thead th").first();
const cards = (sim: Locator) => sim.locator(".gct-sim-card");

test.describe("模拟转蛋：减少动态", () => {
  test("@regression 十连与单抽直接翻开，累计数跟着加", async ({ page }) => {
    const sim = await openSimulator(page);

    await expect(sim.locator(".gct-sim-hint")).toBeVisible();
    await expect(button(sim, "跳過")).toBeDisabled();
    await expect(button(sim, "清空紀錄")).toBeDisabled();

    await button(sim, "十連").click();
    await expect(cards(sim)).toHaveCount(10);
    await expect(sim.locator('.gct-sim-card[data-state="revealed"]')).toHaveCount(10);
    // 每张翻开的牌底下都有名字（没中的写「沒中」）
    await expect(sim.locator(".gct-sim-name")).toHaveCount(10);
    await expect(tallyHead(sim)).toHaveText("累計 10 抽");
    await expect(sim.locator(".gct-sim-summary")).toContainText("這次十連");
    await expect(button(sim, "跳過")).toBeDisabled();

    await button(sim, "單抽").click();
    await expect(cards(sim)).toHaveCount(1);
    await expect(sim.locator('.gct-sim-card[data-state="revealed"]')).toHaveCount(1);
    await expect(tallyHead(sim)).toHaveText("累計 11 抽");
    await expect(sim.locator(".gct-sim-summary")).toContainText("這一抽");

    // 累计表的「抽到」加总必须等于总抽数
    const counts = await sim
      .locator(".gct-sim-tally tbody tr td:nth-child(3)")
      .evaluateAll((cells) => cells.map((cell) => Number(cell.textContent?.replaceAll(",", ""))));
    expect(counts.reduce((sum, value) => sum + value, 0)).toBe(11);

    await button(sim, "清空紀錄").click();
    await expect(tallyHead(sim)).toHaveText("累計 0 抽");
    await expect(cards(sim)).toHaveCount(0);
    await expect(sim.locator(".gct-sim-hint")).toBeVisible();
  });

  test("@regression 点牌堆照栏位的张数抽，超过 20 会被夹住", async ({ page }) => {
    const sim = await openSimulator(page);
    const deck = sim.locator(".gct-sim-deck");
    const countInput = sim.locator(".gct-sim-count input");

    // 预设点一下抽一张
    await expect(deck).toHaveAccessibleName("抽 1 次");
    await deck.click();
    await expect(cards(sim)).toHaveCount(1);
    await expect(tallyHead(sim)).toHaveText("累計 1 抽");

    await countInput.fill("3");
    await deck.click();
    await expect(cards(sim)).toHaveCount(3);
    await expect(sim.locator(".gct-sim-summary")).toContainText("這次 3 連");
    await expect(tallyHead(sim)).toHaveText("累計 4 抽");

    // 上限 20：填 99 会被夹成 20，失焦后栏位也显示 20
    await countInput.fill("99");
    await countInput.blur();
    await expect(countInput).toHaveValue("20");
    await deck.click();
    await expect(cards(sim)).toHaveCount(20);
    await expect(sim.locator('.gct-sim-card[data-state="revealed"]')).toHaveCount(20);
    await expect(tallyHead(sim)).toHaveText("累計 24 抽");
  });

  test("@regression 改了奖品表就清空模拟纪录", async ({ page }) => {
    const sim = await openSimulator(page);

    await button(sim, "十連").click();
    await expect(tallyHead(sim)).toHaveText("累計 10 抽");

    // 第一列的机率栏位
    const probability = page.locator(".gct-prize").first().locator('input[type="number"]').first();
    await probability.fill("12");
    await probability.blur();

    await expect(tallyHead(sim)).toHaveText("累計 0 抽");
    await expect(cards(sim)).toHaveCount(0);
  });
});

test.describe("模拟转蛋：完整演出", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test("@regression 演出中可以跳过，牌直接停在翻开后的样子", async ({ page }) => {
    const sim = await openSimulator(page);

    await button(sim, "十連").click();
    await expect(cards(sim)).toHaveCount(10);
    // 演出中：开抽按钮锁住、跳过可按，累计数还没动（不能先剧透）
    await expect(button(sim, "十連")).toBeDisabled();
    await expect(button(sim, "跳過")).toBeEnabled();
    await expect(tallyHead(sim)).toHaveText("累計 0 抽");

    await button(sim, "跳過").click();
    await expect(sim.locator('.gct-sim-card[data-state="revealed"]')).toHaveCount(10);
    await expect(tallyHead(sim)).toHaveText("累計 10 抽");
    await expect(button(sim, "跳過")).toBeDisabled();
    await expect(button(sim, "十連")).toBeEnabled();

    // 跳过后不能留下暗幕或浮起来的牌
    await expect(sim.locator('.gct-sim-card[data-focus="true"]')).toHaveCount(0);
    await expect(sim.locator(".gct-sim-dim")).toHaveCSS("opacity", "0");
  });

  test("@regression 单抽演出会自己跑完", async ({ page }) => {
    const sim = await openSimulator(page);

    await button(sim, "單抽").click();
    await expect(button(sim, "跳過")).toBeEnabled();
    // 洗牌＋发牌＋最长的目标揭晓约 4.5 秒，留足余裕
    await expect(sim.locator('.gct-sim-card[data-state="revealed"]')).toHaveCount(1, {
      timeout: 10_000,
    });
    await expect(button(sim, "跳過")).toBeDisabled({ timeout: 10_000 });
    await expect(tallyHead(sim)).toHaveText("累計 1 抽");
  });
});
