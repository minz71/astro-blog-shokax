import type { WatermarkAnchor, WatermarkSpec } from "./types";

/** 九宫格锚点的显示顺序，供 UI 的 3×3 按钮网格 `.map()` 用。 */
export const WATERMARK_ANCHORS: readonly WatermarkAnchor[] = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "middle-center",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

export const WATERMARK_ANCHOR_LABELS: Record<WatermarkAnchor, string> = {
  "top-left": "左上",
  "top-center": "上",
  "top-right": "右上",
  "middle-left": "左",
  "middle-center": "中",
  "middle-right": "右",
  "bottom-left": "左下",
  "bottom-center": "下",
  "bottom-right": "右下",
};

interface AnchorParts {
  vertical: "top" | "middle" | "bottom";
  horizontal: "left" | "center" | "right";
}

/**
 * 逐个列出九宫格锚点拆开的垂直/水平分量，而不是 `anchor.split("-")` 后转型——
 * `split` 回传的是宽松的 `string[]`，窄化回 `AnchorParts` 需要类型断言；固定枚举
 * 九种组合虽然多打几行，但完全不需要断言。
 */
const ANCHOR_PARTS: Record<WatermarkAnchor, AnchorParts> = {
  "top-left": { vertical: "top", horizontal: "left" },
  "top-center": { vertical: "top", horizontal: "center" },
  "top-right": { vertical: "top", horizontal: "right" },
  "middle-left": { vertical: "middle", horizontal: "left" },
  "middle-center": { vertical: "middle", horizontal: "center" },
  "middle-right": { vertical: "middle", horizontal: "right" },
  "bottom-left": { vertical: "bottom", horizontal: "left" },
  "bottom-center": { vertical: "bottom", horizontal: "center" },
  "bottom-right": { vertical: "bottom", horizontal: "right" },
};

function parseAnchor(anchor: WatermarkAnchor): AnchorParts {
  return ANCHOR_PARTS[anchor];
}

/**
 * 锚点换算成 canvas 原生的文字对齐方式。
 *
 * 刻意把 `WatermarkAnchor` 的字面值取成跟 `CanvasTextAlign`/`CanvasTextBaseline` 一致
 * （`center`/`middle`/`top`/`bottom`/`left`/`right`），这里才不需要额外的对照表。
 */
export function resolveAnchorAlignment(anchor: WatermarkAnchor): {
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
} {
  const { horizontal, vertical } = parseAnchor(anchor);
  return { textAlign: horizontal, textBaseline: vertical };
}

/** 锚点在画面上的参考点，`marginX`/`marginY` 是离边缘的留白（像素）。 */
export function resolveAnchorPoint(
  anchor: WatermarkAnchor,
  frameWidth: number,
  frameHeight: number,
  marginX: number,
  marginY: number,
): { x: number; y: number } {
  const { horizontal, vertical } = parseAnchor(anchor);
  const x =
    horizontal === "left"
      ? marginX
      : horizontal === "right"
        ? frameWidth - marginX
        : frameWidth / 2;
  const y =
    vertical === "top" ? marginY : vertical === "bottom" ? frameHeight - marginY : frameHeight / 2;
  return { x, y };
}

/**
 * 图片浮水印没有原生的对齐可用，锚点参考点要换算成矩形的左上角绘制原点。
 */
export function resolveImageOrigin(
  anchor: WatermarkAnchor,
  point: { x: number; y: number },
  width: number,
  height: number,
): { x: number; y: number } {
  const { horizontal, vertical } = parseAnchor(anchor);
  const x =
    horizontal === "left"
      ? point.x
      : horizontal === "right"
        ? point.x - width
        : point.x - width / 2;
  const y =
    vertical === "top" ? point.y : vertical === "bottom" ? point.y - height : point.y - height / 2;
  return { x, y };
}

/**
 * 满版重复的网格中心点，相对画面中心 (0, 0) 展开。
 *
 * 用画面对角线长度当覆盖边长，再多铺一圈（+2 格），保证平移＋旋转任意角度之后，
 * 四个角落都不会露出没盖到的空白。
 */
export function computeTiledOrigins(
  frameWidth: number,
  frameHeight: number,
  cellWidth: number,
  cellHeight: number,
): { x: number; y: number }[] {
  const safeCellWidth = Math.max(1, cellWidth);
  const safeCellHeight = Math.max(1, cellHeight);
  const diagonal = Math.hypot(frameWidth, frameHeight);
  const cols = Math.max(1, Math.ceil(diagonal / safeCellWidth)) + 2;
  const rows = Math.max(1, Math.ceil(diagonal / safeCellHeight)) + 2;
  const halfWidth = (cols * safeCellWidth) / 2;
  const halfHeight = (rows * safeCellHeight) / 2;

  const origins: { x: number; y: number }[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      origins.push({
        x: -halfWidth + safeCellWidth / 2 + col * safeCellWidth,
        y: -halfHeight + safeCellHeight / 2 + row * safeCellHeight,
      });
    }
  }
  return origins;
}

export function createDefaultWatermark(): WatermarkSpec {
  return {
    mode: "none",
    text: { text: "", color: "#ffffff", opacity: 60, size: 5, anchor: "bottom-right" },
    image: { bitmap: null, opacity: 80, scale: 20, anchor: "bottom-right" },
    tiledText: { text: "", color: "#ffffff", opacity: 25, size: 6, angle: -30, spacing: 2.5 },
  };
}
