import {
  MAX_DIMENSION,
  clampCropRect,
  outputSize,
  resolveTargetSize,
  rotatedFrameSize,
} from "./geometry";
import {
  computeTiledOrigins,
  resolveAnchorAlignment,
  resolveAnchorPoint,
  resolveImageOrigin,
} from "./watermarkLayout";
import { computeCollageLayout } from "./collageLayout";
import type { CollageCell, CollageLayoutResult } from "./collageLayout";
import type {
  CollageSpec,
  EditSpec,
  ImageWatermarkSpec,
  TextWatermarkSpec,
  TiledTextWatermarkSpec,
  WatermarkSpec,
} from "./types";

/** 浮水印离画面边缘的留白，画面短边的百分比；不做成滑桿，固定值就够用。 */
const WATERMARK_MARGIN_RATIO = 0.03;

function clampAlpha(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value / 100));
}

/**
 * 主执行绪的 canvas 绘制管线：解码、旋转/翻转、色彩调整、裁切、缩放。
 *
 * 全部走浏览器原生实作，不牵涉任何 wasm —— 编码器才是 wasm，住在 codecWorker 里。
 * 这样切的好处是预览可以即时重画（GPU 加速的 drawImage），而重的编码留在 Worker。
 */

/** 浏览器解码。带上 EXIF 方向，手机拍的直式照片才不会躺着。 */
export async function decodeImageFile(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // imageOrientation 不是所有浏览器都支援，退回预设行为也比整个失败好
    return await createImageBitmap(file);
  }
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) throw new Error("这个浏览器无法建立 canvas 2D 绘图环境");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return ctx;
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.min(Math.round(width), MAX_DIMENSION));
  canvas.height = Math.max(1, Math.min(Math.round(height), MAX_DIMENSION));
  return canvas;
}

/**
 * 把来源图以「旋转 + 翻转 + 色彩调整」后的样子画满整个 canvas。
 *
 * canvas 的宽高必须已经是旋转后的比例（用 rotatedFrameSize 算），这个函式只负责把
 * 内容铺满，不做裁切也不改变长宽比。预览与输出共用同一段几何，避免两边算出不同结果。
 */
