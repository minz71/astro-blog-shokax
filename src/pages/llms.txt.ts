import type { APIRoute } from "astro";
import { getCollection } from "astro:content";

import themeConfig from "@/theme.config";
import { toPostHref } from "@/toolkit/posts/url";

const escapeMarkdownText = (value: string) =>
  value.replaceAll("\\", "\\\\").replaceAll("[", "\\[").replaceAll("]", "\\]");

const normalizeDescription = (value: string) => value.replaceAll(/\s+/g, " ").trim();

export const GET: APIRoute = async () => {
  const posts = (await getCollection("posts"))
    .filter((post) => !post.data.draft && !post.data.encrypted)
    .toSorted((a, b) => b.data.date.getTime() - a.data.date.getTime());
  const siteUrl = new URL(`${themeConfig.siteUrl}/`);
  const description = normalizeDescription(
    themeConfig.brand?.subtitle || themeConfig.sidebar?.description || "",
  );
  const lines = [
    `# ${escapeMarkdownText(themeConfig.siteName)}`,
    ...(description ? ["", `> ${description}`] : []),
    "",
    `站点：${siteUrl.toString()}`,
    "",
    "## 公开文章",
    "",
    ...posts.map((post) => {
      const title = escapeMarkdownText(post.data.title);
      const url = new URL(toPostHref(post.id), siteUrl).toString();
      const postDescription = normalizeDescription(post.data.description || "");

      return `- [${title}](${url})${postDescription ? `：${postDescription}` : ""}`;
    }),
  ];

  return new Response(`${lines.join("\n")}\n`, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
};
