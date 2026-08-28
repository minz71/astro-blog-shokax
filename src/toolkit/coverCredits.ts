/**
 * 封面图的来源与作者署名。
 *
 * 这些图依授权条款必须标注来源与作者名称，站上由 /credits/ 页面统一呈现。
 * key 由「目录 + 档名」组成，两张预设表由 src/components/Images.astro
 * 用 import.meta.glob 自动生成：
 *   src/assets/images/cover/1.avif          → "cover-1"（文章／header 封面）
 *   src/assets/images/category-cover/cs.avif → "category-cs"（首页分类封面）
 * 所以新增封面只有两步：把图放进对应目录，然后在这里补一笔署名。
 * （src/assets/images/post-cover/ 是文章自订封面，不进预设表，也不在此登记）
 *
 * /credits/ 页面在构建期做三向校验：图缺署名、署名缺图，以及 theme.config.ts 里
 * 绕过预设表的本地分类封面，任一条都会直接让构建失败（见该页的校验）。
 *
 * 例外是主题自带的那几张图：它们随主题一起散布、走主题授权，不需要个别署名，
 * 列在 THEME_LICENSED_KEYS 里即可豁免校验。站点换掉封面属于 cloudflare 的事
 * （见 AGENTS.md），换图时把 key 从豁免清单移走、在 COVER_CREDITS 补上署名。
 * 也因此这个档案在 dev 与 cloudflare 会长得不一样，是刻意的。
 */
export interface CoverCredit {
  /** 预设 key，对应 coverPresets 或 categoryCoverPresets */
  key: string;
  /** 作品标题 */
  title: string;
  /** 作者署名（以 pixiv 帐号显示名为准） */
  artist: string;
  /** 原始出处 */
  url: string;
  /** 作品所属 IP／标签，纯展示用；原创作品留空 */
  work?: string;
}

export const COVER_CREDITS: CoverCredit[] = [];

/**
 * 随主题散布、走主题授权的图片 key：不需要个别署名，/credits/ 的校验会跳过。
 * 站点换掉其中任何一张时，把该 key 从这里移走并在 COVER_CREDITS 补上署名。
 */
export const THEME_LICENSED_KEYS: readonly string[] = [
  "cover-1",
  "cover-2",
  "cover-3",
  "cover-4",
  "cover-5",
  "cover-6",
  "avatar",
];

export function getCoverCredit(key: string): CoverCredit | undefined {
  return COVER_CREDITS.find((credit) => credit.key === key);
}

export function isThemeLicensed(key: string): boolean {
  return THEME_LICENSED_KEYS.includes(key);
}
