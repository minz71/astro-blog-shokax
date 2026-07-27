/**
 * mermaid 图表的缩放/平移视口计算（纯函数，便于单测）。
 * 组件只负责把事件转成这些调用，再把结果写成 CSS transform。
 */

export interface Viewport {
  scale: number;
  x: number;
  y: number;
}

export const MIN_SCALE = 0.4;
export const MAX_SCALE = 4;

export const IDENTITY_VIEWPORT: Viewport = { scale: 1, x: 0, y: 0 };

export function clampScale(scale: number): number {
  if (Number.isNaN(scale)) return 1;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function isIdentity(viewport: Viewport): boolean {
  return viewport.scale === 1 && viewport.x === 0 && viewport.y === 0;
}

/**
 * 以容器内某点为锚点缩放：缩放前后该点对应的图表位置保持不变，
 * 这样滚轮缩放时光标下的内容不会漂走。
 */
export function zoomAt(
  viewport: Viewport,
  factor: number,
  pointerX: number,
  pointerY: number,
): Viewport {
  const scale = clampScale(viewport.scale * factor);
  if (scale === viewport.scale) return viewport;

  const ratio = scale / viewport.scale;
  return {
    scale,
    x: pointerX - (pointerX - viewport.x) * ratio,
    y: pointerY - (pointerY - viewport.y) * ratio,
  };
}

/** 以容器中心为锚点缩放（按钮触发时使用） */
export function zoomByStep(
  viewport: Viewport,
  factor: number,
  width: number,
  height: number,
): Viewport {
  return zoomAt(viewport, factor, width / 2, height / 2);
}

export function panBy(viewport: Viewport, deltaX: number, deltaY: number): Viewport {
  return { scale: viewport.scale, x: viewport.x + deltaX, y: viewport.y + deltaY };
}

export function toTransform(viewport: Viewport): string {
  return `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`;
}
