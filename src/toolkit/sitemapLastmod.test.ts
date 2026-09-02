import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildPostLastmodMap, createSitemapSerializer } from "./sitemapLastmod";

/** 与 sitemapLastmod 内部的 SitemapItemLike 对应（该型别未导出）。 */
interface SitemapItem {
  url: string;
  lastmod?: string;
}

function item(url: string): SitemapItem {
  return { url };
}

let postsDir: string;

function writePost(relativePath: string, frontmatter: string): void {
  const full = join(postsDir, relativePath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, `---\n${frontmatter}\n---\n\n正文\n`, "utf8");
}

beforeEach(() => {
  postsDir = mkdtempSync(join(tmpdir(), "sitemap-lastmod-"));
});

afterEach(() => {
  rmSync(postsDir, { recursive: true, force: true });
});

describe("buildPostLastmodMap", () => {
  it("同一次扫描同时产出 /posts/ 与 /tools/ 的 lastmod", () => {
    writePost("hello.md", "title: 文章\ndate: 2025-01-02\nupdated: 2025-03-04");
    writePost("local_code_copy.mdx", "title: 工具\ndate: 2025-02-02\ntool: true");

    const map = buildPostLastmodMap(postsDir);

    expect(map.get("/posts/hello/")).toBe(new Date("2025-03-04").toISOString());
    expect(map.get("/tools/local_code_copy/")).toBe(new Date("2025-02-02").toISOString());
    expect(map.has("/posts/local_code_copy/")).toBe(false);
    expect(map.has("/tools/hello/")).toBe(false);
  });

  it("型别只读严格的 tool: true，不看路径是否含 tool/", () => {
    // 放在 tool/ 目录但没有声明 tool: true —— 仍是文章
    writePost("tool/madVR.mdx", "title: 目录像工具\ndate: 2024-02-29");
    // 不在 tool/ 目录但声明了 tool: true —— 是工具
    writePost("nested/thing.md", "title: 声明才算\ndate: 2024-03-01\ntool: true");

    const map = buildPostLastmodMap(postsDir);

    expect(map.has("/posts/tool/madvr/")).toBe(true);
    expect(map.has("/tools/tool/madvr/")).toBe(false);
    expect(map.has("/tools/nested/thing/")).toBe(true);
    expect(map.has("/posts/nested/thing/")).toBe(false);
  });

  it("tool 的非 true 值都当成文章", () => {
    writePost("a.md", "title: a\ndate: 2025-01-01\ntool: false");
    writePost("b.md", "title: b\ndate: 2025-01-01\ntool: yes");
    writePost("c.md", "title: c\ndate: 2025-01-01\ntool: 1");
    writePost("d.md", 'title: d\ndate: 2025-01-01\ntool: "true"');

    const map = buildPostLastmodMap(postsDir);

    for (const id of ["a", "b", "c", "d"]) {
      expect(map.has(`/posts/${id}/`)).toBe(true);
      expect(map.has(`/tools/${id}/`)).toBe(false);
    }
  });

  it("frontmatter slug 覆写同时适用于工具", () => {
    writePost("deep/nested/file.mdx", "title: 工具\ndate: 2025-05-05\nslug: my-tool\ntool: true");

    const map = buildPostLastmodMap(postsDir);

    expect(map.has("/tools/my-tool/")).toBe(true);
  });

  it("没有 date 也没有 updated 的档案不进 map", () => {
    writePost("no-date.md", "title: 没有日期\ntool: true");

    expect(buildPostLastmodMap(postsDir).size).toBe(0);
  });
});

describe("createSitemapSerializer", () => {
  it("为工具 URL 补上 lastmod", () => {
    writePost("local_code_copy.mdx", "title: 工具\ndate: 2025-02-02\ntool: true");
    writePost("hello.md", "title: 文章\ndate: 2025-01-02");

    const serialize = createSitemapSerializer(postsDir);

    expect(serialize(item("https://example.com/tools/local_code_copy/")).lastmod).toBe(
      new Date("2025-02-02").toISOString(),
    );
    expect(serialize(item("https://example.com/posts/hello/")).lastmod).toBe(
      new Date("2025-01-02").toISOString(),
    );
    // 不属于内容详情的路由不动
    expect(serialize(item("https://example.com/tools/")).lastmod).toBeUndefined();
  });

  it("中文 id 的编码差异经解码后仍能对上", () => {
    writePost("工具.md", "title: 中文工具\ndate: 2025-04-04\ntool: true");

    const serialize = createSitemapSerializer(postsDir);
    const encoded = `https://example.com/tools/${encodeURIComponent("工具")}/`;

    expect(serialize(item(encoded)).lastmod).toBe(new Date("2025-04-04").toISOString());
  });
});
