import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { createStore } from "solid-js/store";

import { disposeCodecWorker, encodeImage } from "@/toolkit/imageEditor/codecClient";
import {
  createDefaultEdit,
  isPristine,
  outputSize,
  rotatedFrameSize,
} from "@/toolkit/imageEditor/geometry";
import {
  formatBytes,
  formatSaving,
  outputFileName,
  savingRatio,
} from "@/toolkit/imageEditor/naming";
import {
  DEFAULT_PNG_LEVEL,
  EXTENSIONS,
  MIME_TYPES,
  OUTPUT_FORMATS,
  PNG_LEVEL_MAX,
  PNG_LEVEL_MIN,
  clampPngLevel,
  clampQuality,
  defaultQuality,
  isLossy,
  optionsForQuality,
} from "@/toolkit/imageEditor/presets";
import {
  decodeImageFile,
  extractCollageImageData,
  extractImageData,
  renderCollagePreview,
  renderPreview,
} from "@/toolkit/imageEditor/render";
import type { CollageSource } from "@/toolkit/imageEditor/render";
import {
  WATERMARK_ANCHORS,
  WATERMARK_ANCHOR_LABELS,
  createDefaultWatermark,
} from "@/toolkit/imageEditor/watermarkLayout";
import {
  COLLAGE_LAYOUTS,
  computeCollageLayout,
  createDefaultCollage,
} from "@/toolkit/imageEditor/collageLayout";
import type {
  CollageLayout,
  CollageSpec,
  CropRect,
  EditSpec,
  OutputFormat,
  ResizeSpec,
  RotateAngle,
  WatermarkMode,
  WatermarkSpec,
} from "@/toolkit/imageEditor/types";

/** 一次最多收几张。再多不是做不到，是记忆体与耐心都会先用完。 */
const MAX_FILES = 24;
/** 单档上限。超过这个大小，canvas 与 wasm heap 的风险高于工具本身的价值。 */
const MAX_FILE_BYTES = 40 * 1024 * 1024;
/** 预览的最长边（CSS 像素）。 */
const PREVIEW_MAX = 720;

interface EncodeResult {
  url: string;
  size: number;
  width: number;
  height: number;
  format: OutputFormat;
}

interface Item {
  id: number;
  file: File;
  name: string;
  originalSize: number;
  bitmap: ImageBitmap | null;
  naturalWidth: number;
  naturalHeight: number;
  edit: EditSpec;
  status: "loading" | "ready" | "working" | "done" | "error";
  error: string | null;
  result: EncodeResult | null;
}

const FORMAT_LABELS: Record<OutputFormat, string> = {
  jpeg: "JPEG",
  webp: "WebP",
  avif: "AVIF",
  png: "PNG",
};

type WebpMode = "lossy" | "lossless";

const WEBP_MODES: readonly WebpMode[] = ["lossy", "lossless"];

const WEBP_MODE_LABELS: Record<WebpMode, string> = {
  lossy: "有損",
  lossless: "無損",
};

/** 缩放方式在 UI 上的顺序。有了这张表就不用对 Object.entries 的 string key 做断言。 */
const RESIZE_MODES: readonly ResizeSpec["mode"][] = ["original", "percent", "width", "longestEdge"];

/** 面板只有 17rem 宽，四个选项挤一排，标签要短；完整语意靠下面的输入栏与单位说明。 */
const RESIZE_LABELS: Record<ResizeSpec["mode"], string> = {
  original: "原始",
  percent: "百分比",
  width: "寬度",
  longestEdge: "最長邊",
};

const ASPECT_RATIOS: { label: string; value: number | null }[] = [
  { label: "自由", value: null },
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "16:9", value: 16 / 9 },
];

const WATERMARK_MODES: readonly WatermarkMode[] = ["none", "text", "image", "tiledText"];

const WATERMARK_MODE_LABELS: Record<WatermarkMode, string> = {
  none: "無",
  text: "文字",
  image: "圖片",
  tiledText: "滿版文字",
};

/** 批次：N 张进 N 张出。拼贴：N 张合成一张。 */
type ToolMode = "batch" | "collage";

const TOOL_MODES: readonly ToolMode[] = ["batch", "collage"];

const TOOL_MODE_LABELS: Record<ToolMode, string> = {
  batch: "批次處理",
  collage: "拼貼",
};

const COLLAGE_LAYOUT_LABELS: Record<CollageLayout, string> = {
  grid: "網格",
  vertical: "垂直接圖",
  horizontal: "水平並排",
  justified: "自動排版",
};

const COLLAGE_FITS: readonly CollageSpec["fit"][] = ["cover", "contain"];

const COLLAGE_FIT_LABELS: Record<CollageSpec["fit"], string> = {
  cover: "裁切填滿",
  contain: "完整留白",
};

/** 座标换成百分比，裁切框才能不受预览显示尺寸影响地对齐。 */
const pct = (value: number, total: number) => `${((value / total) * 100).toFixed(3)}%`;

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function releaseResult(item: Item): void {
  if (item.result) {
    URL.revokeObjectURL(item.result.url);
    item.result = null;
  }
}

function downloadUrl(url: string, fileName: string): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.click();
}

function download(item: Item): void {
  if (!item.result) return;
  downloadUrl(item.result.url, outputFileName(item.name, item.result.format));
}

