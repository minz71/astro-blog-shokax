import { expect, test } from "@playwright/test";
import { TOOLS } from "../support/routes";

/**
 * 图片编辑工具的端对端测试。
 *
 * 这里刻意跑真正的 wasm 编码（不 mock），因为最容易坏掉的地方正是「wasm 能不能在
 * 建置产物里被 Worker 载到」—— 型别检查与单元测试都盖不到这一段。所以主要案例走
 * WebP（编码器只有 275KB，最快），AVIF 那份 3.4MB 的就不在 CI 里跑。
 */

/** 产生一张有内容的 PNG：纯色图会被压到几乎没有体积，量不出压缩效果。 */
async function makePngFixture(
  page: import("@playwright/test").Page,
  width = 320,
  height = 240,
  name = "fixture.png",
): Promise<{ name: string; mimeType: string; buffer: Buffer }> {
  const dataUrl = await page.evaluate(
    ({ w, h }) => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      // 渐层 + 杂点，让 PNG 有足够的资讯量
      const gradient = ctx.createLinearGradient(0, 0, w, h);
      gradient.addColorStop(0, "#ff5f6d");
      gradient.addColorStop(1, "#1e90ff");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 400; i += 1) {
        ctx.fillStyle = `hsl(${(i * 7) % 360} 80% 55%)`;
        ctx.fillRect((i * 13) % w, (i * 29) % h, 6, 6);
      }
      return canvas.toDataURL("image/png");
    },
    { w: width, h: height },
  );

  return {
    name,
    mimeType: "image/png",
    buffer: Buffer.from(dataUrl.split(",")[1], "base64"),
  };
}

/**
 * 打开面板上折叠起来的设定区块。
 *
 * 面板的设定分组是原生 <details>，除了拼贴版面以外预设都关着。关起来的区块不能直接操作：
 * Chromium 对 <details> 的收合是 content-visibility: hidden，子元素不会被画出来，但
 * getBoundingClientRect() 仍然回报收合前的尺寸 —— 於是 Playwright 认为它「可见」，click
 * 会因为点不到而等到 timeout，toBeHidden() 也会失败。所以互动前一律先把区块打开。
 */
async function openSection(page: import("@playwright/test").Page, title: string): Promise<void> {
  const fold = page.locator(".iet-fold", { has: page.locator("summary", { hasText: title }) });
  await expect(fold).toBeVisible();
  if (await fold.evaluate((el) => !(el instanceof HTMLDetailsElement) || el.open)) return;
  await fold.locator("summary").click();
  await expect(fold).toHaveAttribute("open", "");
}

