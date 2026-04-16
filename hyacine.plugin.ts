import { defineConfig } from "@hyacine/core/config";
import { getLocaleFromConfig, getT } from "./src/i18n";
import themeConfig from "./src/theme.config";

import SiteUpTime from "./src/toolkit/siteUptimePlugin";

const locale = getLocaleFromConfig(themeConfig);
const t = getT(locale);

export default defineConfig({
  injectPoints: {
    // 页面 head 部分，用于注入元标签、CSS 等
    head: 'slot[name="head"]',
    // 主布局容器
    layout: "#container",
    // 导航栏（navbar）
    "right-nav": "#nav",
    // 侧边栏
    sidebar: "#sidebar",
    // 页脚
    footer: "#footer",
    "footer-status": ".status",
    // 页脚小部件区域
    widgets: ".widgets",
    // 文章页脚（版权、打赏等）
    "post-footer": ".post footer",
  },

  plugins: [
    SiteUpTime({
      siteCreatedAt: "2022-08-01T00:00:00Z",
      prefixText: t("footer.siteUptime.prefix"),
      units: {
        year: t("footer.siteUptime.units.year"),
        years: t("footer.siteUptime.units.years"),
        month: t("footer.siteUptime.units.month"),
        months: t("footer.siteUptime.units.months"),
        day: t("footer.siteUptime.units.day"),
        days: t("footer.siteUptime.units.days"),
        hour: t("footer.siteUptime.units.hour"),
        hours: t("footer.siteUptime.units.hours"),
        minute: t("footer.siteUptime.units.minute"),
        minutes: t("footer.siteUptime.units.minutes"),
        second: t("footer.siteUptime.units.second"),
        seconds: t("footer.siteUptime.units.seconds"),
      },
    }),
  ],
});
