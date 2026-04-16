import themeConfig from "@/theme.config";

declare global {
  interface Window {
    __shokaxSakuraBound?: boolean;
    sakuraConfig?: {
      sakura: number;
      xSpeed: number;
      ySpeed: number;
      rSpeed: number;
      direction: string;
      zIndex: number;
    };
  }
}

const DEFAULT_SCRIPT_SRC =
  "https://cdn.jsdelivr.net/gh/minz71/sakura-rain/sakura-rain.js";
const SAKURA_SCRIPT_ID = "shokax-sakura-script";

const initSakura = () => {
  if (typeof window === "undefined" || window.__shokaxSakuraBound) {
    return;
  }

  const sakuraConfig = themeConfig.sakura;
  if (sakuraConfig?.enable === false) {
    return;
  }

  window.sakuraConfig = {
    sakura: sakuraConfig?.count ?? 30,
    xSpeed: sakuraConfig?.xSpeed ?? 0.5,
    ySpeed: sakuraConfig?.ySpeed ?? 0.5,
    rSpeed: sakuraConfig?.rSpeed ?? 0.03,
    direction: sakuraConfig?.direction ?? "TopRight",
    zIndex: sakuraConfig?.zIndex ?? -1,
  };

  const existingScript = document.getElementById(SAKURA_SCRIPT_ID);
  if (existingScript) {
    window.__shokaxSakuraBound = true;
    return;
  }

  const script = document.createElement("script");
  script.id = SAKURA_SCRIPT_ID;
  script.src = sakuraConfig?.scriptSrc?.trim() || DEFAULT_SCRIPT_SRC;
  script.defer = true;

  window.__shokaxSakuraBound = true;
  document.head.append(script);
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSakura, {
    once: true,
  });
} else {
  initSakura();
}

document.addEventListener("astro:page-load", initSakura);
