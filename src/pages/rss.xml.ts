import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { getCollection } from "astro:content";
import themeConfig from "@/theme.config";
import { filterPublishableGeneralArticles } from "@/toolkit/posts/content";
import { toPostHref } from "@/toolkit/posts/url";

// 生成站点 RSS 订阅源（/rss.xml）
export async function GET(context: APIContext) {
  const posts = await getCollection("posts");
  // 工具不是文章，不进订阅源
  const published = filterPublishableGeneralArticles(posts)
    // 加密文章构建后内容为密文，订阅端无法解密阅读；且无 description 时
    // 会回退到 post.body 明文摘要（把正文前 150 字符泄露进订阅源）。
    // 因此整篇从订阅源排除。
    .filter((post) => !post.data.encrypted)
    .toSorted((a, b) => b.data.date.getTime() - a.data.date.getTime());

  const siteName = themeConfig.siteName;
  const description =
    themeConfig.sidebar?.description || themeConfig.brand?.subtitle || `${siteName} 的文章订阅`;

  return rss({
    title: siteName,
    description,
    // 项目路由要求保留尾斜杠
    trailingSlash: true,
    // 不写死网域：context.site 已由 astro.config 从 themeConfig.siteUrl 取得，
    // 这里只是同一来源的兜底，避免 fallback 指向别人的站点。
    site: context.site ?? themeConfig.siteUrl,
    items: published.map((post) => ({
      title: post.data.title,
      description:
        post.data.description || (post.body ?? "").slice(0, 150).replace(/\s+/g, " ").trim(),
      pubDate: post.data.date,
      link: toPostHref(post.id),
      categories: post.data.categories ?? undefined,
    })),
  });
}