function drawRotated(
  ctx: CanvasRenderingContext2D,
  source: ImageBitmap,
  edit: EditSpec,
  targetWidth: number,
  targetHeight: number,
): void {
  const quarterTurn = edit.rotate === 90 || edit.rotate === 270;
  // 在旋转后的座标系里，图本身的宽高要跟着换轴
  const drawWidth = quarterTurn ? targetHeight : targetWidth;
  const drawHeight = quarterTurn ? targetWidth : targetHeight;

  ctx.save();
  ctx.clearRect(0, 0, targetWidth, targetHeight);
  ctx.translate(targetWidth / 2, targetHeight / 2);
  if (edit.rotate !== 0) ctx.rotate((edit.rotate * Math.PI) / 180);
  // 先翻转再旋转（变换是由内往外套用），符合「先把照片镜像，再转正」的直觉
  if (edit.flipH || edit.flipV) {
    ctx.scale(edit.flipH ? -1 : 1, edit.flipV ? -1 : 1);
  }
  ctx.drawImage(source, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  ctx.restore();
}

function drawTextWatermark(
  ctx: CanvasRenderingContext2D,
  spec: TextWatermarkSpec,
  frameWidth: number,
  frameHeight: number,
): void {
  if (!spec.text.trim()) return;
  const fontSize = (spec.size / 100) * Math.min(frameWidth, frameHeight);
  if (fontSize < 1) return;
  const margin = Math.min(frameWidth, frameHeight) * WATERMARK_MARGIN_RATIO;
  const { textAlign, textBaseline } = resolveAnchorAlignment(spec.anchor);
  const { x, y } = resolveAnchorPoint(spec.anchor, frameWidth, frameHeight, margin, margin);

  ctx.save();
  ctx.globalAlpha = clampAlpha(spec.opacity);
  ctx.fillStyle = spec.color;
  ctx.font = `${fontSize}px sans-serif`;
  ctx.textAlign = textAlign;
  ctx.textBaseline = textBaseline;
  ctx.fillText(spec.text, x, y);
  ctx.restore();
}

function drawImageWatermark(
  ctx: CanvasRenderingContext2D,
  spec: ImageWatermarkSpec,
  frameWidth: number,
  frameHeight: number,
): void {
  if (!spec.bitmap) return;
  const targetWidth = (spec.scale / 100) * frameWidth;
  if (targetWidth < 1) return;
  const targetHeight = targetWidth * (spec.bitmap.height / spec.bitmap.width);
  const margin = Math.min(frameWidth, frameHeight) * WATERMARK_MARGIN_RATIO;
  const point = resolveAnchorPoint(spec.anchor, frameWidth, frameHeight, margin, margin);
  const origin = resolveImageOrigin(spec.anchor, point, targetWidth, targetHeight);

  ctx.save();
  ctx.globalAlpha = clampAlpha(spec.opacity);
  ctx.drawImage(spec.bitmap, origin.x, origin.y, targetWidth, targetHeight);
  ctx.restore();
}

/** 以固定角度重复铺满整张画面，像证件照那样的满版文字浮水印。 */
function drawTiledTextWatermark(
  ctx: CanvasRenderingContext2D,
  spec: TiledTextWatermarkSpec,
  frameWidth: number,
  frameHeight: number,
): void {
  if (!spec.text.trim()) return;
  const fontSize = (spec.size / 100) * Math.min(frameWidth, frameHeight);
  if (fontSize < 1) return;

  ctx.save();
  ctx.font = `${fontSize}px sans-serif`;
  const textWidth = ctx.measureText(spec.text).width;
  const cellWidth = textWidth + fontSize * spec.spacing;
  const cellHeight = fontSize * spec.spacing;
  const origins = computeTiledOrigins(frameWidth, frameHeight, cellWidth, cellHeight);

  ctx.globalAlpha = clampAlpha(spec.opacity);
  ctx.fillStyle = spec.color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.translate(frameWidth / 2, frameHeight / 2);
  ctx.rotate((spec.angle * Math.PI) / 180);
  for (const origin of origins) {
    ctx.fillText(spec.text, origin.x, origin.y);
  }
  ctx.restore();
}

/**
 * 浮水印必须画在 `drawRotated` 的 `ctx.restore()` 之后（也就是这个函式里，而不是塞进
 * `drawRotated` 内部）：浮水印不该被使用者对照片做的旋转/翻转/调色一并套用。
 */
function drawWatermark(
  ctx: CanvasRenderingContext2D,
  watermark: WatermarkSpec,
  frameWidth: number,
  frameHeight: number,
): void {
  switch (watermark.mode) {
    case "text":
      drawTextWatermark(ctx, watermark.text, frameWidth, frameHeight);
      return;
    case "image":
      drawImageWatermark(ctx, watermark.image, frameWidth, frameHeight);
      return;
    case "tiledText":
      drawTiledTextWatermark(ctx, watermark.tiledText, frameWidth, frameHeight);
      return;
    default:
      return;
  }
}

/**
 * 画一整个「画面」：图片本体（旋转/翻转/调色）+ 浮水印。预览与输出的第一段管线都
 * 共用这个函式，两者在裁切/缩放之前的画面（含浮水印）才会完全一致。
 *
 * `watermark` 传 null 代表这一次不要盖浮水印——拼贴的个别格子就是这样用的：浮水印
 * 只在最后合成好的整张图上盖一次，不是每格盖一次。
 */
function drawFrame(
  ctx: CanvasRenderingContext2D,
  source: ImageBitmap,
  edit: EditSpec,
  watermark: WatermarkSpec | null,
  targetWidth: number,
  targetHeight: number,
): void {
  drawRotated(ctx, source, edit, targetWidth, targetHeight);
  if (watermark) drawWatermark(ctx, watermark, targetWidth, targetHeight);
}

/** 旋转后（未裁切、未缩放）的完整画面，单图输出与拼贴的每一格都从这里出发。 */
function renderStaged(
  source: ImageBitmap,
  edit: EditSpec,
  watermark: WatermarkSpec | null,
): HTMLCanvasElement {
  const frame = rotatedFrameSize({ width: source.width, height: source.height }, edit);
  const staged = createCanvas(frame.width, frame.height);
  drawFrame(context2d(staged), source, edit, watermark, staged.width, staged.height);
  return staged;
}

export interface PreviewLayout {
  /** 预览 canvas 的像素尺寸（已含 devicePixelRatio）。 */
  width: number;
  height: number;
  /** 旋转后、未裁切的画面尺寸，裁切框的座标系就是这个。 */
  frameWidth: number;
  frameHeight: number;
}

/**
 * 画预览。刻意**不套用裁切与缩放**：裁切框由 DOM overlay 叠在上面显示，使用者才能
 * 看到框外被裁掉的部分；缩放只影响输出档，预览维持同样大小以免每次调数值画面跳动。
 */
export function renderPreview(
  canvas: HTMLCanvasElement,
  source: ImageBitmap,
  edit: EditSpec,
  watermark: WatermarkSpec,
  maxSize: number,
  pixelRatio = 1,
): PreviewLayout {
  const frame = rotatedFrameSize({ width: source.width, height: source.height }, edit);
  const fit = Math.min(1, maxSize / Math.max(frame.width, frame.height));
  const ratio = Math.max(1, Math.min(pixelRatio, 2));
  const width = Math.max(1, Math.round(frame.width * fit * ratio));
  const height = Math.max(1, Math.round(frame.height * fit * ratio));

  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;

  drawFrame(context2d(canvas), source, edit, watermark, width, height);

  return {
    width,
    height,
    frameWidth: frame.width,
    frameHeight: frame.height,
  };
}

/**
 * 逐步减半的降采样。
 *
 * 单次 drawImage 从 4000px 缩到 800px，即使开了 imageSmoothingQuality: "high"，多数
 * 浏览器也只取有限的样本，结果会有明显的锯齿与摩尔纹。每次最多砍一半、砍到接近目标
 * 再做最后一次，画质明显好得多，而且成本只是几次额外的 GPU blit。
 */
function drawDownscaled(
  source: HTMLCanvasElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  target: HTMLCanvasElement,
): void {
  let current = source;
  let cx = sx;
  let cy = sy;
  let cw = sw;
  let ch = sh;

  while (cw >= target.width * 2 && ch >= target.height * 2 && cw > 2 && ch > 2) {
    const nextW = Math.max(target.width, Math.floor(cw / 2));
    const nextH = Math.max(target.height, Math.floor(ch / 2));
    const step = createCanvas(nextW, nextH);
    context2d(step).drawImage(current, cx, cy, cw, ch, 0, 0, nextW, nextH);
    current = step;
    cx = 0;
    cy = 0;
    cw = nextW;
    ch = nextH;
  }

  context2d(target).drawImage(current, cx, cy, cw, ch, 0, 0, target.width, target.height);
}

/**
 * 跑完整条编辑管线，取出可以直接送进编码器的 RGBA 像素。
 *
 * 回传的 ImageData 底层 buffer 会在 encodeImage 里被 transfer 走，所以每次输出都要
 * 重新呼叫一次，不要重复使用同一份。
 */
export function extractImageData(
  source: ImageBitmap,
  edit: EditSpec,
  watermark: WatermarkSpec,
  /**
   * 不支援透明的格式（JPEG）要先铺一层底色，否则透明区在丢掉 alpha 之后会变成纯黑。
   * 传 null 代表保留 alpha。
   */
  flattenBackground: string | null = null,
): ImageData {
  // 第一段：以原始解析度画出旋转/翻转/调色后的完整画面 + 浮水印
  const staged = renderStaged(source, edit, watermark);

  const crop = edit.crop
    ? clampCropRect(edit.crop, { width: staged.width, height: staged.height })
    : { x: 0, y: 0, width: staged.width, height: staged.height };

  const target = resolveTargetSize(crop.width, crop.height, edit.resize);
  const output = createCanvas(target.width, target.height);

  if (flattenBackground) {
    const ctx = context2d(output);
    ctx.fillStyle = flattenBackground;
    ctx.fillRect(0, 0, output.width, output.height);
  }

  // 第二段：裁切 + 缩放。只有真的要缩小时才走多段降采样
  if (output.width < crop.width && output.height < crop.height) {
    drawDownscaled(staged, crop.x, crop.y, crop.width, crop.height, output);
  } else {
    context2d(output).drawImage(
      staged,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      output.width,
      output.height,
    );
  }

  return context2d(output).getImageData(0, 0, output.width, output.height);
}

// ── 拼贴 ──────────────────────────────────────────────────────

export interface CollageSource {
  bitmap: ImageBitmap;
  edit: EditSpec;
}

/**
 * 一格的内容：编辑后（旋转/翻转/调色）**并且已经把裁切烘进去**的画面。
 *
 * 裁切先烘进去，版面算出来的 source 矩形才能直接套用在这张 canvas 上，不必再跟 crop
 * 偏移做二次换算（少一个容易算错的地方，代价只是没裁切时省不掉的那一次 blit）。
 * 这里刻意不盖浮水印——浮水印是最后盖在整张合成图上的。
 */
function renderEditedCropped(source: ImageBitmap, edit: EditSpec): HTMLCanvasElement {
  const staged = renderStaged(source, edit, null);
  if (!edit.crop) return staged;

  const crop = clampCropRect(edit.crop, { width: staged.width, height: staged.height });
  if (
    crop.x === 0 &&
    crop.y === 0 &&
    crop.width === staged.width &&
    crop.height === staged.height
  ) {
    return staged;
  }

  const cropped = createCanvas(crop.width, crop.height);
  context2d(cropped).drawImage(
    staged,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    cropped.width,
    cropped.height,
  );
  return cropped;
}

/** 版面只看长宽比，所以要餵「旋转 + 裁切之后」的尺寸（缩放交给拼贴自己的输出尺寸）。 */
function collageSourceSize(source: CollageSource): { width: number; height: number } {
  return outputSize(
    { width: source.bitmap.width, height: source.bitmap.height },
    { ...source.edit, resize: { mode: "original" } },
  );
}

function drawCollageCell(
  ctx: CanvasRenderingContext2D,
  content: HTMLCanvasElement,
  cell: CollageCell,
): void {
  // 缩超过一半就走多段降采样，理由跟 drawDownscaled 的注释一样
  if (cell.sourceWidth >= cell.width * 2 && cell.sourceHeight >= cell.height * 2) {
    const stepped = createCanvas(cell.width, cell.height);
    drawDownscaled(
      content,
      cell.sourceX,
      cell.sourceY,
      cell.sourceWidth,
      cell.sourceHeight,
      stepped,
    );
    ctx.drawImage(stepped, cell.x, cell.y, cell.width, cell.height);
    return;
  }

  ctx.drawImage(
    content,
    cell.sourceX,
    cell.sourceY,
    cell.sourceWidth,
    cell.sourceHeight,
    cell.x,
    cell.y,
    cell.width,
    cell.height,
  );
}

/** 把所有格子合成到指定 canvas 上（canvas 尺寸由版面决定）。 */
function composeCollageInto(
  canvas: HTMLCanvasElement,
  sources: readonly CollageSource[],
  spec: CollageSpec,
  watermark: WatermarkSpec | null,
): CollageLayoutResult {
  const layout = computeCollageLayout(sources.map(collageSourceSize), spec);

  if (canvas.width !== layout.width) canvas.width = layout.width;
  if (canvas.height !== layout.height) canvas.height = layout.height;

  const ctx = context2d(canvas);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // 间距与 contain 的留白一律铺底色：留着透明的话输出 JPEG 会变成黑块
  ctx.fillStyle = spec.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (const cell of layout.cells) {
    const source = sources[cell.index];
    if (!source) continue;
    drawCollageCell(ctx, renderEditedCropped(source.bitmap, source.edit), cell);
  }

  // 浮水印只盖一次，盖在合成好的整张图上
  if (watermark) drawWatermark(ctx, watermark, canvas.width, canvas.height);

  return layout;
}

/**
 * 画拼贴预览。
 *
 * 版面先按真实设定算一次（纯数学、几乎不花钱）取得输出比例与 `clamped`，再把
 * `targetSize` 与 `gap` **同比例**缩到预览大小重算一次——只缩 targetSize 不缩 gap 的话，
 * 预览的间距看起来会比成品粗。这样预览就不必为了看一眼而合成一张全解析度大图。
 */
export function renderCollagePreview(
  canvas: HTMLCanvasElement,
  sources: readonly CollageSource[],
  spec: CollageSpec,
  watermark: WatermarkSpec,
  maxSize: number,
  pixelRatio = 1,
): { width: number; height: number; clamped: boolean } {
  const full = computeCollageLayout(sources.map(collageSourceSize), spec);
  const ratio = Math.max(1, Math.min(pixelRatio, 2));
  const fit = Math.min(1, maxSize / Math.max(full.width, full.height));
  const scale = fit * ratio;

  composeCollageInto(
    canvas,
    sources,
    {
      ...spec,
      targetSize: Math.max(1, spec.targetSize * scale),
      gap: spec.gap * scale,
    },
    watermark,
  );

  // clamped 报的是真实输出有没有被夹制，不是预览
  return { width: canvas.width, height: canvas.height, clamped: full.clamped };
}

/** 跑完拼贴合成，取出可以直接送进编码器的 RGBA 像素。 */
export function extractCollageImageData(
  sources: readonly CollageSource[],
  spec: CollageSpec,
  watermark: WatermarkSpec,
): ImageData {
  const canvas = createCanvas(1, 1);
  composeCollageInto(canvas, sources, spec, watermark);
  return context2d(canvas).getImageData(0, 0, canvas.width, canvas.height);
}
