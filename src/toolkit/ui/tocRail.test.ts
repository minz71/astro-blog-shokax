import { describe, expect, it } from "vitest";
import { buildTocRailPath, tocRailCenterY, type TocRailRow } from "./tocRail";

const row = (x: number, index: number, height = 20): TocRailRow => ({
  x,
  top: index * height,
  height,
});

describe("buildTocRailPath", () => {
  it("returns an empty string when there are no rows", () => {
    expect(buildTocRailPath([])).toBe("");
  });

  it("starts at the first row's center", () => {
    expect(buildTocRailPath([row(4, 0)])).toBe("M4,10");
  });

  it("draws straight lines between rows on the same level", () => {
    expect(buildTocRailPath([row(4, 0), row(4, 1), row(4, 2)])).toBe("M4,10 L4,30 L4,50");
  });

  it("bends with an S curve at the boundary when the level changes", () => {
    expect(buildTocRailPath([row(4, 0), row(16, 1)])).toBe("M4,10 L4,13 C4,20 16,20 16,27 L16,30");
  });

  it("bends back to the left when the level goes up", () => {
    expect(buildTocRailPath([row(28, 0), row(4, 1)])).toBe("M28,10 L28,13 C28,20 4,20 4,27 L4,30");
  });

  it("caps the curve height at half a row", () => {
    expect(buildTocRailPath([row(4, 0, 10), row(16, 1, 10)])).toBe(
      "M4,5 L4,5 C4,10 16,10 16,15 L16,15",
    );
  });

  it("stops at endIndex", () => {
    const rows = [row(4, 0), row(16, 1), row(16, 2)];
    expect(buildTocRailPath(rows, 1)).toBe("M4,10 L4,13 C4,20 16,20 16,27 L16,30");
    expect(buildTocRailPath(rows, 0)).toBe("M4,10");
  });

  it("clamps endIndex into range", () => {
    const rows = [row(4, 0), row(4, 1)];
    expect(buildTocRailPath(rows, 99)).toBe(buildTocRailPath(rows));
    expect(buildTocRailPath(rows, -3)).toBe("M4,10");
  });

  it("uses the midpoint of a gap between rows as the boundary", () => {
    const rows: TocRailRow[] = [
      { x: 4, top: 0, height: 20 },
      { x: 16, top: 30, height: 20 },
    ];
    expect(buildTocRailPath(rows)).toBe("M4,10 L4,18 C4,25 16,25 16,32 L16,40");
  });
});

describe("tocRailCenterY", () => {
  it("returns the row center and clamps the index", () => {
    const rows = [row(4, 0), row(4, 1)];
    expect(tocRailCenterY(rows, 1)).toBe(30);
    expect(tocRailCenterY(rows, 5)).toBe(30);
    expect(tocRailCenterY(rows, -1)).toBe(10);
    expect(tocRailCenterY([], 0)).toBe(0);
  });
});
