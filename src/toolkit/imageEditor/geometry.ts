import type { CropRect, EditSpec, ResizeSpec, RotateAngle } from "./types";

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
