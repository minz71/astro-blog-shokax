import { MAX_DIMENSION } from "./geometry";
import type { CollageLayout, CollageSpec } from "./types";

/**
 * 拼贴的版面计算。
 *
 * 纯几何、不碰 canvas —— 跟 geometry.ts 一样，实际绘制在 render.ts。之所以要独立成一个
 * 模块：四种版面各有一套算法（尤其 justified 的贪心分列），是这个功能里最容易算错、也最
 * 值得写测试的部分，抽出来才测得到。
 */

export const COLLAGE_LAYOUTS: readonly CollageLayout[] = [
  "grid",
  "vertical",
  "horizontal",
  "justified",
];

export interface CollageCell {
  /** 对应传入 sources 的索引。 */
  index: number;
  /** 画到输出画布上的位置与大小。 */
  x: number;
  y: number;
  width: number;
  height: number;
  /** 从来源图取哪一块（只有 grid + cover 会真的裁切，其余是整张）。 */
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
}

export interface CollageLayoutResult {
  width: number;
  height: number;
  cells: CollageCell[];
  /** 整体超过 MAX_DIMENSION 被等比缩小过。UI 要据此提示使用者。 */
  clamped: boolean;
}

export interface CollageSourceSize {
  width: number;
  height: number;
}

export function createDefaultCollage(): CollageSpec {
  return {
    layout: "grid",
    columns: 2,
    gap: 8,
    background: "#ffffff",
    fit: "cover",
    targetSize: 1600,
  };
}

