import type { CropHandle, CropRect, EditSpec, ResizeSpec, RotateAngle } from "./types";

/**
 * 单一维度的上限。
 *
 * 会夹在 16383（2^14 - 1）而不是 16384，是因为真正最紧的约束不是 canvas 而是 **WebP**：
 * libwebp 的宽高上限就是 16383，多一个像素 `encode()` 就直接失败。实测 64x16384 会拿到
 * 「Encoding error.」，64x16383 正常输出。canvas 自己在部分浏览器超过上限是回传空白，
 * 两个理由都指向同一个数字，就用最紧的那个。
 */
export const MAX_DIMENSION = 16383;

export function createDefaultEdit(): EditSpec {
  return {
    crop: null,
    rotate: 0,
    flipH: false,
    flipV: false,
    resize: { mode: "original" },
  };
}

function toPositiveInt(value: number, fallback = 1): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.round(value));
}

/**
 * 把裁切框修成合法值：整数、不出界、至少 1x1。
 *
 * 拖曳选取时使用者很容易把框拉出图外或拉成负宽，与其在 UI 每个事件里各自防守，
 * 统一在这里正规化一次，让 canvas 的 drawImage 永远拿到有效的来源矩形。
 */
export function clampCropRect(
  rect: CropRect,
  natural: { width: number; height: number },
): CropRect {
  const maxW = toPositiveInt(natural.width);
  const maxH = toPositiveInt(natural.height);

  // 允许传入负宽/负高（由右下往左上拖），先转成左上原点 + 正尺寸
  let x = Math.round(Math.min(rect.x, rect.x + rect.width));
  let y = Math.round(Math.min(rect.y, rect.y + rect.height));
  let width = Math.round(Math.abs(rect.width));
  let height = Math.round(Math.abs(rect.height));

  if (!Number.isFinite(x)) x = 0;
  if (!Number.isFinite(y)) y = 0;
  if (!Number.isFinite(width)) width = maxW;
  if (!Number.isFinite(height)) height = maxH;

  x = Math.min(Math.max(0, x), maxW - 1);
  y = Math.min(Math.max(0, y), maxH - 1);
  width = Math.min(Math.max(1, width), maxW - x);
  height = Math.min(Math.max(1, height), maxH - y);

  return { x, y, width, height };
}

/** 旋转 90/270 度会交换宽高。 */
export function rotatedSize(
  width: number,
  height: number,
  rotate: RotateAngle,
): { width: number; height: number } {
  return rotate === 90 || rotate === 270 ? { width: height, height: width } : { width, height };
}

/** 依缩放设定算出目标尺寸，永远维持长宽比、取整、至少 1px。 */
export function resolveTargetSize(
  width: number,
  height: number,
  resize: ResizeSpec,
): { width: number; height: number } {
  const w = toPositiveInt(width);
  const h = toPositiveInt(height);

  const scaled = (ratio: number) => ({
    width: toPositiveInt(w * ratio),
    height: toPositiveInt(h * ratio),
  });

  switch (resize.mode) {
    case "percent": {
      const percent = Number.isFinite(resize.percent) ? resize.percent : 100;
      return scaled(Math.min(Math.max(percent, 1), 400) / 100);
    }
    case "width": {
      const target = toPositiveInt(resize.width, w);
      return scaled(target / w);
    }
    case "longestEdge": {
      const target = toPositiveInt(resize.edge, Math.max(w, h));
      const longest = Math.max(w, h);
      // 只缩不放：使用者输入「最长边 1920」时，本来就更小的图不该被放大而变模糊
      if (target >= longest) return { width: w, height: h };
      return scaled(target / longest);
    }
    default:
      return { width: w, height: h };
  }
}

/**
 * 旋转后的画面尺寸。裁切框的座标就定义在这个座标系里 —— 使用者是在「看到的那张图」
 * 上拉框，所以管线顺序是「旋转/翻转 → 裁切 → 缩放」，而不是先裁再转。
 */
