import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { slug as githubSlug } from "github-slugger";
import { toPostHref } from "./posts/url";

// 供 astro.config 的 sitemap({ serialize }) 使用：扫描 src/posts 的 frontmatter,
// 为文章页补上 <lastmod>(updated 优先,缺席时回退 date)。
// 不引入 yaml 解析依赖,只需从第一个 --- 块提取 date / updated 两个键。

interface SitemapItemLike {
  url: string;
  lastmod?: string;
}

function* walkMarkdownFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkMarkdownFiles(fullPath);
    } else if (/\.mdx?$/i.test(entry.name)) {
      yield fullPath;
    }
  }
}

function extractFrontmatterBlock(raw: string): string | undefined {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return match?.[1];
}

function extractDate(frontmatter: string, key: string): Date | undefined {
  const match = frontmatter.match(
    new RegExp(`^${key}:[ \\t]*(.+?)[ \\t]*$`, "m"),
  );
  if (!match) {
    return undefined;
  }

  const value = match[1].replaceAll(/^["']|["']$/g, "");
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

// 与 Astro glob loader 的默认 generateId 一致：frontmatter slug 优先，
// 否则对去除扩展名的相对路径逐段 githubSlug(会小写化，如 AI/Accelerators
// → ai/accelerators)。
function toPostId(relativePath: string, frontmatter: string): string {
  const slugOverride = frontmatter
    .match(/^slug:[ \t]*(.+?)[ \t]*$/m)?.[1]
    ?.replaceAll(/^["']|["']$/g, "");
  if (slugOverride) {
    return slugOverride;
  }

  return relativePath
    .replace(/\.mdx?$/i, "")
    .split("/")
    .map((segment) => githubSlug(segment))
    .join("/");
}

// sitemap 生成的 URL 与 toPostHref 的 encodeURIComponent 编码范围可能不一致
// (中文文件名等),统一解码后再比对。
function normalizePathname(pathname: string): string {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

export function buildPostLastmodMap(postsDir: string): Map<string, string> {
  const lastmodByPath = new Map<string, string>();

  for (const file of walkMarkdownFiles(postsDir)) {
    const frontmatter = extractFrontmatterBlock(readFileSync(file, "utf8"));
    if (!frontmatter) {
      continue;
    }

    const lastmod =
      extractDate(frontmatter, "updated") ?? extractDate(frontmatter, "date");
    if (!lastmod) {
      continue;
    }

    const id = toPostId(
      relative(postsDir, file).replaceAll("\\", "/"),
      frontmatter,
    );
    lastmodByPath.set(normalizePathname(toPostHref(id)), lastmod.toISOString());
  }

  return lastmodByPath;
}

export function createSitemapSerializer(postsDir: string) {
  // 惰性扫描：astro.config 会被 src/pages/friends 间接打包进 SSR bundle，
  // 该副本在错误的相对路径下执行；只有 sitemap 集成真正调用 serialize 时
  // （config 进程内，路径正确）才读取文件系统。
  let lastmodByPath: Map<string, string> | undefined;

  return <T extends SitemapItemLike>(item: T): T => {
    lastmodByPath ??= buildPostLastmodMap(postsDir);

    const lastmod = lastmodByPath.get(
      normalizePathname(new URL(item.url).pathname),
    );
    if (lastmod) {
      item.lastmod = lastmod;
    }
    return item;
  };
}
