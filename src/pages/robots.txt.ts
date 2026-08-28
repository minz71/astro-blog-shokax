import type { APIRoute } from "astro";
import themeConfig from "@/theme.config";

// 生成 /robots.txt（Sitemap 地址取自 themeConfig.siteUrl，未配置时省略）
export const GET: APIRoute = () => {
  const lines = ["User-agent: *", "Allow: /"];

  if (themeConfig.siteUrl) {
    lines.push("", `Sitemap: ${new URL("sitemap-index.xml", themeConfig.siteUrl).toString()}`);
  }

  return new Response(`${lines.join("\n")}\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
