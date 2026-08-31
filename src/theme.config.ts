// cannot use path alias here because unocss can not resolve it
import { defineConfig } from "./toolkit/themeConfig";

export default defineConfig({
  siteName: "minz的筆記本",
  locale: "zh-TW",
  siteUrl: "https://blog.minz.li",
  // 本站图示：public/favicon.ico（32x32 猫）与 public/apple-touch-icon.png。
  // 主题预设不输出 <link rel="icon">（它不附图示档），所以这里要指明；
  // apple-touch-icon.png 先前一直躺在 public/ 里没有任何地方引用。
  icons: {
    favicon: "/favicon.ico",
    appleTouchIcon: "/apple-touch-icon.png",
  },
  theme: {
    defaultMode: "light",
  },
  nav: [
    {
      href: "/",
      text: "首頁",
      icon: "i-ri-home-line",
    },
    {
      text: "文章",
      href: "/random/",
      icon: "i-ri-quill-pen-fill",
      dropbox: {
        enable: true,
        items: [
          {
            href: "/categories/",
            text: "分類",
            icon: "i-ri-book-shelf-fill",
          },
          {
            href: "/tags/",
            text: "標籤",
            icon: "i-ri-price-tag-3-fill",
          },
          {
            href: "/archives/",
            text: "彙整",
            icon: "i-ri-archive-line",
          },
        ],
      },
    },
    {
      href: "/about/",
      text: "關於我",
      icon: "i-ri-user-line",
    },
    {
      href: "/links/",
      text: "連結",
      icon: "i-ri-link",
    },
  ],
  brand: {
    title: "minz的筆記本",
    subtitle: "這是一個分享我學習筆記的空間",
    logo: "✦",
  },
  cover: {
    enable: true,
    preload: true,
    // 上游 advancedCarousel：fixedCover 必須關閉，輪播才會啟用
    advancedCarousel: true,
    fixedCover: {
      enable: false,
      url: "cover-1",
    },
    // 本地图（预设 key，走 Astro <Image /> 优化）与远端图床 URL 可混写
    coverUrls: ["cover-1", "cover-2", "cover-3", "cover-4", "cover-5", "cover-6"],
    nextGradientCover: false,
  },
  sidebar: {
    author: "minz",
    description: "這是一個分享我學習筆記的空間",
    social: {
      github: {
        url: "https://github.com/minz71",
        icon: "i-ri-github-fill",
        color: "#191717",
      },
      telegram: {
        url: "https://t.me/minzli",
        icon: "i-ri-telegram-fill",
        color: "#32afed",
      },
      email: {
        url: "mailto:admin@minz.li",
        icon: "i-ri-mail-fill",
        color: "#55acd5",
      },
    },
  },
  footer: {
    since: 2023,
    icon: {
      name: "sakura rotate",
      color: "var(--color-pink)",
    },
    count: true,
    powered: true,
    icp: {
      enable: false,
    },
  },
  tagCloud: {
    startColor: "#72cecf",
    endColor: "#ffbac3",
  },
  widgets: {
    randomPosts: true,
    recentComments: false,
    recentCommentsLimit: 10,
  },
  home: {
    selectedCategories: [
      {
        name: "ShokaX",
        cover: "category-shokax",
      },
      {
        name: "CS",
        cover: "category-cs",
      },
    ],
    pageSize: 10,
    title: {
      behavior: "custom",
      customTitle: "minz的筆記本",
    },
  },
  layout: {
    mode: "two-column",
    rightSidebar: {
      order: ["announcement", "search", "calendar", "recentMoments", "randomPosts", "tagCloud"],
      announcement: true,
      search: true,
      calendar: true,
      recentMoments: true,
      randomPosts: true,
      tagCloud: true,
    },
  },
  friends: {
    title: "連結",
    description: "放連結的地方",
    links: [
      {
        url: "https://dns.minz.li",
        title: "AdGuard Home",
        desc: "擋廣告的DNS",
        author: "minz",
        avatar: "https://static-00.iconduck.com/assets.00/adguard-home-icon-2023x2048-zxumr62h.png",
        color: "#e9546b",
      },
    ],
  },
  copyright: {
    license: "CC-BY-NC-SA-4.0",
    show: true,
  },
  // 插件的站点侧设定值（实作在 dev，见 AGENTS.md 的「插件的归属」）
  plugins: {
    // 不顯示「這篇文章發布較早」提醒
    articleAgeWarning: {
      enable: false,
    },
    mouseFirework: {
      // 裝飾性插件由本站明確啟用；dev-v2 的主題預設保持關閉
      enable: true,
    },
    siteUptime: {
      siteCreatedAt: "2022-08-01T00:00:00Z",
    },
    sakura: {
      // 2.0 起装饰性插件预设关闭，要显式开启
      enable: true,
      scriptSrc: "https://cdn.jsdelivr.net/gh/minz71/sakura-rain/sakura-rain.js",
    },
    // 2.0 把这两个从 theme.config 的顶层移进了插件系统
    nyxPlayer: {
      enable: false,
      urls: [
        {
          name: "預設歌單",
          url: "https://music.163.com/#/playlist?id=2943811283",
        },
      ],
    },
    visibilityTitle: {
      enable: true,
      leaveTitle: "(´Д｀)瀏覽器崩潰啦",
      returnTitle: "（●´3｀●）復活成功",
      restoreDelay: 3000,
    },
  },
});
