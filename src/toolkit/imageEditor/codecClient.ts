import type { CodecOptionsMap, EncodeResponse, OutputFormat } from "./types";

/**
 * 编码 Worker 的主执行绪代理。
 *
 * Worker 是**延迟建立**的：模组载入不会开 Worker，第一次真的要编码时才开。这让
 * 岛屿即使被水合，也不会在使用者还没丢图进来之前就产生额外的执行绪与网路请求。
 */

let worker: Worker | null = null;
let nextId = 1;

/** 待回覆的请求。Worker 用 id 对应，所以不需要额外排序。 */
const pending = new Map<
  number,
  { resolve: (buffer: ArrayBuffer) => void; reject: (error: Error) => void }
>();

/**
 * 序列化闸门。编码本身在 Worker 里是同步的 wasm 呼叫，同时丢多张图进去不会更快，
 * 只会让多份 wasm heap 同时膨胀（AVIF 尤其吃记忆体）。批次处理时排队反而更稳。
 */
let queueTail: Promise<unknown> = Promise.resolve();

function ensureWorker(): Worker {
  if (worker) return worker;

  const instance = new Worker(new URL("./codecWorker.ts", import.meta.url), {
    type: "module",
    name: "image-editor-codec",
  });

  instance.addEventListener("message", (event: MessageEvent<EncodeResponse>) => {
    const message = event.data;
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.ok) {
      entry.resolve(message.buffer);
    } else {
      entry.reject(new Error(message.error));
    }
  });

  instance.addEventListener("error", (event) => {
    // Worker 整个挂掉时，所有在途请求都不会再有回覆，必须主动 reject
    const error = new Error(event.message || "编码器载入失败");
    for (const [, entry] of pending) entry.reject(error);
    pending.clear();
    disposeCodecWorker();
  });

  worker = instance;
  return instance;
}

/**
 * 把像素资料送进 Worker 编码。
 *
 * `imageData` 的底层 buffer 会被 transfer 走（零复制），呼叫后该 ImageData 即失效，
 * 请为每次输出重新产生一份。
 */
export function encodeImage<F extends OutputFormat>(
  imageData: ImageData,
  format: F,
  options: CodecOptionsMap[F],
): Promise<ArrayBuffer> {
  const run = () =>
    new Promise<ArrayBuffer>((resolve, reject) => {
      const instance = ensureWorker();
      const id = nextId++;
      pending.set(id, { resolve, reject });
      const buffer = imageData.data.buffer;
      instance.postMessage(
        {
          id,
          format,
          options,
          width: imageData.width,
          height: imageData.height,
          buffer,
        },
        [buffer],
      );
    });

  // 不论前一笔成功或失败都要接下去，否则一次错误会永久堵住队列
  const result = queueTail.then(run, run);
  queueTail = result.catch(() => undefined);
  return result;
}

/** 收掉 Worker 与它持有的 wasm 记忆体。清空输入清单时呼叫。 */
export function disposeCodecWorker(): void {
  worker?.terminate();
  worker = null;
  pending.clear();
  queueTail = Promise.resolve();
}
