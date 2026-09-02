import { describe, expect, it } from "vitest";
import {
  type RoutableContent,
  toCategoryHref,
  toContentHref,
  toPostHref,
  toTagHref,
  toTagSlug,
  toToolHref,
} from "./url";
import { createSeededRandom } from "../testing/seededRandom";

const PROPERTY_RUNS = 100;

function routable(id: string, tool?: boolean): RoutableContent {
  return { id, data: tool === undefined ? {} : { tool } };
}

describe("url helpers", () => {
  it("normalizes tag slug with lowercase and separators", () => {
    expect(toTagSlug("  Astro  Blog/中文  ")).toBe("astro-blog-中文");
    expect(toTagSlug("A\\B/C")).toBe("a-b-c");
  });

  it("builds encoded tag href with trailing slash", () => {
    expect(toTagHref("Hello World")).toBe("/tags/hello-world/");
    expect(toTagHref("前端 & Astro")).toBe("/tags/%E5%89%8D%E7%AB%AF-%26-astro/");
    expect(toTagHref("")).toBe("/tags/");
  });

  it("builds encoded category href with trailing slash", () => {
    expect(toCategoryHref("前端/Astro")).toBe("/categories/%E5%89%8D%E7%AB%AF%2FAstro/");
    expect(toCategoryHref("General")).toBe("/categories/General/");
  });

  it("builds post href with suffix trimming and encoding", () => {
    expect(toPostHref("notes/hello world.md")).toBe("/posts/notes/hello%20world/");
    expect(toPostHref("/nested/path/")).toBe("/posts/nested/path/");
    expect(toPostHref("")).toBe("/posts/");
  });

  it("keeps tag slug and href consistent", () => {
    const name = "Tag 中文 + Plus";
    const href = toTagHref(name);
    const slugInHref = decodeURIComponent(href.slice("/tags/".length, -1));

    expect(slugInHref).toBe(toTagSlug(name));
  });

  it("builds tool href with the same trimming and encoding rules as post href", () => {
    expect(toToolHref("local_code_copy")).toBe("/tools/local_code_copy/");
    expect(toToolHref("group/my tool")).toBe("/tools/group/my%20tool/");
    expect(toToolHref("nested/thing.mdx")).toBe("/tools/nested/thing/");
    expect(toToolHref("/leading/and/trailing/")).toBe("/tools/leading/and/trailing/");
    expect(toToolHref("  spaced  ")).toBe("/tools/spaced/");
    expect(toToolHref("工具/中文")).toBe("/tools/%E5%B7%A5%E5%85%B7/%E4%B8%AD%E6%96%87/");
    expect(toToolHref("")).toBe("/tools/");
    expect(toToolHref("///")).toBe("/tools/");
  });

  it("routes content by the tool declaration only", () => {
    expect(toContentHref(routable("local_code_copy", true))).toBe("/tools/local_code_copy/");
    expect(toContentHref(routable("local_code_copy"))).toBe("/posts/local_code_copy/");
    expect(toContentHref(routable("local_code_copy", false))).toBe("/posts/local_code_copy/");

    // 目录/slug 长得像工具也不影响：型别只看 tool
    expect(toContentHref(routable("tool/madvr"))).toBe("/posts/tool/madvr/");
    expect(toContentHref(routable("tool/madvr", true))).toBe("/tools/tool/madvr/");
  });

  it("Feature: dedicated-tools-page, Property 4: 公开内容路由 namespace 互斥且格式稳定", () => {
    const segments = ["local_code_copy", "madVR", "工具", "my tool", "a.b", "x-y_z", "nested"];

    for (let run = 0; run < PROPERTY_RUNS; run += 1) {
      const random = createSeededRandom(0x4000 + run);
      const id = Array.from({ length: random.int(1, 3) }, () => random.pick(segments)).join("/");

      const toolHref = toContentHref(routable(id, true));
      const articleHref = toContentHref(routable(id, random.bool() ? false : undefined));

      // 各自只落在自己的 namespace
      expect(toolHref.startsWith("/tools/")).toBe(true);
      expect(articleHref.startsWith("/posts/")).toBe(true);
      expect(toolHref).toBe(toToolHref(id));
      expect(articleHref).toBe(toPostHref(id));

      // 两个 namespace 不相交
      expect(toolHref).not.toBe(articleHref);
      expect(toolHref.startsWith("/posts/")).toBe(false);
      expect(articleHref.startsWith("/tools/")).toBe(false);

      // 前导与尾斜线稳定，且每段都经过编码
      for (const href of [toolHref, articleHref]) {
        expect(href.startsWith("/")).toBe(true);
        expect(href.endsWith("/")).toBe(true);
        expect(href).not.toContain(" ");
        expect(href).not.toContain("//");
      }

      // 编码可逆：解码后与原始 id 逐段相同
      const decoded = toolHref
        .slice("/tools/".length, -1)
        .split("/")
        .map((segment) => decodeURIComponent(segment))
        .join("/");
      expect(decoded).toBe(id);
    }
  });

  it("Feature: dedicated-tools-page, Property 5: Tool canonical 与内容 href 一致", () => {
    const bases = [
      "https://blog.minz.li",
      "https://blog.minz.li/",
      "https://example.com",
      "http://localhost:4321",
      "https://sub.domain.example.org/",
    ];
    const segments = ["local_code_copy", "madVR", "工具", "my tool", "nested"];

    for (let run = 0; run < PROPERTY_RUNS; run += 1) {
      const random = createSeededRandom(0x5000 + run);
      const siteBase = random.pick(bases);
      const id = Array.from({ length: random.int(1, 3) }, () => random.pick(segments)).join("/");
      const entry = routable(id, true);

      const contentHref = toContentHref(entry);
      const canonical = new URL(contentHref, siteBase);

      // canonical 的 pathname 与站内 href 完全一致（含尾斜线）
      expect(canonical.pathname).toBe(contentHref);
      expect(canonical.pathname.endsWith("/")).toBe(true);
      expect(canonical.origin).toBe(new URL(siteBase).origin);

      // 以绝对 URL 再解析一次仍等价（幂等）
      expect(new URL(canonical.toString()).pathname).toBe(contentHref);
    }
  });
});