export default function ImageEditorTool() {
  let nextItemId = 1;

  const [items, setItems] = createStore<Item[]>([]);
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [notice, setNotice] = createSignal<string | null>(null);
  const [mode, setMode] = createSignal<ToolMode>("batch");

  // 输出设定是整批共用的
  const [format, setFormat] = createSignal<OutputFormat>("webp");
  /** null 代表沿用该格式的预设画质；使用者拉过滑桿之后才会有值。 */
  const [customQuality, setCustomQuality] = createSignal<number | null>(null);
  /** PNG 无损，能调的只有 oxipng 的最佳化强度，跟画质是不同的轴。 */
  const [pngLevel, setPngLevel] = createSignal(DEFAULT_PNG_LEVEL);
  /** WebP 可以切成 libwebp 的无损模式；此时画质滑桿变成「压缩要花多少力气」。 */
  const [webpLossless, setWebpLossless] = createSignal(false);
  const [resizeMode, setResizeMode] = createSignal<ResizeSpec["mode"]>("original");
  const [resizePercent, setResizePercent] = createSignal(75);
  const [resizeWidth, setResizeWidth] = createSignal(1600);
  const [resizeEdge, setResizeEdge] = createSignal(1920);

  // 浮水印跟输出设定一样是整批共用的，不放进 item.edit
  const [watermark, setWatermark] = createStore<WatermarkSpec>(createDefaultWatermark());
  const [watermarkImageName, setWatermarkImageName] = createSignal<string | null>(null);
  const [watermarkImageError, setWatermarkImageError] = createSignal<string | null>(null);

  // 拼贴同样是整批共用的设定；拼贴只会产出一份结果，所以另外存
  const [collage, setCollage] = createStore<CollageSpec>(createDefaultCollage());
  const [collageResult, setCollageResult] = createSignal<EncodeResult | null>(null);

  // 裁切／旋转／调色是逐张的，存在各自的 item.edit 里
  const [cropMode, setCropMode] = createSignal(false);
  const [aspectRatio, setAspectRatio] = createSignal<number | null>(null);

  const [processing, setProcessing] = createSignal(false);
  const [processedCount, setProcessedCount] = createSignal(0);

  const [canvasEl, setCanvasEl] = createSignal<HTMLCanvasElement | undefined>();
  let fileInputEl: HTMLInputElement | undefined;
  const [dragOver, setDragOver] = createSignal(false);

  const selected = createMemo(() => items.find((item) => item.id === selectedId()) ?? null);

  const effectiveQuality = createMemo(() => customQuality() ?? defaultQuality(format()));

  /** 只有 WebP 有无损开关，其他格式选了也不该影响标签。 */
  const losslessWebp = createMemo(() => format() === "webp" && webpLossless());

  const resizeSpec = createMemo((): ResizeSpec => {
    switch (resizeMode()) {
      case "percent":
        return { mode: "percent", percent: resizePercent() };
      case "width":
        return { mode: "width", width: resizeWidth() };
      case "longestEdge":
        return { mode: "longestEdge", edge: resizeEdge() };
      default:
        return { mode: "original" };
    }
  });

  /** 目前选取图的旋转后画面尺寸，裁切框的座标系。 */
  const frame = createMemo(() => {
    const item = selected();
    return item
      ? rotatedFrameSize({ width: item.naturalWidth, height: item.naturalHeight }, item.edit)
      : { width: 0, height: 0 };
  });

  const predictedSize = createMemo(() => {
    const item = selected();
    return item
      ? outputSize(
          { width: item.naturalWidth, height: item.naturalHeight },
          { ...item.edit, resize: resizeSpec() },
        )
      : null;
  });

  const totals = createMemo(() => {
    let before = 0;
    let after = 0;
    let done = 0;
    for (const item of items) {
      if (!item.result) continue;
      before += item.originalSize;
      after += item.result.size;
      done += 1;
    }
    return { before, after, done };
  });

  const readyCount = createMemo(() => items.filter((item) => item.bitmap !== null).length);
  const doneCount = createMemo(() => items.filter((item) => item.result !== null).length);

  /** 拼贴的来源：所有解码完成的图，顺序就是清单顺序（用 ↑↓ 调）。 */
  const collageSources = createMemo(() => {
    const sources: CollageSource[] = [];
    for (const item of items) {
      if (!item.bitmap) continue;
      sources.push({ bitmap: item.bitmap, edit: item.edit });
    }
    return sources;
  });

  /**
   * 拼贴的输出尺寸。纯数学，直接算真实设定下的版面，不必等预览渲染回报，
   * 也顺便拿到 clamped（撞到 canvas 单边上限被缩小过）。
   */
  const collageLayoutInfo = createMemo(() => {
    const sizes = collageSources().map((source) =>
      outputSize(
        { width: source.bitmap.width, height: source.bitmap.height },
        { ...source.edit, resize: { mode: "original" } },
      ),
    );
    return computeCollageLayout(sizes, collage);
  });

  /**
   * 折叠起来的区块要在标题上显示现值，不然使用者得一个个点开找自己刚改过什么。
   *
   * 逐张的 `item.edit.resize` 一直是 original（缩放是整批设定，输出时才併进去），
   * 所以 isPristine 在这里等於「有没有转过、翻过、裁过」。
   */
  const geometryEdited = createMemo(() => {
    const item = selected();
    return item ? !isPristine(item.edit) : false;
  });

  /** 拼贴模式看的是合成画面，只要有一张解码好就该显示；批次模式看选取的那一张。 */
  const canShowCanvas = createMemo(() =>
    mode() === "collage" ? collageSources().length > 0 : Boolean(selected()?.bitmap),
  );

  // 预览：只要选取的图或它的旋转／翻转／调色变了就重画。
  // 裁切不在这里处理 —— 框是叠在 canvas 上的 DOM，画布本身要保持未裁切的完整画面。
  createEffect(() => {
    const canvas = canvasEl();
    if (!canvas) return;
    const pixelRatio = typeof window === "undefined" ? 1 : window.devicePixelRatio;

    try {
      if (mode() === "collage") {
        const sources = collageSources();
        if (sources.length === 0) return;
        renderCollagePreview(canvas, sources, collage, watermark, PREVIEW_MAX, pixelRatio);
        return;
      }

      const item = selected();
      if (!item?.bitmap) return;
      renderPreview(canvas, item.bitmap, item.edit, watermark, PREVIEW_MAX, pixelRatio);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  });

  async function addFiles(fileList: FileList | File[] | null): Promise<void> {
    if (!fileList) return;
    const incoming = Array.from(fileList);
    const skipped: string[] = [];
    const accepted: File[] = [];

    for (const file of incoming) {
      if (!file.type.startsWith("image/")) {
        skipped.push(`${file.name}（不是图片）`);
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        skipped.push(`${file.name}（超过 ${formatBytes(MAX_FILE_BYTES)}）`);
        continue;
      }
      if (items.length + accepted.length >= MAX_FILES) {
        skipped.push(`${file.name}（一次最多 ${MAX_FILES} 张）`);
        continue;
      }
      accepted.push(file);
    }

    setNotice(skipped.length > 0 ? `已略过：${skipped.join("、")}` : null);

    for (const file of accepted) {
      const id = nextItemId++;
      const item: Item = {
        id,
        file,
        name: file.name,
        originalSize: file.size,
        bitmap: null,
        naturalWidth: 0,
        naturalHeight: 0,
        edit: createDefaultEdit(),
        status: "loading",
        error: null,
        result: null,
      };
      setItems(items.length, item);
      if (selectedId() === null) setSelectedId(id);

      try {
        const bitmap = await decodeImageFile(file);
        setItems((candidate) => candidate.id === id, {
          bitmap,
          naturalWidth: bitmap.width,
          naturalHeight: bitmap.height,
          status: "ready",
        });
      } catch (error) {
        setItems((candidate) => candidate.id === id, {
          status: "error",
          error: `無法解碼：${describeError(error)}`,
        });
      }
    }
  }

  function onFileInput(event: Event & { currentTarget: HTMLInputElement }): void {
    const input = event.currentTarget;
    void addFiles(input.files);
    // 清掉 value，同一个档案才能被再次选取
    input.value = "";
  }

  function onDrop(event: DragEvent): void {
    event.preventDefault();
    setDragOver(false);
    void addFiles(event.dataTransfer?.files ?? null);
  }

  function onPaste(event: ClipboardEvent): void {
    const files = Array.from(event.clipboardData?.files ?? []);
    if (files.length > 0) void addFiles(files);
  }

  function releaseCollageResult(): void {
    const result = collageResult();
    if (result) URL.revokeObjectURL(result.url);
    setCollageResult(null);
  }

  function removeItem(item: Item): void {
    releaseResult(item);
    item.bitmap?.close();
    setItems(items.filter((candidate) => candidate.id !== item.id));
    if (selectedId() === item.id) {
      const next = items[0];
      setSelectedId(next ? next.id : null);
    }
  }

  /** 清单顺序就是拼贴的摆放顺序，所以要能调。 */
  function moveItem(item: Item, delta: -1 | 1): void {
    const index = items.findIndex((candidate) => candidate.id === item.id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(target, 0, moved);
    setItems(next);
  }

  function clearAll(): void {
    for (const item of items) {
      releaseResult(item);
      item.bitmap?.close();
    }
    setItems([]);
    setSelectedId(null);
    setNotice(null);
    setProcessedCount(0);
    setCropMode(false);
    releaseCollageResult();
    // 一并收掉 Worker，把 wasm 占的记忆体还给浏览器
    disposeCodecWorker();
  }

  function rotate(delta: 90 | -90): void {
    const item = selected();
    if (!item) return;
    const next = (((item.edit.rotate + delta) % 360) + 360) % 360;
    // next 只会是 0/90/180/270：item.edit.rotate 本身是 RotateAngle，delta 只能是 ±90，
    // 模 360 之后必落在这四个值里，TS 推不出来但数学上是安全的窄化。
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 见上一行说明
    setItems((candidate) => candidate.id === item.id, "edit", "rotate", next as RotateAngle);
    // 画面转了，原本的裁切框在新座标系里已经没有意义
    setItems((candidate) => candidate.id === item.id, "edit", "crop", null);
  }

  function toggleFlip(axis: "flipH" | "flipV"): void {
    const item = selected();
    if (!item) return;
    setItems((candidate) => candidate.id === item.id, "edit", axis, !item.edit[axis]);
  }

  function resetEdit(): void {
    const item = selected();
    if (!item) return;
    setItems((candidate) => candidate.id === item.id, "edit", createDefaultEdit());
    setCropMode(false);
  }

  function clearCrop(): void {
    const item = selected();
    if (!item) return;
    setItems((candidate) => candidate.id === item.id, "edit", "crop", null);
  }

  // ── 裁切框拖曳 ──────────────────────────────────────────────

  let dragStart: { x: number; y: number } | null = null;

  /** 把指标位置换算成「旋转后画面」的像素座标。 */
  function toFramePoint(event: PointerEvent, element: HTMLElement): { x: number; y: number } {
    const rect = element.getBoundingClientRect();
    const fx = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
    const fy = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0;
    const currentFrame = frame();
    return {
      x: Math.min(Math.max(fx, 0), 1) * currentFrame.width,
      y: Math.min(Math.max(fy, 0), 1) * currentFrame.height,
    };
  }

  function applyAspect(rect: CropRect): CropRect {
    const ratio = aspectRatio();
    if (!ratio || ratio <= 0) return rect;
    const signX = rect.width < 0 ? -1 : 1;
    const signY = rect.height < 0 ? -1 : 1;
    const width = Math.abs(rect.width);
    const height = Math.abs(rect.height);
    // 以较长的那一边为准，另一边按比例算，拖曳时才不会忽大忽小
    if (width / ratio >= height) {
      return { ...rect, width: width * signX, height: (width / ratio) * signY };
    }
    return { ...rect, width: height * ratio * signX, height: height * signY };
  }

  function onCropPointerDown(event: PointerEvent & { currentTarget: HTMLElement }): void {
    const item = selected();
    if (!cropMode() || !item) return;
    const element = event.currentTarget;
    element.setPointerCapture(event.pointerId);
    dragStart = toFramePoint(event, element);
    setItems((candidate) => candidate.id === item.id, "edit", "crop", null);
  }

  function onCropPointerMove(event: PointerEvent & { currentTarget: HTMLElement }): void {
    const item = selected();
    if (!dragStart || !item) return;
    const element = event.currentTarget;
    const point = toFramePoint(event, element);
    const crop = applyAspect({
      x: dragStart.x,
      y: dragStart.y,
      width: point.x - dragStart.x,
      height: point.y - dragStart.y,
    });
    setItems((candidate) => candidate.id === item.id, "edit", "crop", crop);
  }

  function onCropPointerUp(event: PointerEvent & { currentTarget: HTMLElement }): void {
    if (!dragStart) return;
    const element = event.currentTarget;
    element.releasePointerCapture(event.pointerId);
    dragStart = null;
    // 太小的框几乎都是误触，直接丢掉比留着一个 3x3 的裁切好
    const item = selected();
    const crop = item?.edit.crop;
    if (item && crop && (Math.abs(crop.width) < 8 || Math.abs(crop.height) < 8)) {
      setItems((candidate) => candidate.id === item.id, "edit", "crop", null);
    }
  }

  /** 裁切框换算成 CSS 百分比，overlay 才能不受显示尺寸影响地对齐。 */
  const cropStyle = createMemo(() => {
    const crop = selected()?.edit.crop;
    const currentFrame = frame();
    if (!crop || currentFrame.width <= 0 || currentFrame.height <= 0) return null;
    const x = Math.min(crop.x, crop.x + crop.width);
    const y = Math.min(crop.y, crop.y + crop.height);
    const w = Math.abs(crop.width);
    const h = Math.abs(crop.height);
    return `left:${pct(x, currentFrame.width)};top:${pct(y, currentFrame.height)};width:${pct(w, currentFrame.width)};height:${pct(h, currentFrame.height)}`;
  });

  // ── 输出 ────────────────────────────────────────────────────

  async function processItem(item: Item): Promise<void> {
    if (!item.bitmap) return;
    setItems((candidate) => candidate.id === item.id, { status: "working", error: null });
    try {
      const edit: EditSpec = { ...item.edit, resize: resizeSpec() };
      // JPEG 不支援透明，先铺白底，否则透明区丢掉 alpha 会变成纯黑
      const currentFormat = format();
      const imageData = extractImageData(
        item.bitmap,
        edit,
        watermark,
        currentFormat === "jpeg" ? "#ffffff" : null,
      );
      const width = imageData.width;
      const height = imageData.height;
      const buffer = await encodeImage(
        imageData,
        currentFormat,
        optionsForQuality(currentFormat, effectiveQuality(), pngLevel(), webpLossless()),
      );
      releaseResult(item);
      const blob = new Blob([buffer], { type: MIME_TYPES[currentFormat] });
      setItems((candidate) => candidate.id === item.id, {
        status: "done",
        result: {
          url: URL.createObjectURL(blob),
          size: blob.size,
          width,
          height,
          format: currentFormat,
        },
      });
    } catch (error) {
      setItems((candidate) => candidate.id === item.id, {
        status: "error",
        error: describeError(error),
      });
    }
  }

  /** 拼贴只编码一次：整张合成图进 Worker，出来就是唯一的那个档案。 */
  async function processCollage(): Promise<void> {
    const sources = collageSources();
    if (sources.length === 0) return;
    setProcessing(true);
    setProcessedCount(0);
    try {
      const currentFormat = format();
      const imageData = extractCollageImageData(sources, collage, watermark);
      const width = imageData.width;
      const height = imageData.height;
      const buffer = await encodeImage(
        imageData,
        currentFormat,
        optionsForQuality(currentFormat, effectiveQuality(), pngLevel(), webpLossless()),
      );
      releaseCollageResult();
      const blob = new Blob([buffer], { type: MIME_TYPES[currentFormat] });
      setCollageResult({
        url: URL.createObjectURL(blob),
        size: blob.size,
        width,
        height,
        format: currentFormat,
      });
      setProcessedCount(1);
    } catch (error) {
      setNotice(describeError(error));
    } finally {
      setProcessing(false);
    }
  }

  async function processAll(): Promise<void> {
    if (processing()) return;
    if (mode() === "collage") {
      await processCollage();
      return;
    }
    setProcessing(true);
    setProcessedCount(0);
    try {
      for (const item of items) {
        if (!item.bitmap) continue;
        await processItem(item);
        setProcessedCount((count) => count + 1);
      }
    } finally {
      setProcessing(false);
    }
  }

  function downloadCollage(): void {
    const result = collageResult();
    if (!result) return;
    downloadUrl(result.url, `collage.${EXTENSIONS[result.format]}`);
  }

  async function downloadAll(): Promise<void> {
    for (const item of items) {
      if (!item.result) continue;
      download(item);
      // 连续触发多个下载会被浏览器挡掉，隔开一点比较可靠
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  async function loadWatermarkImage(file: File): Promise<void> {
    setWatermarkImageError(null);
    try {
      const bitmap = await decodeImageFile(file);
      watermark.image.bitmap?.close();
      setWatermark("image", "bitmap", bitmap);
      setWatermarkImageName(file.name);
    } catch (error) {
      setWatermarkImageError(`無法解碼：${describeError(error)}`);
    }
  }

  function onWatermarkImageInput(event: Event & { currentTarget: HTMLInputElement }): void {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) void loadWatermarkImage(file);
  }

  function clearWatermarkImage(): void {
    watermark.image.bitmap?.close();
    setWatermark("image", "bitmap", null);
    setWatermarkImageName(null);
    setWatermarkImageError(null);
  }

  onMount(() => {
    window.addEventListener("paste", onPaste);
  });

  onCleanup(() => {
    window.removeEventListener("paste", onPaste);
    for (const item of items) {
      releaseResult(item);
      item.bitmap?.close();
    }
    releaseCollageResult();
    watermark.image.bitmap?.close();
    disposeCodecWorker();
  });

  return (
    <section class="iet" aria-label="圖片編輯與壓縮工具">
      <div
        class="iet-drop"
        classList={{ "is-over": dragOver() }}
        role="button"
        tabindex="0"
        onClick={() => fileInputEl?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            fileInputEl?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => {
          setDragOver(false);
        }}
        onDrop={onDrop}
      >
        <span class="iet-drop-title">拖放圖片、貼上，或點此選擇檔案</span>
        <span class="iet-drop-hint">
          支援 JPEG / PNG / WebP / AVIF / GIF；一次最多 {MAX_FILES} 張，單檔上限{" "}
          {formatBytes(MAX_FILE_BYTES)}。所有處理都在你的瀏覽器完成，不會上傳。
        </span>
        <input
          ref={(el) => (fileInputEl = el)}
          type="file"
          accept="image/*"
          multiple
          data-testid="iet-file-input"
          onChange={onFileInput}
        />
      </div>

      <Show when={notice()}>
        <p class="iet-warn" style={{ margin: "0 1rem 0.5rem" }}>
          {notice()}
        </p>
      </Show>

      <Show when={items.length > 0}>
        <div class="iet-body">
          <div class="iet-stage">
            <Show
              when={canShowCanvas()}
              fallback={
                <p class="iet-stage-empty">
                  {selected()?.status === "loading"
                    ? "正在解碼…"
                    : (selected()?.error ?? "選一張圖片開始編輯")}
                </p>
              }
            >
              <div class="iet-canvas-wrap">
                <canvas ref={setCanvasEl} class="iet-canvas" aria-label="預覽" />
                <Show when={cropMode() && mode() === "batch"}>
                  <div
                    class="iet-cropper"
                    role="presentation"
                    onPointerDown={onCropPointerDown}
                    onPointerMove={onCropPointerMove}
                    onPointerUp={onCropPointerUp}
                    onPointerCancel={onCropPointerUp}
                  >
                    <Show when={cropStyle()}>
                      <div class="iet-crop-box" style={cropStyle() ?? undefined} />
                    </Show>
                  </div>
                </Show>
              </div>
            </Show>
          </div>

          <div class="iet-panel">
            <div class="iet-group">
              <div class="iet-group-title">
                <span>模式</span>
              </div>
              <div class="iet-segmented">
                <For each={TOOL_MODES}>
                  {(value) => (
                    <button
                      type="button"
                      aria-pressed={mode() === value}
                      data-testid={`iet-mode-${value}`}
                      onClick={() => setMode(value)}
                    >
                      {TOOL_MODE_LABELS[value]}
                    </button>
                  )}
                </For>
              </div>
              <p class="iet-note">
                {mode() === "collage"
                  ? "把清單裡的圖合成一張輸出。逐張的旋轉與翻轉會套用在各自的格子上。"
                  : "每張圖各自輸出一個檔案。"}
              </p>
            </div>

            <div class="iet-group">
              <div class="iet-group-title">
                <span>輸出</span>
                <span class="iet-group-value">
                  {format() === "png"
                    ? `PNG／強度 ${pngLevel()}`
                    : losslessWebp()
                      ? `WebP 無損／力氣 ${effectiveQuality()}`
                      : `${FORMAT_LABELS[format()]}／畫質 ${effectiveQuality()}`}
                </span>
              </div>
              <div class="iet-segmented">
                {OUTPUT_FORMATS.map((value) => (
                  <button
                    type="button"
                    aria-pressed={format() === value}
                    data-testid={`iet-format-${value}`}
                    onClick={() => {
                      setFormat(value);
                      // 换格式就回到该格式的预设画质：同一个数字在不同 codec 上的观感
                      // 并不通用，把 WebP 的 80 原封不动带到 AVIF 只会莫名变肥
                      setCustomQuality(null);
                    }}
                  >
                    {FORMAT_LABELS[value]}
                  </button>
                ))}
              </div>
              <Show when={format() === "webp"}>
                <div class="iet-segmented iet-reveal">
                  <For each={WEBP_MODES}>
                    {(value) => (
                      <button
                        type="button"
                        aria-pressed={webpLossless() === (value === "lossless")}
                        data-testid={`iet-webp-${value}`}
                        onClick={() => setWebpLossless(value === "lossless")}
                      >
                        {WEBP_MODE_LABELS[value]}
                      </button>
                    )}
                  </For>
                </div>
              </Show>
              <Show
                when={isLossy(format())}
                fallback={
                  <>
                    <label class="iet-note" for="iet-png-level">
                      最佳化強度 {pngLevel()}／{PNG_LEVEL_MAX}
                    </label>
                    <input
                      id="iet-png-level"
                      class="iet-slider"
                      type="range"
                      min={PNG_LEVEL_MIN}
                      max={PNG_LEVEL_MAX}
                      step="1"
                      data-testid="iet-png-level"
                      value={pngLevel()}
                      onInput={(event) => {
                        setPngLevel(clampPngLevel(Number(event.currentTarget.value)));
                      }}
                    />
                    <p class="iet-note">
                      PNG 走無損（oxipng），只會重新整理檔案結構，畫質一點都不會掉；強度越高檔案越
                      小，但耗時成長得很快。想真的大幅變小請改用 WebP 或 AVIF。
                    </p>
                  </>
                }
              >
                <label class="iet-note" for="iet-quality">
                  {losslessWebp() ? `壓縮力氣 ${effectiveQuality()}` : `畫質 ${effectiveQuality()}`}
                </label>
                <input
                  id="iet-quality"
                  class="iet-slider"
                  type="range"
                  min="1"
                  max="100"
                  step="1"
                  data-testid="iet-quality"
                  value={effectiveQuality()}
                  onInput={(event) => {
                    setCustomQuality(clampQuality(Number(event.currentTarget.value)));
                  }}
                />
                <Show when={losslessWebp()}>
                  <p class="iet-note iet-reveal">
                    逐像素無損，並保留透明。滑桿調的是壓縮花多少力氣：越大檔案越小、編碼越慢，畫質
                    一律不變。同一張 PNG 轉成無損 WebP 通常還能再小一截。
                  </p>
                </Show>
                <Show when={format() === "avif"}>
                  <p class="iet-note iet-reveal">
                    AVIF 壓縮率最好，但編碼器要下載 3.4 MB，而且只有單執行緒、編碼最慢，大圖請預留
                    幾秒。
                  </p>
                </Show>
              </Show>
            </div>

            <Show when={mode() === "collage"}>
              <details class="iet-fold" open>
                <summary class="iet-group-title">
                  <span>拼貼版面</span>
                  <span class="iet-group-value" data-testid="iet-collage-output-size">
                    {collageLayoutInfo().width}×{collageLayoutInfo().height}
                  </span>
                </summary>
                <div class="iet-group iet-fold-body">
                  <div class="iet-segmented">
                    <For each={COLLAGE_LAYOUTS}>
                      {(value) => (
                        <button
                          type="button"
                          aria-pressed={collage.layout === value}
                          data-testid={`iet-collage-layout-${value}`}
                          onClick={() => setCollage("layout", value)}
                        >
                          {COLLAGE_LAYOUT_LABELS[value]}
                        </button>
                      )}
                    </For>
                  </div>
                  <p class="iet-note">
                    {collage.layout === "grid"
                      ? "等大方格，每格依「填滿方式」裁切或留白。"
                      : collage.layout === "vertical"
                        ? "全部等寬往下接，適合長截圖拼接；不裁切。"
                        : collage.layout === "horizontal"
                          ? "全部等高並排，適合 before/after；不裁切。"
                          : "保留每張原始比例的自動排版：每列等高、寬度按比例分配，一張都不裁。"}
                  </p>

                  <Show when={collage.layout === "grid" || collage.layout === "justified"}>
                    <div class="iet-row iet-reveal">
                      <span class="iet-note">
                        {collage.layout === "grid" ? "列數" : "每列約幾張"}
                      </span>
                      <input
                        type="number"
                        min="1"
                        max="8"
                        value={collage.columns}
                        data-testid="iet-collage-columns"
                        onInput={(event) =>
                          setCollage("columns", Number(event.currentTarget.value))
                        }
                        aria-label={collage.layout === "grid" ? "列數" : "每列約幾張"}
                      />
                    </div>
                  </Show>

                  <Show when={collage.layout === "grid"}>
                    <div class="iet-segmented iet-reveal">
                      <For each={COLLAGE_FITS}>
                        {(value) => (
                          <button
                            type="button"
                            aria-pressed={collage.fit === value}
                            data-testid={`iet-collage-fit-${value}`}
                            onClick={() => setCollage("fit", value)}
                          >
                            {COLLAGE_FIT_LABELS[value]}
                          </button>
                        )}
                      </For>
                    </div>
                  </Show>

                  <div class="iet-row">
                    <span class="iet-note">
                      {collage.layout === "horizontal" ? "輸出高度" : "輸出寬度"}
                    </span>
                    <input
                      type="number"
                      min="1"
                      max="16383"
                      value={collage.targetSize}
                      data-testid="iet-collage-target-size"
                      onInput={(event) =>
                        setCollage("targetSize", Number(event.currentTarget.value))
                      }
                      aria-label={collage.layout === "horizontal" ? "輸出高度" : "輸出寬度"}
                    />
                    <span class="iet-note">px</span>
                  </div>

                  <div class="iet-row">
                    <span class="iet-note">間距</span>
                    <input
                      type="number"
                      min="0"
                      max="400"
                      value={collage.gap}
                      onInput={(event) => setCollage("gap", Number(event.currentTarget.value))}
                      aria-label="間距"
                    />
                    <span class="iet-note">px</span>
                    <input
                      type="color"
                      aria-label="底色"
                      value={collage.background}
                      onInput={(event) => setCollage("background", event.currentTarget.value)}
                    />
                  </div>

                  <Show when={collageLayoutInfo().clamped}>
                    <p class="iet-warn iet-reveal">
                      合成後超過單邊上限（16383px，WebP
                      編碼器的硬限制），已整體等比縮小。想要原尺寸請減少張數或 調低輸出寬度。
                    </p>
                  </Show>
                  <p class="iet-note">擺放順序就是下方清單的順序，用每一項的 ↑↓ 調整。</p>
                </div>
              </details>
            </Show>

            <Show when={mode() === "batch"}>
              <details class="iet-fold">
                <summary class="iet-group-title">
                  <span>尺寸</span>
                  <span class="iet-group-value">{RESIZE_LABELS[resizeMode()]}</span>
                </summary>
                <div class="iet-group iet-fold-body">
                  <div class="iet-segmented">
                    <For each={RESIZE_MODES}>
                      {(value) => (
                        <button
                          type="button"
                          aria-pressed={resizeMode() === value}
                          data-testid={`iet-resize-${value}`}
                          onClick={() => setResizeMode(value)}
                        >
                          {RESIZE_LABELS[value]}
                        </button>
                      )}
                    </For>
                  </div>
                  <Show when={resizeMode() === "percent"}>
                    <div class="iet-row iet-reveal">
                      <input
                        type="number"
                        min="1"
                        max="400"
                        value={resizePercent()}
                        onInput={(event) => setResizePercent(Number(event.currentTarget.value))}
                        aria-label="縮放百分比"
                      />
                      <span class="iet-note">%</span>
                    </div>
                  </Show>
                  <Show when={resizeMode() === "width"}>
                    <div class="iet-row iet-reveal">
                      <input
                        type="number"
                        min="1"
                        max="16383"
                        value={resizeWidth()}
                        onInput={(event) => setResizeWidth(Number(event.currentTarget.value))}
                        aria-label="目標寬度"
                      />
                      <span class="iet-note">px</span>
                    </div>
                  </Show>
                  <Show when={resizeMode() === "longestEdge"}>
                    <div class="iet-row iet-reveal">
                      <input
                        type="number"
                        min="1"
                        max="16383"
                        value={resizeEdge()}
                        onInput={(event) => setResizeEdge(Number(event.currentTarget.value))}
                        aria-label="最長邊上限"
                      />
                      <span class="iet-note">px（只縮不放）</span>
                    </div>
                  </Show>
                  <Show when={selected() && predictedSize()}>
                    <p class="iet-note iet-reveal">
                      {selected()?.naturalWidth}×{selected()?.naturalHeight} →{" "}
                      {predictedSize()?.width}×{predictedSize()?.height}
                    </p>
                  </Show>
                </div>
              </details>
            </Show>

            <details
              class="iet-fold"
              onToggle={(event) => {
                // 收起区块的时候要一起退出裁切模式，否则预览上会留着一层拉不掉的十字准线
                // 而画面上已经没有任何可以关掉它的控件了。裁切框本身存在 item.edit.crop，
                // 退出模式不会把它清掉。
                if (!event.currentTarget.open) setCropMode(false);
              }}
            >
              <summary class="iet-group-title">
                <span>旋轉與裁切</span>
                <span class="iet-group-value">{geometryEdited() ? "已調整" : "原樣"}</span>
              </summary>
              <div class="iet-group iet-fold-body">
                <div class="iet-icon-row">
                  <button
                    class="iet-btn"
                    type="button"
                    disabled={!selected()?.bitmap}
                    onClick={() => rotate(-90)}
                  >
                    ↺ 左轉
                  </button>
                  <button
                    class="iet-btn"
                    type="button"
                    disabled={!selected()?.bitmap}
                    onClick={() => rotate(90)}
                  >
                    ↻ 右轉
                  </button>
                  <button
                    class="iet-btn"
                    type="button"
                    aria-pressed={selected()?.edit.flipH ?? false}
                    disabled={!selected()?.bitmap}
                    onClick={() => toggleFlip("flipH")}
                  >
                    ⇄ 水平
                  </button>
                  <button
                    class="iet-btn"
                    type="button"
                    aria-pressed={selected()?.edit.flipV ?? false}
                    disabled={!selected()?.bitmap}
                    onClick={() => toggleFlip("flipV")}
                  >
                    ⇅ 垂直
                  </button>
                  {/* 裁切跟旋转翻转同一排：它自己占一行的时候只是一颗孤零零的按钮。
                      比例锁与清除框才是「进了裁切模式」之后才该出现的东西，那才值得独立一行 */}
                  <button
                    class="iet-btn"
                    type="button"
                    aria-pressed={cropMode()}
                    disabled={!selected()?.bitmap || mode() === "collage"}
                    data-testid="iet-crop-toggle"
                    onClick={() => setCropMode((value) => !value)}
                  >
                    ▣ 裁切
                  </button>
                </div>
                <Show when={cropMode() && mode() === "batch"}>
                  <div class="iet-icon-row iet-reveal">
                    <For each={ASPECT_RATIOS}>
                      {(ratio) => (
                        <button
                          class="iet-btn"
                          type="button"
                          aria-pressed={aspectRatio() === ratio.value}
                          onClick={() => setAspectRatio(ratio.value)}
                        >
                          {ratio.label}
                        </button>
                      )}
                    </For>
                    <button class="iet-btn" type="button" onClick={clearCrop}>
                      清除框
                    </button>
                  </div>
                  <p class="iet-note iet-reveal">在預覽上拖曳選取要保留的範圍。</p>
                </Show>
                <Show when={mode() === "collage"}>
                  <p class="iet-note">
                    拼貼模式的預覽是合成畫面，沒有單張的座標系可以拉框，所以裁切先停用；旋轉與翻轉照樣
                    會套用在那一張自己的格子上。
                  </p>
                </Show>
              </div>
            </details>

            <details class="iet-fold">
              <summary class="iet-group-title">
                <span>浮水印</span>
                <span class="iet-group-value">{WATERMARK_MODE_LABELS[watermark.mode]}</span>
              </summary>
              <div class="iet-group iet-fold-body">
                <div class="iet-segmented">
                  <For each={WATERMARK_MODES}>
                    {(watermarkMode) => (
                      <button
                        type="button"
                        aria-pressed={watermark.mode === watermarkMode}
                        data-testid={`iet-watermark-mode-${watermarkMode}`}
                        onClick={() => setWatermark("mode", watermarkMode)}
                      >
                        {WATERMARK_MODE_LABELS[watermarkMode]}
                      </button>
                    )}
                  </For>
                </div>

                <Show when={watermark.mode === "text"}>
                  <div class="iet-row iet-reveal">
                    <input
                      type="text"
                      placeholder="輸入浮水印文字"
                      value={watermark.text.text}
                      data-testid="iet-watermark-text-input"
                      onInput={(event) => setWatermark("text", "text", event.currentTarget.value)}
                    />
                  </div>
                  <div class="iet-row">
                    <input
                      type="color"
                      aria-label="文字顏色"
                      value={watermark.text.color}
                      onInput={(event) => setWatermark("text", "color", event.currentTarget.value)}
                    />
                    <input
                      class="iet-slider"
                      type="range"
                      min="0"
                      max="100"
                      aria-label="不透明度"
                      value={watermark.text.opacity}
                      onInput={(event) =>
                        setWatermark("text", "opacity", Number(event.currentTarget.value))
                      }
                    />
                    <span class="iet-note">{watermark.text.opacity}%</span>
                  </div>
                  <label class="iet-note" for="iet-watermark-text-size">
                    字級 {watermark.text.size}%
                  </label>
                  <input
                    id="iet-watermark-text-size"
                    class="iet-slider"
                    type="range"
                    min="2"
                    max="20"
                    value={watermark.text.size}
                    onInput={(event) =>
                      setWatermark("text", "size", Number(event.currentTarget.value))
                    }
                  />
                  <div class="iet-anchor-grid">
                    <For each={WATERMARK_ANCHORS}>
                      {(anchor) => (
                        <button
                          class="iet-btn"
                          type="button"
                          aria-pressed={watermark.text.anchor === anchor}
                          onClick={() => setWatermark("text", "anchor", anchor)}
                        >
                          {WATERMARK_ANCHOR_LABELS[anchor]}
                        </button>
                      )}
                    </For>
                  </div>
                </Show>

                <Show when={watermark.mode === "image"}>
                  <div class="iet-row iet-reveal">
                    <input
                      type="file"
                      accept="image/*"
                      data-testid="iet-watermark-image-input"
                      onChange={onWatermarkImageInput}
                    />
                  </div>
                  <Show when={watermarkImageError()}>
                    <p class="iet-warn">{watermarkImageError()}</p>
                  </Show>
                  <Show when={watermarkImageName()}>
                    <p class="iet-note">
                      已載入：{watermarkImageName()}{" "}
                      <button class="iet-btn" type="button" onClick={clearWatermarkImage}>
                        移除
                      </button>
                    </p>
                  </Show>
                  <div class="iet-row">
                    <input
                      class="iet-slider"
                      type="range"
                      min="0"
                      max="100"
                      aria-label="不透明度"
                      value={watermark.image.opacity}
                      onInput={(event) =>
                        setWatermark("image", "opacity", Number(event.currentTarget.value))
                      }
                    />
                    <span class="iet-note">{watermark.image.opacity}%</span>
                  </div>
                  <label class="iet-note" for="iet-watermark-image-scale">
                    大小 {watermark.image.scale}%
                  </label>
                  <input
                    id="iet-watermark-image-scale"
                    class="iet-slider"
                    type="range"
                    min="5"
                    max="60"
                    value={watermark.image.scale}
                    onInput={(event) =>
                      setWatermark("image", "scale", Number(event.currentTarget.value))
                    }
                  />
                  <div class="iet-anchor-grid">
                    <For each={WATERMARK_ANCHORS}>
                      {(anchor) => (
                        <button
                          class="iet-btn"
                          type="button"
                          aria-pressed={watermark.image.anchor === anchor}
                          onClick={() => setWatermark("image", "anchor", anchor)}
                        >
                          {WATERMARK_ANCHOR_LABELS[anchor]}
                        </button>
                      )}
                    </For>
                  </div>
                </Show>

                <Show when={watermark.mode === "tiledText"}>
                  <div class="iet-row iet-reveal">
                    <input
                      type="text"
                      placeholder="輸入重複鋪滿的文字"
                      value={watermark.tiledText.text}
                      data-testid="iet-watermark-tiled-text-input"
                      onInput={(event) =>
                        setWatermark("tiledText", "text", event.currentTarget.value)
                      }
                    />
                  </div>
                  <div class="iet-row">
                    <input
                      type="color"
                      aria-label="文字顏色"
                      value={watermark.tiledText.color}
                      onInput={(event) =>
                        setWatermark("tiledText", "color", event.currentTarget.value)
                      }
                    />
                    <input
                      class="iet-slider"
                      type="range"
                      min="0"
                      max="100"
                      aria-label="不透明度"
                      value={watermark.tiledText.opacity}
                      onInput={(event) =>
                        setWatermark("tiledText", "opacity", Number(event.currentTarget.value))
                      }
                    />
                    <span class="iet-note">{watermark.tiledText.opacity}%</span>
                  </div>
                  <label class="iet-note" for="iet-watermark-tiled-size">
                    字級 {watermark.tiledText.size}%
                  </label>
                  <input
                    id="iet-watermark-tiled-size"
                    class="iet-slider"
                    type="range"
                    min="2"
                    max="16"
                    value={watermark.tiledText.size}
                    onInput={(event) =>
                      setWatermark("tiledText", "size", Number(event.currentTarget.value))
                    }
                  />
                  <label class="iet-note" for="iet-watermark-tiled-angle">
                    角度 {watermark.tiledText.angle}°
                  </label>
                  <input
                    id="iet-watermark-tiled-angle"
                    class="iet-slider"
                    type="range"
                    min="-90"
                    max="90"
                    value={watermark.tiledText.angle}
                    onInput={(event) =>
                      setWatermark("tiledText", "angle", Number(event.currentTarget.value))
                    }
                  />
                  <label class="iet-note" for="iet-watermark-tiled-spacing">
                    間距 {watermark.tiledText.spacing}×
                  </label>
                  <input
                    id="iet-watermark-tiled-spacing"
                    class="iet-slider"
                    type="range"
                    min="1.2"
                    max="5"
                    step="0.1"
                    value={watermark.tiledText.spacing}
                    onInput={(event) =>
                      setWatermark("tiledText", "spacing", Number(event.currentTarget.value))
                    }
                  />
                </Show>
              </div>
            </details>

            <button
              class="iet-btn iet-btn-primary"
              type="button"
              disabled={processing() || readyCount() === 0}
              data-testid="iet-process"
              onClick={processAll}
            >
              {processing()
                ? mode() === "collage"
                  ? "合成中…"
                  : `處理中 ${processedCount()}/${readyCount()}…`
                : mode() === "collage"
                  ? `合成拼貼（${readyCount()} 張）`
                  : `開始處理（${readyCount()} 張）`}
            </button>
            <button
              class="iet-btn"
              type="button"
              disabled={!selected()?.bitmap}
              onClick={resetEdit}
            >
              重設這張的編輯
            </button>

            <Show when={collageResult()}>
              {(result) => (
                <div class="iet-group">
                  <div class="iet-group-title">
                    <span>拼貼結果</span>
                    <span class="iet-group-value">
                      {result().width}×{result().height}
                    </span>
                  </div>
                  <p class="iet-note">
                    {FORMAT_LABELS[result().format]}／{formatBytes(result().size)}
                  </p>
                  <button
                    class="iet-btn"
                    type="button"
                    data-testid="iet-collage-download"
                    onClick={downloadCollage}
                  >
                    下載拼貼
                  </button>
                </div>
              )}
            </Show>
          </div>
        </div>

        <ul class="iet-list" data-testid="iet-list">
          <For each={items}>
            {(item, index) => (
              <li>
                <div
                  class="iet-item"
                  classList={{ "is-selected": item.id === selectedId() }}
                  role="button"
                  tabindex="0"
                  onClick={() => setSelectedId(item.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedId(item.id);
                    }
                  }}
                >
                  <span class="iet-item-index">{index() + 1}</span>
                  <span class="iet-item-main">
                    <span class="iet-item-name" title={item.name}>
                      {item.name}
                    </span>
                    <span class="iet-item-meta">
                      <span>{formatBytes(item.originalSize)}</span>
                      <Show
                        when={item.result}
                        fallback={
                          item.status === "working" ? (
                            <span class="iet-status">編碼中…</span>
                          ) : item.status === "loading" ? (
                            <span class="iet-status">解碼中…</span>
                          ) : item.error ? (
                            <span class="iet-error">{item.error}</span>
                          ) : (
                            <span class="iet-status">
                              {item.naturalWidth}×{item.naturalHeight}
                            </span>
                          )
                        }
                      >
                        {(result) => (
                          <>
                            <span>→ {formatBytes(result().size)}</span>
                            <span
                              class="iet-badge"
                              classList={{
                                "is-good": savingRatio(item.originalSize, result().size) > 0,
                                "is-bad": savingRatio(item.originalSize, result().size) < 0,
                              }}
                              data-testid="iet-saving"
                            >
                              {formatSaving(item.originalSize, result().size)}
                            </span>
                            <span>
                              {result().width}×{result().height}
                            </span>
                          </>
                        )}
                      </Show>
                    </span>
                  </span>
                  <span class="iet-item-actions">
                    <button
                      class="iet-btn"
                      type="button"
                      aria-label={`把 ${item.name} 往前移`}
                      disabled={index() === 0}
                      onClick={(event) => {
                        event.stopPropagation();
                        moveItem(item, -1);
                      }}
                    >
                      ↑
                    </button>
                    <button
                      class="iet-btn"
                      type="button"
                      aria-label={`把 ${item.name} 往後移`}
                      disabled={index() === items.length - 1}
                      onClick={(event) => {
                        event.stopPropagation();
                        moveItem(item, 1);
                      }}
                    >
                      ↓
                    </button>
                    <Show when={item.result}>
                      <button
                        class="iet-btn"
                        type="button"
                        data-testid="iet-download"
                        onClick={(event) => {
                          event.stopPropagation();
                          download(item);
                        }}
                      >
                        下載
                      </button>
                    </Show>
                    <button
                      class="iet-btn"
                      type="button"
                      aria-label={`移除 ${item.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        removeItem(item);
                      }}
                    >
                      ✕
                    </button>
                  </span>
                </div>
              </li>
            )}
          </For>
        </ul>

        <div class="iet-actions">
          <span class="iet-summary">
            {mode() === "collage"
              ? collageResult()
                ? `已合成 ${readyCount()} 張：${collageLayoutInfo().width}×${collageLayoutInfo().height}／${formatBytes(collageResult()?.size ?? 0)}`
                : "設定好版面之後按「合成拼貼」"
              : totals().done > 0
                ? `已完成 ${totals().done} 張：${formatBytes(totals().before)} → ${formatBytes(totals().after)}（${formatSaving(totals().before, totals().after)}）`
                : "設定好之後按「開始處理」"}
          </span>
          <span class="iet-spacer" />
          <Show
            when={mode() === "collage"}
            fallback={
              <button
                class="iet-btn"
                type="button"
                disabled={doneCount() === 0}
                onClick={downloadAll}
              >
                全部下載
              </button>
            }
          >
            <button
              class="iet-btn"
              type="button"
              disabled={!collageResult()}
              onClick={downloadCollage}
            >
              下載拼貼
            </button>
          </Show>
          <button class="iet-btn" type="button" onClick={clearAll}>
            清空
          </button>
        </div>
      </Show>
    </section>
  );
}