export function rotatedFrameSize(
  natural: { width: number; height: number },
  edit: EditSpec,
): { width: number; height: number } {
  return rotatedSize(natural.width, natural.height, edit.rotate);
}

/**
 * 算出整条编辑管线（旋转/翻转 → 裁切 → 缩放）之后的输出尺寸。
 * 翻转不影响尺寸，所以不参与计算。
 */
export function outputSize(
  natural: { width: number; height: number },
  edit: EditSpec,
): { width: number; height: number } {
  const rotated = rotatedFrameSize(natural, edit);
  const cropped = edit.crop ? clampCropRect(edit.crop, rotated) : { x: 0, y: 0, ...rotated };
  const resized = resolveTargetSize(cropped.width, cropped.height, edit.resize);
  return {
    width: Math.min(toPositiveInt(resized.width), MAX_DIMENSION),
    height: Math.min(toPositiveInt(resized.height), MAX_DIMENSION),
  };
}

/** 编辑描述是否等同「原样输出」，用来决定要不要显示「已编辑」标记。 */
export function isPristine(edit: EditSpec): boolean {
  return (
    edit.crop === null &&
    edit.rotate === 0 &&
    !edit.flipH &&
    !edit.flipV &&
    edit.resize.mode === "original"
  );
}

// ── 裁切框的互动几何 ──────────────────────────────────────────
//
// 这一段跟 canvas 无关，纯粹是「使用者在框上做了什么」的算术，所以放在这里而不是
// 元件里：元件只负责把指标事件翻译成 frame 座标，剩下的都能单独测。

export const CROP_HANDLES: readonly CropHandle[] = ["nw", "n", "ne", "w", "e", "sw", "s", "se"];

export interface FramePoint {
  x: number;
  y: number;
}

/** 允许由右下往左上拖，先转成左上原点 + 正尺寸再算几何。 */
export function normalizeRect(rect: CropRect): CropRect {
  return {
    x: Math.min(rect.x, rect.x + rect.width),
    y: Math.min(rect.y, rect.y + rect.height),
    width: Math.abs(rect.width),
    height: Math.abs(rect.height),
  };
}

/**
 * 把框压回画面范围内。
 *
 * 先夹尺寸再夹位置，顺序不能反：反过来的话「把框拖出上缘」会变成把框压扁在上缘，
 * 而使用者要的是它停在那里、大小不变。跟 clampCropRect 的差别是这里不取整，
 * 拖曳过程中取整会让框在指标底下一格一格跳。
 *
 * `lockRatio` 是锁了长宽比时才要开的：两边各自夹会把比例夹坏，选了 1:1 往角落拉
 * 就会拉出一个不是正方形的「正方形」。开着的话改成两边等比缩到放得下为止。
 */
export function clampRectToFrame(
  rect: CropRect,
  frame: { width: number; height: number },
  lockRatio = false,
): CropRect {
  const norm = normalizeRect(rect);
  let width = Math.min(norm.width, frame.width);
  let height = Math.min(norm.height, frame.height);
  if (lockRatio && norm.width > 0 && norm.height > 0) {
    const scale = Math.min(1, frame.width / norm.width, frame.height / norm.height);
    width = norm.width * scale;
    height = norm.height * scale;
  }
  return {
    x: Math.min(Math.max(norm.x, 0), Math.max(0, frame.width - width)),
    y: Math.min(Math.max(norm.y, 0), Math.max(0, frame.height - height)),
    width,
    height,
  };
}

/** 把「命中了哪两条边」组成把手名称。分支写开是为了不用型别断言。 */
function handleName(vertical: "n" | "s" | "", horizontal: "w" | "e" | ""): CropHandle | null {
  if (vertical === "n") return horizontal === "w" ? "nw" : horizontal === "e" ? "ne" : "n";
  if (vertical === "s") return horizontal === "w" ? "sw" : horizontal === "e" ? "se" : "s";
  return horizontal === "" ? null : horizontal;
}

