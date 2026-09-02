import { describe, expect, it } from "vitest";

import type { Post } from "./types";
import { toPostProjection } from "./projection";

interface MockInput {
  id: string;
  title?: string;
  categories?: string[] | null;
  tool?: boolean;
}

function createPost(input: MockInput): Post {
  return {
    id: input.id,
    collection: "posts",
    body: "",
    data: {
      title: input.title ?? input.id,
      date: new Date("2026-01-01T00:00:00.000Z"),
      categories: input.categories,
      tool: input.tool,
      encrypted: false,
    },
  };
}

describe("toPostProjection", () => {
  it("一般文章的 url 落在 /posts/", () => {
    expect(toPostProjection(createPost({ id: "hello-world" })).url).toBe("/posts/hello-world/");
    expect(toPostProjection(createPost({ id: "hello-world", tool: false })).url).toBe(
      "/posts/hello-world/",
    );
  });

  it("工具的 url 落在 /tools/", () => {
    expect(toPostProjection(createPost({ id: "tool-demo", tool: true })).url).toBe(
      "/tools/tool-demo/",
    );
  });

  it("型别只看 tool，目录长得像工具也不影响", () => {
    expect(toPostProjection(createPost({ id: "tool/madvr" })).url).toBe("/posts/tool/madvr/");
    expect(toPostProjection(createPost({ id: "tool/madvr", tool: true })).url).toBe(
      "/tools/tool/madvr/",
    );
  });

  it("取最深一层分类并给出分类连结", () => {
    const projection = toPostProjection(
      createPost({ id: "p", categories: ["前端", "Astro"], tool: true }),
    );

    expect(projection.category).toBe("Astro");
    expect(projection.categoryUrl).toBe("/categories/Astro/");
  });

  it("没有分类时不给 category 与 categoryUrl", () => {
    const projection = toPostProjection(createPost({ id: "p", categories: null }));

    expect(projection.category).toBeUndefined();
    expect(projection.categoryUrl).toBeUndefined();
  });

  it("slug 与 title 原样带出", () => {
    const projection = toPostProjection(createPost({ id: "tool-demo", title: "工具页示范" }));

    expect(projection.slug).toBe("tool-demo");
    expect(projection.title).toBe("工具页示范");
  });
});