function positive(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

/** 长宽比。来源尺寸有可能是 0（还没解码完），统一退回 1 免得后面除到 Infinity。 */
function aspectOf(source: CollageSourceSize): number {
  const width = positive(source.width, 1);
  const height = positive(source.height, 1);
  return width / height;
}

/** 整张来源图，不裁切。 */
function fullSource(source: CollageSourceSize) {
  return {
    sourceX: 0,
    sourceY: 0,
    sourceWidth: positive(source.width, 1),
    sourceHeight: positive(source.height, 1),
  };
}

/**
 * 把来源图居中裁成目标格子的比例（cover）。
 *
 * 缩放倍率取两轴的较大值，于是较长的那一轴会溢出格子，把溢出的部分从来源两侧对称切掉。
 */
function coverSource(source: CollageSourceSize, cellWidth: number, cellHeight: number) {
  const width = positive(source.width, 1);
  const height = positive(source.height, 1);
  const scale = Math.max(cellWidth / width, cellHeight / height);
  const visibleWidth = Math.min(width, cellWidth / scale);
  const visibleHeight = Math.min(height, cellHeight / scale);
  return {
    sourceX: (width - visibleWidth) / 2,
    sourceY: (height - visibleHeight) / 2,
    sourceWidth: visibleWidth,
    sourceHeight: visibleHeight,
  };
}

/** 等大方格。 */
function layoutGrid(
  sources: readonly CollageSourceSize[],
  spec: CollageSpec,
): { width: number; height: number; cells: CollageCell[] } {
  const columns = Math.max(1, Math.round(positive(spec.columns, 2)));
  const gap = Math.max(0, spec.gap);
  const totalWidth = positive(spec.targetSize, 1600);
  const cellSize = Math.max(1, (totalWidth - gap * (columns - 1)) / columns);
  const rows = Math.max(1, Math.ceil(sources.length / columns));

  const cells: CollageCell[] = sources.map((source, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const cellX = column * (cellSize + gap);
    const cellY = row * (cellSize + gap);

    if (spec.fit === "contain") {
      // 完整显示：缩到格子内并居中，格子剩下的地方留给底色
      const scale = Math.min(
        cellSize / positive(source.width, 1),
        cellSize / positive(source.height, 1),
      );
      const drawWidth = positive(source.width, 1) * scale;
      const drawHeight = positive(source.height, 1) * scale;
      return {
        index,
        x: cellX + (cellSize - drawWidth) / 2,
        y: cellY + (cellSize - drawHeight) / 2,
        width: drawWidth,
        height: drawHeight,
        ...fullSource(source),
      };
    }

    return {
      index,
      x: cellX,
      y: cellY,
      width: cellSize,
      height: cellSize,
      ...coverSource(source, cellSize, cellSize),
    };
  });

  return {
    width: columns * cellSize + gap * (columns - 1),
    height: rows * cellSize + gap * (rows - 1),
    cells,
  };
}

/** 等宽堆叠（长截图接图）。 */
function layoutVertical(
  sources: readonly CollageSourceSize[],
  spec: CollageSpec,
): { width: number; height: number; cells: CollageCell[] } {
  const gap = Math.max(0, spec.gap);
  const width = positive(spec.targetSize, 1600);
  let y = 0;
  const cells: CollageCell[] = sources.map((source, index) => {
    const height = width / aspectOf(source);
    const cell: CollageCell = {
      index,
      x: 0,
      y,
      width,
      height,
      ...fullSource(source),
    };
    y += height + gap;
    return cell;
  });

  return { width, height: Math.max(1, y - gap), cells };
}

/** 等高并排（before/after）。 */
function layoutHorizontal(
  sources: readonly CollageSourceSize[],
  spec: CollageSpec,
): { width: number; height: number; cells: CollageCell[] } {
  const gap = Math.max(0, spec.gap);
  const height = positive(spec.targetSize, 1600);
  let x = 0;
  const cells: CollageCell[] = sources.map((source, index) => {
    const width = height * aspectOf(source);
    const cell: CollageCell = {
      index,
      x,
      y: 0,
      width,
      height,
      ...fullSource(source),
    };
    x += width + gap;
    return cell;
  });

  return { width: Math.max(1, x - gap), height, cells };
}

/**
 * 保留比例的列排（justified）。
 *
 * 贪心往当前列塞图，每塞一张就用「这一列要刚好填满目标宽度」反算列高
 * （`h = (W - gap*(k-1)) / Σaspect`）；列高一旦掉到目标列高以下就收掉这一列。
 * 最后一列刻意**不**拉满宽度：只剩一张宽图时拉满会把它放大到荒谬的尺寸。
 */
function layoutJustified(
  sources: readonly CollageSourceSize[],
  spec: CollageSpec,
): { width: number; height: number; cells: CollageCell[] } {
  const gap = Math.max(0, spec.gap);
  const totalWidth = positive(spec.targetSize, 1600);
  const perRow = Math.max(1, Math.round(positive(spec.columns, 2)));
  const targetRowHeight = Math.max(1, (totalWidth - gap * (perRow - 1)) / perRow);

  // 先贪心切出每一列有哪些图
  const rows: { indices: number[]; height: number }[] = [];
  let current: number[] = [];
  let aspectSum = 0;

  sources.forEach((source, index) => {
    current.push(index);
    aspectSum += aspectOf(source);
    const rowHeight = (totalWidth - gap * (current.length - 1)) / aspectSum;
    if (rowHeight <= targetRowHeight) {
      rows.push({ indices: current, height: rowHeight });
      current = [];
      aspectSum = 0;
    }
  });

  if (current.length > 0) {
    // 收尾的那一列维持目标列高、靠左，不拉满
    rows.push({ indices: current, height: targetRowHeight });
  }

  const cells: CollageCell[] = [];
  let y = 0;
  let widest = 0;

  for (const row of rows) {
    let x = 0;
    for (const index of row.indices) {
      const source = sources[index];
      if (!source) continue;
      const width = row.height * aspectOf(source);
      cells.push({
        index,
        x,
        y,
        width,
        height: row.height,
        ...fullSource(source),
      });
      x += width + gap;
    }
    widest = Math.max(widest, x - gap);
    y += row.height + gap;
  }

  return {
    // 收尾列没拉满时整体宽度就是最宽的那一列，不要留一条空白
    width: Math.max(1, Math.min(totalWidth, widest)),
    height: Math.max(1, y - gap),
    cells,
  };
}

/**
 * 算出拼贴的画布尺寸与每一格的位置。
 *
 * 传进来的 `sources` 必须是**编辑后**（旋转 + 裁切）的尺寸，因为版面完全由长宽比决定；
 * 呼叫端用 geometry.ts 的 `outputSize(natural, { ...edit, resize: { mode: "original" } })` 取得。
 */
export function computeCollageLayout(
  sources: readonly CollageSourceSize[],
  spec: CollageSpec,
): CollageLayoutResult {
  if (sources.length === 0) {
    return { width: 1, height: 1, cells: [], clamped: false };
  }

  const raw =
    spec.layout === "vertical"
      ? layoutVertical(sources, spec)
      : spec.layout === "horizontal"
        ? layoutHorizontal(sources, spec)
        : spec.layout === "justified"
          ? layoutJustified(sources, spec)
          : layoutGrid(sources, spec);

  // canvas 有单边上限（超过在部分浏览器直接回传空白），24 张等宽接图很容易撞到。
  // 撞到就整体等比缩小，并让 UI 有办法告诉使用者「已经缩过了」。
  const longest = Math.max(raw.width, raw.height);
  if (longest <= MAX_DIMENSION) {
    // 常见情况：没超过上限，格子原样用，连一次配置都省掉
    for (const cell of raw.cells) {
      cell.x = Math.round(cell.x);
      cell.y = Math.round(cell.y);
      cell.width = Math.max(1, Math.round(cell.width));
      cell.height = Math.max(1, Math.round(cell.height));
    }
    return {
      width: Math.max(1, Math.round(raw.width)),
      height: Math.max(1, Math.round(raw.height)),
      cells: raw.cells,
      clamped: false,
    };
  }

  const scale = MAX_DIMENSION / longest;
  for (const cell of raw.cells) {
    cell.x = Math.round(cell.x * scale);
    cell.y = Math.round(cell.y * scale);
    cell.width = Math.max(1, Math.round(cell.width * scale));
    cell.height = Math.max(1, Math.round(cell.height * scale));
  }

  return {
    width: Math.max(1, Math.round(raw.width * scale)),
    height: Math.max(1, Math.round(raw.height * scale)),
    cells: raw.cells,
    clamped: true,
  };
}
