export interface SakuraRuntimeOptions {
  count: number;
  xSpeed: number;
  ySpeed: number;
  rSpeed: number;
  direction: string;
  zIndex: number;
  scriptSrc: string;
}

declare global {
  interface Window {
    shokaxSakuraBound?: boolean;
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

const SAKURA_SCRIPT_ID = "shokax-sakura-script";

const startSakura = (options: SakuraRuntimeOptions) => {
  if (typeof window === "undefined" || window.shokaxSakuraBound) {
    return;
  }

  // sakura-rain 从 window.sakuraConfig 读取参数，必须在脚本载入前写入
  window.sakuraConfig = {
    sakura: options.count,
    xSpeed: options.xSpeed,
    ySpeed: options.ySpeed,
    rSpeed: options.rSpeed,
    direction: options.direction,
    zIndex: options.zIndex,
  };

  window.shokaxSakuraBound = true;

  if (document.getElementById(SAKURA_SCRIPT_ID)) {
    return;
  }

  const script = document.createElement("script");
  script.id = SAKURA_SCRIPT_ID;
  script.src = options.scriptSrc;
  script.defer = true;
  document.head.append(script);
};

export function init(options: SakuraRuntimeOptions): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  // 插件系统在页面脚本顶层立即调用 init，此时 DOM 可能尚未就绪
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => startSakura(options), {
      once: true,
    });
  } else {
    startSakura(options);
  }

  // 若日后启用 ClientRouter（View Transitions），模块脚本不会重跑，靠这个补上
  document.addEventListener("astro:page-load", () => startSakura(options));
}