test.describe("图片编辑工具", () => {
  // wasm 编码在 CI 的共享 runner 上会比本机慢不少
  test.slow();

  test("@regression 载入图片后可以压缩成 WebP 并取得下载连结", async ({ page }) => {
    const response = await page.goto(TOOLS.imageEditor);
    expect(response?.ok()).toBeTruthy();

    const tool = page.locator(".iet");
    await expect(tool).toBeVisible();

    const fixture = await makePngFixture(page);
    await page.locator('[data-testid="iet-file-input"]').setInputFiles(fixture);

    // 解码完成后清单会显示原始尺寸
    const list = page.locator('[data-testid="iet-list"]');
    await expect(list).toContainText("fixture.png");
    await expect(list).toContainText("320×240");

    await page.locator('[data-testid="iet-format-webp"]').click();
    // 压缩强度只剩滑桿（原本的四段预设按钮已经拿掉）
    await page.locator('[data-testid="iet-quality"]').fill("66");
    await expect(page.locator(".iet-panel")).toContainText("畫質 66");

    const process = page.locator('[data-testid="iet-process"]');
    await expect(process).toBeEnabled();
    await process.click();

    // 第一次会真的去下载 webp_enc wasm，给它宽一点的时间
    const download = page.locator('[data-testid="iet-download"]');
    await expect(download).toBeVisible({ timeout: 60_000 });

    // 压缩比徽章必须出现，且是有号百分比
    const saving = page.locator('[data-testid="iet-saving"]');
    await expect(saving).toHaveText(/^[+-±]\d+%$/);

    // 输出尺寸没被动过（这个案例没有缩放）
    await expect(list).toContainText("320×240");
  });

  test("@regression 裁切与旋转会改变预告的输出尺寸", async ({ page }) => {
    await page.goto(TOOLS.imageEditor);

    const fixture = await makePngFixture(page, 400, 200);
    await page.locator('[data-testid="iet-file-input"]').setInputFiles(fixture);

    const panel = page.locator(".iet-panel");
    // 预告的输出尺寸在「尺寸」区块里，先展开，否则这些断言是在验使用者根本看不到的字
    await openSection(page, "尺寸");
    await expect(panel).toContainText("400×200 → 400×200");

    await openSection(page, "旋轉與裁切");

    // 旋转 90 度后长宽互换
    await panel.getByRole("button", { name: "↻ 右轉" }).click();
    await expect(panel).toContainText("400×200 → 200×400");

    // 进入裁切模式后可以在预览上拉出选取范围
    await page.locator('[data-testid="iet-crop-toggle"]').click();
    const cropper = page.locator(".iet-cropper");
    await expect(cropper).toBeVisible();

    // page.mouse.* 用的是 viewport 座标而且不会自动卷动，旋转后画布变高，裁切区
    // 很容易掉到折线以下 —— 先卷进可视范围再量 boundingBox，否则拖曳会落在别的元素上
    await cropper.scrollIntoViewIfNeeded();
    const box = await cropper.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.6, {
      steps: 8,
    });
    await page.mouse.up();

    await expect(page.locator(".iet-crop-box")).toBeVisible();
    // 裁切后输出尺寸必须不再是旋转后的整张 200×400。
    // 注意：字串比对会正规化空白，正则不会 —— 模板里箭头后面有换行与缩排，所以用 \s+
    await expect(panel).not.toContainText("400×200 → 200×400");
    await expect(panel).toContainText(/400×200 →\s+\d+×\d+/);
  });

  test("@regression 缩放设定会套用到输出", async ({ page }) => {
    await page.goto(TOOLS.imageEditor);

    const fixture = await makePngFixture(page, 400, 300);
    await page.locator('[data-testid="iet-file-input"]').setInputFiles(fixture);

    const panel = page.locator(".iet-panel");
    await openSection(page, "尺寸");
    // 缩放方式跟面板上其他设定一样是 segmented 按钮，不是下拉选单
    await page.locator('[data-testid="iet-resize-percent"]').click();
    await panel.getByLabel("縮放百分比").fill("50");
    await expect(panel).toContainText("400×300 → 200×150");

    await page.locator('[data-testid="iet-format-jpeg"]').click();
    await page.locator('[data-testid="iet-process"]').click();

    const list = page.locator('[data-testid="iet-list"]');
    await expect(list).toContainText("200×150", { timeout: 60_000 });
  });

  test("@regression 切换浮水印模式会显示对应的设定面板", async ({ page }) => {
    await page.goto(TOOLS.imageEditor);
    const fixture = await makePngFixture(page);
    await page.locator('[data-testid="iet-file-input"]').setInputFiles(fixture);

    await openSection(page, "浮水印");
    await page.locator('[data-testid="iet-watermark-mode-text"]').click();
    await expect(page.locator('[data-testid="iet-watermark-text-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="iet-watermark-image-input"]')).toBeHidden();

    await page.locator('[data-testid="iet-watermark-mode-image"]').click();
    await expect(page.locator('[data-testid="iet-watermark-image-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="iet-watermark-text-input"]')).toBeHidden();

    await page.locator('[data-testid="iet-watermark-mode-tiledText"]').click();
    await expect(page.locator('[data-testid="iet-watermark-tiled-text-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="iet-watermark-image-input"]')).toBeHidden();

    await page.locator('[data-testid="iet-watermark-mode-none"]').click();
    await expect(page.locator('[data-testid="iet-watermark-tiled-text-input"]')).toBeHidden();
  });

  test("@regression 文字浮水印会画在预览上，且跟处理后的档案一致", async ({ page }) => {
    await page.goto(TOOLS.imageEditor);
    const fixture = await makePngFixture(page);
    await page.locator('[data-testid="iet-file-input"]').setInputFiles(fixture);
    await expect(page.locator('[data-testid="iet-list"]')).toContainText("320×240");

    await openSection(page, "浮水印");
    await page.locator('[data-testid="iet-watermark-mode-text"]').click();
    await page.locator('[data-testid="iet-watermark-text-input"]').fill("TEST");
    await page.locator('input[aria-label="不透明度"]').fill("100");
    await page.locator("#iet-watermark-text-size").fill("18");

    // 给 canvas 重画一次的时间，再读像素确认浮水印真的画上去了（近白色像素）
    const countWhitePixels = () =>
      page.evaluate(() => {
        const canvas = document.querySelector<HTMLCanvasElement>(".iet-canvas");
        const ctx = canvas?.getContext("2d", { willReadFrequently: true });
        if (!canvas || !ctx) return 0;
        const { width, height } = canvas;
        const data = ctx.getImageData(0, 0, width, height).data;
        let count = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240) count += 1;
        }
        return count;
      });

    await expect
      .poll(countWhitePixels, { message: "预览画布上应该出现浮水印的白色像素" })
      .toBeGreaterThan(0);

    await page.locator('[data-testid="iet-format-png"]').click();
    await page.locator('[data-testid="iet-process"]').click();
    const download = page.locator('[data-testid="iet-download"]');
    await expect(download).toBeVisible({ timeout: 60_000 });

    // 下载按钮是 <button>，点击时才在内存里现造一个 <a> 触发下载，DOM 上没有 href
    // 可读——暂时接管 HTMLAnchorElement.prototype.click 来偷看那个 blob URL。
    // 下载出的档案要跟预览画面一样含有浮水印像素——两者共用同一段绘制管线（drawFrame）
    const whitePixelsInOutput = await page.evaluate(async () => {
      let capturedHref: string | null = null;
      // 拿原型方法只是为了原样放回去，不会解绑呼叫；点击时一律走 el.click()，this 正确
      // oxlint-disable-next-line typescript/unbound-method -- 见上一行说明
      const originalClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
        capturedHref = this.href;
      };
      document.querySelector<HTMLButtonElement>('[data-testid="iet-download"]')?.click();
      HTMLAnchorElement.prototype.click = originalClick;

      if (!capturedHref) return -1;
      const response = await fetch(capturedHref);
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return -1;
      ctx.drawImage(bitmap, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240) count += 1;
      }
      return count;
    });

    expect(whitePixelsInOutput).toBeGreaterThan(0);
  });

  /**
   * WebP 的无损模式。
   *
   * 这一条测的是 libwebp 的 `lossless: 1` 有没有真的被传下去 —— 光看档案大小分不出来
   * （无损档案通常比有损大，但「有损画质拉到 100」也会变大），所以直接把输出解码回来
   * 逐像素比对。会失败的情况正是把无损实作成「quality = 100」：那样仍然走有损的 YUV
   * 转换，色度会被抽掉一半，比对必定对不上。
   */
  test("@regression WebP 無損模式輸出的像素跟來源完全一致", async ({ page }) => {
    await page.goto(TOOLS.imageEditor);

    const fixture = await makePngFixture(page, 64, 48, "lossless.png");
    await page.locator('[data-testid="iet-file-input"]').setInputFiles(fixture);
    await expect(page.locator('[data-testid="iet-list"]')).toContainText("64×48");

    await page.locator('[data-testid="iet-format-webp"]').click();
    await page.locator('[data-testid="iet-webp-lossless"]').click();
    // 无损模式下滑桿调的是压缩力气，标签要跟着换掉，别再说「畫質」
    await expect(page.locator(".iet-panel")).toContainText("壓縮力氣");

    await page.locator('[data-testid="iet-process"]').click();
    const download = page.locator('[data-testid="iet-download"]');
    await expect(download).toBeVisible({ timeout: 60_000 });

    const diff = await page.evaluate(
      async ({ w, h }) => {
        let href: string | null = null;
        // oxlint-disable-next-line typescript/unbound-method -- 只是取原型方法原样放回，呼叫一律走 el.click()
        const originalClick = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
          href = this.href;
        };
        document.querySelector<HTMLButtonElement>('[data-testid="iet-download"]')?.click();
        HTMLAnchorElement.prototype.click = originalClick;
        if (!href) return null;

        const blob = await (await fetch(href)).blob();
        const bitmap = await createImageBitmap(blob);

        // 基准不拿预览画布（那张有 devicePixelRatio 与 PREVIEW_MAX 掺在里面），
        // 而是用跟 makePngFixture 一样的画法在页面里重画一次 —— canvas 2D 在同一个
        // 浏览器里是决定性的，所以这张就是解码后应该长的样子
        const reference = document.createElement("canvas");
        reference.width = w;
        reference.height = h;
        const refCtx = reference.getContext("2d", { willReadFrequently: true });
        if (!refCtx) return null;
        const gradient = refCtx.createLinearGradient(0, 0, w, h);
        gradient.addColorStop(0, "#ff5f6d");
        gradient.addColorStop(1, "#1e90ff");
        refCtx.fillStyle = gradient;
        refCtx.fillRect(0, 0, w, h);
        for (let i = 0; i < 400; i += 1) {
          refCtx.fillStyle = `hsl(${(i * 7) % 360} 80% 55%)`;
          refCtx.fillRect((i * 13) % w, (i * 29) % h, 6, 6);
        }

        if (bitmap.width !== w || bitmap.height !== h) {
          return { type: blob.type, sameSize: false, maxDelta: -1 };
        }

        const decoded = document.createElement("canvas");
        decoded.width = w;
        decoded.height = h;
        const outCtx = decoded.getContext("2d", { willReadFrequently: true });
        if (!outCtx) return null;
        outCtx.drawImage(bitmap, 0, 0);

        const expected = refCtx.getImageData(0, 0, w, h).data;
        const actual = outCtx.getImageData(0, 0, w, h).data;
        let maxDelta = 0;
        for (let i = 0; i < expected.length; i += 1) {
          const delta = Math.abs(expected[i] - actual[i]);
          if (delta > maxDelta) maxDelta = delta;
        }
        return { type: blob.type, sameSize: true, maxDelta };
      },
      { w: 64, h: 48 },
    );

    expect(diff).not.toBeNull();
    expect(diff?.type).toBe("image/webp");
    expect(diff?.sameSize).toBe(true);
    expect(diff?.maxDelta).toBe(0);
  });

  /** 三张比例各不相同的图，版面差异才量得出来。 */
  async function loadThreeShapes(page: import("@playwright/test").Page) {
    await page.goto(TOOLS.imageEditor);
    await page
      .locator('[data-testid="iet-file-input"]')
      .setInputFiles([
        await makePngFixture(page, 400, 200, "wide.png"),
        await makePngFixture(page, 200, 400, "tall.png"),
        await makePngFixture(page, 300, 300, "square.png"),
      ]);
    await expect(page.locator(".iet-item")).toHaveCount(3);
    await page.locator('[data-testid="iet-mode-collage"]').click();
  }

  test("@regression 切換拼貼版面會改變輸出尺寸", async ({ page }) => {
    await loadThreeShapes(page);

    const outputSize = page.locator('[data-testid="iet-collage-output-size"]');
    await expect(outputSize).toBeVisible();

    // 网格是等大方格，三张图排成 2x2 → 正方形输出
    await page.locator('[data-testid="iet-collage-layout-grid"]').click();
    await expect(outputSize).toHaveText("1600×1600");

    // 等宽往下接：宽度维持 1600，高度是三张按比例缩放后的总和
    await page.locator('[data-testid="iet-collage-layout-vertical"]').click();
    await expect(outputSize).toHaveText("1600×5616");

    // 等高并排：高度维持 1600，宽度是总和
    await page.locator('[data-testid="iet-collage-layout-horizontal"]').click();
    await expect(outputSize).toHaveText("5616×1600");

    // 自动排版保留比例，收尾那一列刻意不拉满，所以高度跟网格不一样
    await page.locator('[data-testid="iet-collage-layout-justified"]').click();
    await expect(outputSize).toHaveText("1600×1441");
  });

  test("@regression 拼貼把多張圖合成單一輸出", async ({ page }) => {
    await loadThreeShapes(page);
    await page.locator('[data-testid="iet-collage-layout-grid"]').click();

    // 预览画布要画出合成结果
    await expect(page.locator(".iet-canvas")).toBeVisible();
    // 拼贴模式没有单张的座标系可以拉框，裁切必须停用
    await expect(page.locator('[data-testid="iet-crop-toggle"]')).toBeDisabled();

    await page.locator('[data-testid="iet-format-webp"]').click();
    await page.locator('[data-testid="iet-process"]').click();

    const collageDownload = page.locator('[data-testid="iet-collage-download"]');
    await expect(collageDownload).toHaveCount(1, { timeout: 60_000 });
    // 关键差异：拼贴只产出一个档案，不是每张一个
    await expect(page.locator('[data-testid="iet-download"]')).toHaveCount(0);

    // 下载出来的档案尺寸要跟面板上预告的一致
    const decoded = await page.evaluate(async () => {
      let href: string | null = null;
      // oxlint-disable-next-line typescript/unbound-method -- 只是取原型方法原样放回，呼叫一律走 el.click()
      const originalClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
        href = this.href;
      };
      document.querySelector<HTMLButtonElement>('[data-testid="iet-collage-download"]')?.click();
      HTMLAnchorElement.prototype.click = originalClick;
      if (!href) return null;

      const blob = await (await fetch(href)).blob();
      const bitmap = await createImageBitmap(blob);
      return { width: bitmap.width, height: bitmap.height, type: blob.type };
    });

    expect(decoded).not.toBeNull();
    expect(decoded?.type).toBe("image/webp");
    expect(`${decoded?.width}×${decoded?.height}`).toBe(
      await page.locator('[data-testid="iet-collage-output-size"]').innerText(),
    );
  });
});
