import type { ImageMetadata } from "astro";
import coversConfig from "@/covers.config";

export type HeaderCover = ImageMetadata | string;

/**
 * 清洗封面清单，并把预设 key（如 "cover-1"）还原成静态导入的 ImageMetadata。
 * 这样本地图片（走 Astro 资源管线的 <Image />）与远端图床 URL（走 <img> 兜底）
 * 可以混写在同一份 coverUrls / covers.config.ts 列表里。
 */
function normalizeCovers(
  entries: string[],
  presets?: Record<string, ImageMetadata>,
): HeaderCover[] {
  return entries
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((url) => url.trim())
    .map((url) => presets?.[url] ?? url);
}

export async function resolveHeaderCovers(options: {
  coverUrls?: string[];
  fallbackCovers: HeaderCover[];
  /** Images.astro 导出的 coverPresets，用于解析 "cover-1" 这类预设 key */
  presets?: Record<string, ImageMetadata>;
}): Promise<HeaderCover[]> {
  const directCoverUrls = normalizeCovers(options.coverUrls || [], options.presets);

  if (directCoverUrls.length > 0) {
    return directCoverUrls;
  }

  const configCoverUrls = normalizeCovers(coversConfig.urls, options.presets);
  if (configCoverUrls.length > 0) {
    return configCoverUrls;
  }

  return options.fallbackCovers;
}
