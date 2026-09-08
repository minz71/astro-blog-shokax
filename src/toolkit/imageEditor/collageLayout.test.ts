import { describe, expect, it } from "vitest";
import { MAX_DIMENSION } from "./geometry";
import { COLLAGE_LAYOUTS, computeCollageLayout, createDefaultCollage } from "./collageLayout";
import type { CollageSpec } from "./types";

const landscape = { width: 400, height: 200 }; // 2:1
const portrait = { width: 200, height: 400 }; // 1:2
const square = { width: 300, height: 300 };

function spec(overrides: Partial<CollageSpec> = {}): CollageSpec {
  return { ...createDefaultCollage(), ...overrides };
}

describe("computeCollageLayout / 边界", () => {
  it("空输入不会算出 0 或 NaN 的画布", () => {
    const result = computeCollageLayout([], spec());
    expect(result.cells).toEqual([]);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it("每种版面对单张图都算得出有效画布", () => {
    for (const layout of COLLAGE_LAYOUTS) {
      const result = computeCollageLayout([landscape], spec({ layout }));
      expect(result.cells).toHaveLength(1);
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
      expect(Number.isFinite(result.width)).toBe(true);
      expect(Number.isFinite(result.height)).toBe(true);
    }
  });

  it("来源尺寸是 0 时不会算出 NaN（还没解码完的图）", () => {
    const result = computeCollageLayout([{ width: 0, height: 0 }], spec({ layout: "vertical" }));
    expect(Number.isFinite(result.height)).toBe(true);
    expect(result.height).toBeGreaterThan(0);
  });
});

describe("computeCollageLayout / grid", () => {
  it("按列数排格子，并把间距算进总尺寸", () => {
    const result = computeCollageLayout(
      [square, square, square, square],
      spec({ layout: "grid", columns: 2, gap: 10, targetSize: 410 }),
    );

    // cellSize = (410 - 10) / 2 = 200
    expect(result.width).toBe(410);
    expect(result.height).toBe(410);
    expect(result.cells.map((cell) => [cell.x, cell.y])).toEqual([
      [0, 0],
      [210, 0],
      [0, 210],
      [210, 210],
    ]);
  });

  it("张数不足一整列时仍然只排需要的列数", () => {
    const result = computeCollageLayout(
      [square, square, square],
      spec({ layout: "grid", columns: 2, gap: 0, targetSize: 400 }),
    );
    // 3 张、2 列 → 2 列 2 行
    expect(result.height).toBe(400);
    expect(result.cells).toHaveLength(3);
  });

  it("cover 会把溢出的那一轴从来源两侧对称裁掉", () => {
    const result = computeCollageLayout(
      [landscape],
      spec({ layout: "grid", columns: 1, gap: 0, targetSize: 200, fit: "cover" }),
    );
    const [cell] = result.cells;
    expect(cell).toBeDefined();
    if (!cell) return;

    // 2:1 的图塞进正方形格子：高度撑满、宽度裁掉一半，且左右对称
    expect(cell.width).toBe(200);
    expect(cell.height).toBe(200);
    expect(cell.sourceHeight).toBe(200);
    expect(cell.sourceWidth).toBe(200);
    expect(cell.sourceX).toBe(100);
    expect(cell.sourceY).toBe(0);
  });

  it("contain 保留整张来源，改成缩小并居中", () => {
    const result = computeCollageLayout(
      [landscape],
      spec({ layout: "grid", columns: 1, gap: 0, targetSize: 200, fit: "contain" }),
    );
    const [cell] = result.cells;
    expect(cell).toBeDefined();
    if (!cell) return;

    // 整张都要在，所以来源不裁
    expect(cell.sourceWidth).toBe(landscape.width);
    expect(cell.sourceHeight).toBe(landscape.height);
    // 2:1 缩进正方形 → 200x100，垂直居中留白
    expect(cell.width).toBe(200);
    expect(cell.height).toBe(100);
    expect(cell.y).toBe(50);
  });
});

describe("computeCollageLayout / vertical", () => {
  it("等宽堆叠，总高是各自按比例缩放后的高度加间距", () => {
    const result = computeCollageLayout(
      [landscape, square],
      spec({ layout: "vertical", gap: 20, targetSize: 400 }),
    );

    expect(result.width).toBe(400);
    // 400 宽下：2:1 → 200 高；1:1 → 400 高；加一个 20 的间距
    expect(result.height).toBe(620);
    expect(result.cells[0]?.height).toBe(200);
    expect(result.cells[1]?.height).toBe(400);
    expect(result.cells[1]?.y).toBe(220);
  });

  it("永不裁切：来源一律取整张", () => {
    const result = computeCollageLayout([landscape, portrait], spec({ layout: "vertical" }));
    for (const cell of result.cells) {
      const source = [landscape, portrait][cell.index];
      expect(cell.sourceWidth).toBe(source?.width);
      expect(cell.sourceHeight).toBe(source?.height);
    }
  });
});

describe("computeCollageLayout / horizontal", () => {
  it("等高并排，总宽是各自按比例缩放后的宽度加间距", () => {
    const result = computeCollageLayout(
      [landscape, square],
      spec({ layout: "horizontal", gap: 20, targetSize: 200 }),
    );

    expect(result.height).toBe(200);
    // 200 高下：2:1 → 400 宽；1:1 → 200 宽；加一个 20 的间距
    expect(result.width).toBe(620);
    expect(result.cells[1]?.x).toBe(420);
  });
});

describe("computeCollageLayout / justified", () => {
  it("非收尾的列刚好填满目标宽度", () => {
    // 四张 2:1 的图、每列约 2 张 → 前面的列应该刚好填满
    const targetSize = 1000;
    const gap = 10;
    const result = computeCollageLayout(
      [landscape, landscape, landscape, landscape],
      spec({ layout: "justified", columns: 2, gap, targetSize }),
    );

    // 收集同一列（y 相同）的格子，检查该列的右缘贴齐目标宽度
    const rows = new Map<number, typeof result.cells>();
    for (const cell of result.cells) {
      rows.set(cell.y, [...(rows.get(cell.y) ?? []), cell]);
    }
    const rowKeys = [...rows.keys()].toSorted((a, b) => a - b);
    expect(rowKeys.length).toBeGreaterThan(1);

    // 最后一列允许不满，前面的都要贴齐（容许 1px 取整误差）
    for (const key of rowKeys.slice(0, -1)) {
      const row = rows.get(key) ?? [];
      const right = Math.max(...row.map((cell) => cell.x + cell.width));
      expect(Math.abs(right - targetSize)).toBeLessThanOrEqual(1);
    }
  });

  it("每一张都保留原本的长宽比（不裁切）", () => {
    const sources = [landscape, portrait, square, landscape];
    const result = computeCollageLayout(
      sources,
      spec({ layout: "justified", columns: 2, gap: 8, targetSize: 900 }),
    );

    for (const cell of result.cells) {
      const source = sources[cell.index];
      expect(source).toBeDefined();
      if (!source) continue;
      const sourceAspect = source.width / source.height;
      const cellAspect = cell.width / cell.height;
      expect(Math.abs(cellAspect - sourceAspect)).toBeLessThan(0.02);
      expect(cell.sourceWidth).toBe(source.width);
      expect(cell.sourceHeight).toBe(source.height);
    }
  });

  it("收尾只剩一张时不会被拉满宽度放大到荒谬", () => {
    const result = computeCollageLayout(
      [landscape, landscape, landscape],
      spec({ layout: "justified", columns: 2, gap: 0, targetSize: 1000 }),
    );
    const lastCell = result.cells.at(-1);
    expect(lastCell).toBeDefined();
    if (!lastCell) return;
    // 目标列高 = 1000 / 2 = 500；2:1 的图在该列高下宽度是 1000 —— 不该超过目标宽度
    expect(lastCell.width).toBeLessThanOrEqual(1000);
  });
});

describe("computeCollageLayout / MAX_DIMENSION 夹制", () => {
  it("长接图超过 canvas 上限时整体缩小并标记 clamped", () => {
    // 24 张 1:1 等宽 2000px 堆叠 → 48000px 高，远超上限
    const sources = Array.from({ length: 24 }, () => square);
    const result = computeCollageLayout(
      sources,
      spec({ layout: "vertical", gap: 0, targetSize: 2000 }),
    );

    expect(result.clamped).toBe(true);
    expect(Math.max(result.width, result.height)).toBeLessThanOrEqual(MAX_DIMENSION);
    // 缩小是等比的，格子也要一起缩
    expect(result.width).toBeLessThan(2000);
    expect(result.cells).toHaveLength(24);
  });

  it("没超过上限就不标记 clamped", () => {
    const result = computeCollageLayout(
      [square, square],
      spec({ layout: "vertical", targetSize: 800 }),
    );
    expect(result.clamped).toBe(false);
    expect(result.width).toBe(800);
  });
});
