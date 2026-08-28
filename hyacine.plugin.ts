import { defineConfig } from "@hyacine/plugin-core";
import mouseFirework from "@hyacine/plugin-mouse-firework";
import articleAgeWarning from "@hyacine/plugin-article-age-warning";
import vercount from "@hyacine/plugin-vercount";
import analytics from "@hyacine/plugin-analytics";
import walineComments from "@hyacine/plugin-waline-comments";
import aiContent from "@hyacine/plugin-ai-content";
import visibilityTitle from "@hyacine/plugin-visibility-title";
import nyxPlayer from "@hyacine/plugin-nyx-player";
import articleStatistics from "@hyacine/plugin-article-statistics";
import themeConfig from "./src/theme.config";
import sakura from "./src/toolkit/sakuraPlugin";
import siteUptime from "./src/toolkit/siteUptimePlugin";
// 只能用相对路径：这个档案由 hyacine 的设定载入器读取，解析不了 @/ 别名
// （theme.config.ts 开头那行注解讲的是同一件事）。
import { resolveLocale } from "./src/toolkit/i18n/resolveLocale";
import zhCN from "./src/i18n/locales/zh-CN.json";
import zhTW from "./src/i18n/locales/zh-TW.json";
import ja from "./src/i18n/locales/ja.json";
import en from "./src/i18n/locales/en.json";

/*
 * 插件按轴切：实作与观感预设值属主题（本档与 src/toolkit/*Plugin.ts），
 * 「换了站点就该跟着换」的值走 theme.config.ts 的 plugins 区块。
 * 装饰性插件一律 gate 在 theme.config.ts 上、预设不注册。
 * 详见 AGENTS.md 的「插件的归属」。
 */
const localeMessages = { "zh-CN": zhCN, "zh-TW": zhTW, ja, en };
const uptimeText = localeMessages[resolveLocale(themeConfig.locale)].footer.siteUptime;

// 没有上线时间就不注册：运行时长没有起算点，显示不出有意义的结果
const siteCreatedAt = themeConfig.plugins?.siteUptime?.siteCreatedAt?.trim();

// 站点可覆写的插件设定：主题只给示范预设值，实际值走 theme.config.ts
// 文章过旧提醒：上游无条件注册，这里让站点能关掉（官方插件没有 enable 选项，
// 所以只能靠不进 plugins 数组）
const ageWarningConfig = themeConfig.plugins?.articleAgeWarning ?? {};
const ageWarningEnabled = ageWarningConfig.enable !== false;

// 音乐播放器预设关闭：它要向 music.163.com 取歌单，那是 http（非 https）请求且会
// 回 404 与第三方 cookie，Lighthouse 的 best-practices 直接从 96 掉到 74（实测
// 未改动的 upstream main 也是 74）。依 AGENTS.md，依赖第三方服务的装饰性插件
// 一律 gate 在 theme.config.ts 上、预设不注册。
const nyxPlayerConfig = themeConfig.plugins?.nyxPlayer ?? {};
const nyxPlayerEnabled = nyxPlayerConfig.enable === true;
const visibilityTitleOverrides = themeConfig.plugins?.visibilityTitle ?? {};

const sakuraConfig = themeConfig.plugins?.sakura;
const sakuraEnabled = sakuraConfig?.enable === true;

export default defineConfig({
  injectPoints: {
    "footer-status": {
      selector: "#footer .status",
      position: "append",
    },
    "post-header": {
      selector: "article.post header",
      position: "after",
    },
    "post-footer": {
      selector: "article.post .body",
      position: "after",
    },
  },
  plugins: [
    // 页脚运行时长：文案全走 i18n，官方 @hyacine/plugin-site-uptime 把
    // 「天/小时/分/秒」写死成简体中文，繁中与英文站会显示错误单位。
    ...(siteCreatedAt
      ? [
          siteUptime({
            siteCreatedAt,
            prefixText: uptimeText.prefix,
            spaced: uptimeText.spaced,
            units: uptimeText.units,
          }),
        ]
      : []),
    mouseFirework({
      count: 16,
      radius: 80,
    }),
    ...(ageWarningEnabled
      ? [
          articleAgeWarning({
            maxAgeDays: ageWarningConfig.maxAgeDays ?? 180,
            ...(ageWarningConfig.message ? { message: ageWarningConfig.message } : {}),
          }),
        ]
      : []),
    vercount(),
    analytics({
      googleAnalytics: {
        measurementId: "",
      },
      umami: {
        websiteId: "",
        scriptUrl: "",
      },
    }),
    walineComments({
      serverURL: "",
      lang: "zh-CN",
    }),
    aiContent({
      enable: false,
      aiSummary: {
        enable: true,
        title: "AI 摘要",
        showModel: true,
      },
      aiRecommend: {
        enable: true,
        limit: 3,
        minSimilarity: 0.4,
      },
    }),
    visibilityTitle({
      enable: true,
      leaveTitle: "👀 你先忙，我等你回来~",
      returnTitle: "🎉 欢迎回来！",
      restoreDelay: 3000,
      ...visibilityTitleOverrides,
    }),
    ...(nyxPlayerEnabled
      ? [
          nyxPlayer({
            enable: true,
            urls: [
              {
                name: "默认歌单",
                url: "https://music.163.com/m/playlist?id=12834717281&creatorId=12676493230",
              },
            ],
            preset: "shokax",
            darkModeTarget: ":root[data-theme=dark]",
            metingBaseURL: "https://meting.api.zkz098.cn/",
            metingUrlSource: "outer",
            ...nyxPlayerConfig,
          }),
        ]
      : []),
    articleStatistics(),
    // 装饰性插件：没在 theme.config.ts 明确开启就不进 plugins 数组
    ...(sakuraEnabled
      ? [
          sakura({
            count: 30,
            xSpeed: 0.5,
            ySpeed: 0.5,
            rSpeed: 0.03,
            direction: "TopRight",
            zIndex: -1,
            ...(sakuraConfig?.scriptSrc ? { scriptSrc: sakuraConfig.scriptSrc } : {}),
          }),
        ]
      : []),
  ],
});
