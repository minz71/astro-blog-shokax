/// <reference lib="webworker" />

/**
 * 图片编码 Worker。
 *
 * 职责刻意收得很窄：**只做编码**。解码与所有编辑（裁切、旋转、翻转、缩放、色彩
 * 调整）都在主执行绪用 createImageBitmap + canvas 完成，Worker 收到的已经是摊平的
 * RGBA 像素。这样做的理由有三个：
 *
 * 1. 解码走浏览器原生实作，不必再多载 mozjpeg_dec / webp_dec / avif_dec 三份 wasm
 *    （光 avif_dec 就 1.1MB），下载量直接砍掉一半以上。
 * 2. 编码是唯一真正吃 CPU 的步骤（AVIF 单执行绪可以跑好几秒），放在 Worker 才不会
 *    卡住主执行绪的互动 —— 这是 INP / TBT 的关键。
 * 3. 像素资料以 transfer 移交，零复制。
 *
 * 每个 codec 都是「用到才 import」：动态 import 只在使用者真的选了那个格式并按下
 * 输出时才发生，因此岛屿的初始 chunk 里完全没有 wasm glue。
 */

import type { CodecOptionsMap, EncodeRequest, EncodeResponse } from "./types";

/*
 * 各编码器的延迟载入。刻意写成四个独立的模组层变数而不是一张 Map：这样每个
 * import() 的回传型别都被完整保留，呼叫端不需要任何 type assertion。
 */

let jpegModule: Promise<typeof import("@jsquash/jpeg/encode")> | null = null;
let webpModule: Promise<typeof import("@jsquash/webp/encode")> | null = null;
let avifModule: Promise<{
  encode: (data: ImageData, options: CodecOptionsMap["avif"]) => Uint8Array | null;
}> | null = null;
let oxipngModule: Promise<typeof import("@jsquash/oxipng/codec/pkg/squoosh_oxipng.js")> | null =
  null;

/**
 * PNG 只用 oxipng 的 optimise_raw：它直接吃 RGBA 像素，一步就产出已最佳化的 PNG，
 * 所以不需要再多载一份 squoosh_png 编码器（省下 177KB wasm）。
 *
 * 这里刻意直接指向单执行绪的 codec 档案，而不是走套件的 optimise 入口：后者会在
 * Worker 里侦测 threads() 并偏好 wasm-bindgen-rayon 的多执行绪版本，那需要
 * SharedArrayBuffer，等于要全站送 COOP/COEP 标头。为了一个工具页让整站进入
 * cross-origin isolated 状态，代价远大于收益，所以从 import 层就把那条路断掉，
 * 顺带也不会把 rayon 的 worker glue 打进 bundle。
 */
/**
 * AVIF 刻意绕过 @jsquash/avif/encode，直接实例化单执行绪的 avif_enc。
 *
 * 套件的 encode 入口会先跑 threads() 侦测，命中就改载 avif_enc_mt。那个多执行绪版本
 * 需要 SharedArrayBuffer（也就是全站 COOP/COEP），在这个站上永远不会被选到，但只要
 * 它出现在静态可分析的 import 里，Rolldown 就会照样把那 3.4MB 的 wasm 产进 dist ——
 * 白白多出一份永远不会被下载的档案。直接指名 ST 版本就没这问题。
 */
async function loadAvif() {
  avifModule ??= (async () => {
    const [{ default: moduleFactory }, { defaultOptions }] = await Promise.all([
      import("@jsquash/avif/codec/enc/avif_enc.js"),
      import("@jsquash/avif/meta.js"),
    ]);
    // noInitialRun 与套件的 initEmscriptenModule 一致：别让 wasm 自己跑 main()
    const module = await moduleFactory({ noInitialRun: true });
    return {
      encode: (data: ImageData, options: CodecOptionsMap["avif"]) =>
        module.encode(data.data, data.width, data.height, {
          ...defaultOptions,
          ...options,
        }),
    };
  })();
  return await avifModule;
}

/** wasm 线性记忆体里的 view 不能直接 transfer，复制成独立的 ArrayBuffer。 */
function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  const output = new ArrayBuffer(view.byteLength);
  new Uint8Array(output).set(view);
  return output;
}

async function loadOxipng() {
  oxipngModule ??= import("@jsquash/oxipng/codec/pkg/squoosh_oxipng.js");
  const module = await oxipngModule;
  await module.default();
  return module;
}

async function encode(request: EncodeRequest, data: ImageData): Promise<ArrayBuffer> {
  switch (request.format) {
    case "jpeg": {
      jpegModule ??= import("@jsquash/jpeg/encode");
      const { default: encodeJpeg } = await jpegModule;
      return await encodeJpeg(data, request.options);
    }
    case "webp": {
      webpModule ??= import("@jsquash/webp/encode");
      const { default: encodeWebp } = await webpModule;
      return await encodeWebp(data, request.options);
    }
    case "avif": {
      const avif = await loadAvif();
      const output = avif.encode(data, request.options);
      if (!output) throw new Error("AVIF 编码失败");
      return toArrayBuffer(output);
    }
    case "png": {
      const oxipng = await loadOxipng();
      const optimised = oxipng.optimise_raw(
        data.data,
        data.width,
        data.height,
        request.options.level,
        false,
        true,
      );
      if (optimised.byteLength === 0) throw new Error("PNG 编码失败");
      return toArrayBuffer(optimised);
    }
    default:
      // EncodeRequest 是判别联集，正常情况到不了这里；留着是为了挡住手刻的 postMessage
      throw new Error("未支援的输出格式");
  }
}

function post(message: EncodeResponse, transfer: Transferable[] = []): void {
  self.postMessage(message, { transfer });
}

self.addEventListener("message", (event: MessageEvent<EncodeRequest>) => {
  const request = event.data;
  if (!request || typeof request.id !== "number") return;

  void (async () => {
    try {
      const imageData = new ImageData(
        new Uint8ClampedArray(request.buffer),
        request.width,
        request.height,
      );
      const output = await encode(request, imageData);
      post({ id: request.id, ok: true, buffer: output }, [output]);
    } catch (error) {
      post({
        id: request.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();
});