/**
 * 指标落在哪个把手上；rect 必须已正规化。
 *
 * slop 是半径不是内缩，框线外侧一两像素也算命中 —— 只认内侧的话，想抓边框就得刚好
 * 压在那一条线上，那正是「拉不动」的手感来源。呼叫端要传入换算成 frame 座标的
 * slop：写死 frame 单位的话，同一颗把手在 6000px 宽的图上会小到抓不到。
 */
export function handleAt(
  point: FramePoint,
  rect: CropRect,
  slopX: number,
  slopY: number,
): CropHandle | null {
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  if (point.x < rect.x - slopX || point.x > right + slopX) return null;
  if (point.y < rect.y - slopY || point.y > bottom + slopY) return null;
  const vertical =
    Math.abs(point.y - rect.y) <= slopY ? "n" : Math.abs(point.y - bottom) <= slopY ? "s" : "";
  const horizontal =
    Math.abs(point.x - rect.x) <= slopX ? "w" : Math.abs(point.x - right) <= slopX ? "e" : "";
  return handleName(vertical, horizontal);
}

/** 点在框里面（把手已经先判过了）就是可以整块搬动的区域。 */
export function isInsideRect(point: FramePoint, rect: CropRect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

/** 依比例修正矩形，锚点是 rect 的 x/y。ratio 为 null 代表自由比例，原样回传。 */
export function fitAspect(rect: CropRect, ratio: number | null): CropRect {
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

/**
 * 边把手锁比例时，补出来的那一边要绕着中心长。
 *
 * 沿用 fitAspect 的「锚在 x/y」会让框整个往某一侧滑走：拉右边界的时候高度只会从
 * 上缘往下长，视觉上像是框在指标底下逃跑。
 */
export function fitAspectAroundCenter(
  rect: CropRect,
  handle: CropHandle,
  ratio: number | null,
): CropRect {
  const norm = normalizeRect(rect);
  if (!ratio || ratio <= 0) return norm;
  if (handle === "w" || handle === "e") {
    const height = norm.width / ratio;
    return { ...norm, y: norm.y + (norm.height - height) / 2, height };
  }
  const width = norm.height * ratio;
  return { ...norm, x: norm.x + (norm.width - width) / 2, width };
}

/**
 * 拉把手之后的新框。startRect 必须已正规化，point 是指标的 frame 座标。
 *
 * 锁比例时角把手的锚点是**对角**而不是起拖点：用起拖点当锚点，比例补出来的那一边
 * 会把整个框往指标外面推，拉起来完全对不准。
 */
export function resizeCropRect(
  handle: CropHandle,
  startRect: CropRect,
  point: FramePoint,
  ratio: number | null,
): CropRect {
  const left = startRect.x;
  const top = startRect.y;
  const right = startRect.x + startRect.width;
  const bottom = startRect.y + startRect.height;

  if (handle === "n" || handle === "s") {
    const rect =
      handle === "n"
        ? { x: left, y: point.y, width: startRect.width, height: bottom - point.y }
        : { x: left, y: top, width: startRect.width, height: point.y - top };
    return fitAspectAroundCenter(rect, handle, ratio);
  }
  if (handle === "w" || handle === "e") {
    const rect =
      handle === "w"
        ? { x: point.x, y: top, width: right - point.x, height: startRect.height }
        : { x: left, y: top, width: point.x - left, height: startRect.height };
    return fitAspectAroundCenter(rect, handle, ratio);
  }

  const anchorX = handle === "nw" || handle === "sw" ? right : left;
  const anchorY = handle === "nw" || handle === "ne" ? bottom : top;
  return fitAspect(
    { x: anchorX, y: anchorY, width: point.x - anchorX, height: point.y - anchorY },
    ratio,
  );
}
