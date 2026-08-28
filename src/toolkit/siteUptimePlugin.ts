import { definePlugin, type PluginManifest } from "@hyacine/plugin-core";

export interface SiteUptimeUnits {
  year: string;
  years: string;
  month: string;
  months: string;
  day: string;
  days: string;
  hour: string;
  hours: string;
  minute: string;
  minutes: string;
  second: string;
  seconds: string;
}

export interface SiteUptimeOptions {
  /** 站点上线时间（ISO 8601） */
  siteCreatedAt: string;
  /** 前缀文案，由 i18n 提供 */
  prefixText: string;
  /** 单位文案，由 i18n 提供 */
  units: SiteUptimeUnits;
  /**
   * 数字与单位之间是否加空格。
   * 中日文不加（"3天"），西文要加（"3 days"）。由 i18n 显式给出，不靠猜。
   */
  spaced: boolean;
  /** 挂载点，预设与 @hyacine/plugin-site-uptime 一致 */
  targetSelector?: string;
}

/**
 * 取代 @hyacine/plugin-site-uptime：官方版把 "天/小时/分/秒" 写死成简体中文，
 * 只有 prefixText 可配置，繁中站与英文站都会显示简中单位。
 *
 * 挂载方式沿用官方 0.2 的写法（targetSelector + .hyacine-uptime-counter），
 * 运行期不依赖 @hyacine/helper——那个包还停在 0.0.3 世代。
 */
export function siteUptime(options: SiteUptimeOptions): PluginManifest {
  const createdDate = new Date(options.siteCreatedAt);
  if (Number.isNaN(createdDate.getTime())) {
    throw new Error(
      `[site-uptime] Invalid siteCreatedAt: "${options.siteCreatedAt}". Please provide a valid date string.`,
    );
  }

  return definePlugin({
    name: "local-site-uptime",
    version: "0.1.0",
    minRenderCapability: "runtime-only",
    entry: [
      {
        name: "local-site-uptime-runtime",
        type: "runtime-only",
        injectPoint: "footer-status",
        path: new URL("./siteUptimeRuntime.ts", import.meta.url).href,
        options: {
          siteCreatedAt: options.siteCreatedAt,
          prefixText: options.prefixText,
          units: options.units,
          spaced: options.spaced,
          ...(options.targetSelector ? { targetSelector: options.targetSelector } : {}),
        },
      },
    ],
  });
}

export default siteUptime;
