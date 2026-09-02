import { describe, expect, it } from "vitest";
import type { Post } from "@/toolkit/posts/types";
import { buildSiteStatistics } from "./buildSiteStatistics";
import { createSeededRandom } from "../testing/seededRandom";

const PROPERTY_RUNS = 100;

interface MockPostInput {
  id: string;
  date: string;
  categories?: string[] | null;
  tags?: string[] | null;
  draft?: boolean;
  tool?: boolean;
}

function createPost(input: MockPostInput): Post {
  return {
    id: input.id,
    slug: input.id,
    body: "",
    collection: "posts",
    data: {
      title: input.id,
      date: new Date(input.date),
      categories: input.categories,
      tags: input.tags,
      draft: input.draft,
      tool: input.tool,
      encrypted: false,
    },
  } as Post;
}

describe("buildSiteStatistics", () => {
  it("应该默认忽略草稿文章并统计按月数据", () => {
    const posts: Post[] = [
      createPost({
        id: "p1",
        date: "2025-01-10T00:00:00.000Z",
        categories: ["前端", "Astro"],
        tags: ["Astro", "Svelte"],
      }),
      createPost({
        id: "p2",
        date: "2025-01-20T00:00:00.000Z",
        categories: ["前端"],
        tags: ["Astro"],
      }),
      createPost({
        id: "p3",
        date: "2025-02-05T00:00:00.000Z",
        categories: ["工具"],
        tags: ["Bun"],
      }),
      createPost({
        id: "draft",
        date: "2025-02-08T00:00:00.000Z",
        categories: ["草稿"],
        tags: ["Draft"],
        draft: true,
      }),
    ];

    const stats = buildSiteStatistics(posts);

    expect(stats.totalPosts).toBe(3);
    expect(stats.monthlyPostCounts).toEqual([
      { year: 2025, month: 1, label: "2025-01", count: 2 },
      { year: 2025, month: 2, label: "2025-02", count: 1 },
    ]);
    expect(stats.topCategory).toEqual({ name: "前端", count: 2 });
  });

  it("应该可选包含草稿文章", () => {
    const posts: Post[] = [
      createPost({ id: "p1", date: "2025-01-01T00:00:00.000Z" }),
      createPost({ id: "p2", date: "2025-01-02T00:00:00.000Z", draft: true }),
    ];

    const stats = buildSiteStatistics(posts, { includeDrafts: true });

    expect(stats.totalPosts).toBe(2);
    expect(stats.monthlyPostCounts).toEqual([{ year: 2025, month: 1, label: "2025-01", count: 2 }]);
  });

  it("应该正确统计分类和标签数量并按数量降序", () => {
    const posts: Post[] = [
      createPost({
        id: "p1",
        date: "2025-03-01T00:00:00.000Z",
        categories: ["A", "B"],
        tags: ["x", "y"],
      }),
      createPost({
        id: "p2",
        date: "2025-03-02T00:00:00.000Z",
        categories: ["A"],
        tags: ["x"],
      }),
      createPost({
        id: "p3",
        date: "2025-03-03T00:00:00.000Z",
        categories: ["C"],
        tags: ["z"],
      }),
    ];

    const stats = buildSiteStatistics(posts);

    expect(stats.categoryCounts).toEqual([
      { name: "A", count: 2 },
      { name: "B", count: 1 },
      { name: "C", count: 1 },
    ]);
    expect(stats.tagCounts).toEqual([
      { name: "x", count: 2 },
      { name: "y", count: 1 },
      { name: "z", count: 1 },
    ]);
    expect(stats.totalCategories).toBe(3);
    expect(stats.totalTags).toBe(3);
  });
});

describe("buildSiteStatistics 排除工具", () => {
  it("工具不进任何统计（含 includeDrafts 时）", () => {
    const article = createPost({
      id: "a1",
      date: "2025-01-10T00:00:00.000Z",
      categories: ["AI"],
      tags: ["astro"],
    });
    const tool = createPost({
      id: "t1",
      date: "2025-01-11T00:00:00.000Z",
      categories: ["tool"],
      tags: ["solid"],
      tool: true,
    });
    const draftTool = createPost({
      id: "t2",
      date: "2025-01-12T00:00:00.000Z",
      categories: ["tool"],
      tags: ["unocss"],
      tool: true,
      draft: true,
    });

    const onlyArticle = buildSiteStatistics([article]);

    expect(buildSiteStatistics([article, tool, draftTool])).toEqual(onlyArticle);
    expect(buildSiteStatistics([article, tool], { includeDrafts: true })).toEqual(
      buildSiteStatistics([article], { includeDrafts: true }),
    );
  });

  it("tool: false 与缺席一样算文章", () => {
    const declaredFalse = buildSiteStatistics([
      createPost({ id: "a", date: "2025-02-01T00:00:00.000Z", categories: ["AI"], tool: false }),
    ]);
    const absent = buildSiteStatistics([
      createPost({ id: "a", date: "2025-02-01T00:00:00.000Z", categories: ["AI"] }),
    ]);

    expect(declaredFalse).toEqual(absent);
    expect(declaredFalse.totalPosts).toBe(1);
  });

  it("Feature: dedicated-tools-page, Property 3: 一般文章流对工具与草稿具有抗污染性（站点统计）", () => {
    const categoryPool = ["AI", "CS", "other"];
    const tagPool = ["astro", "solid", "unocss"];

    for (let run = 0; run < PROPERTY_RUNS; run += 1) {
      const random = createSeededRandom(0x3100 + run);

      const baseline = Array.from({ length: random.int(1, 8) }, (_, index) =>
        createPost({
          id: `base${index}`,
          date: `202${random.int(3, 5)}-0${random.int(1, 9)}-1${random.int(0, 9)}T00:00:00.000Z`,
          categories: Array.from({ length: random.int(0, 2) }, () => random.pick(categoryPool)),
          tags: Array.from({ length: random.int(0, 2) }, () => random.pick(tagPool)),
        }),
      );

      const pollutants = Array.from({ length: random.int(1, 10) }, (_, index) =>
        createPost({
          id: `poison${index}`,
          date: `202${random.int(3, 5)}-0${random.int(1, 9)}-1${random.int(0, 9)}T00:00:00.000Z`,
          categories: Array.from({ length: random.int(0, 2) }, () => random.pick(categoryPool)),
          tags: Array.from({ length: random.int(0, 2) }, () => random.pick(tagPool)),
          ...(random.bool() ? { tool: true } : { draft: true }),
        }),
      );

      expect(buildSiteStatistics(random.shuffle([...baseline, ...pollutants]))).toEqual(
        buildSiteStatistics(baseline),
      );
    }
  });
});
