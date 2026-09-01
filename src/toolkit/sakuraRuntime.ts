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
  interface Navigator {
    readonly connection?: {
      readonly saveData?: boolean;
    };
  }

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
let loadScheduled = false;

const shouldLoadSakura = () => {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const savesData = navigator.connection?.saveData === true;

  return !prefersReducedMotion && !savesData && document.visibilityState !== "hidden";
};

const startSakura = (options: SakuraRuntimeOptions) => {
  if (window.shokaxSakuraBound || !shouldLoadSakura()) {
    return;
  }

  const existingScript = document.getElementById(SAKURA_SCRIPT_ID);
  if (existingScript instanceof HTMLScriptElement) {
    if (existingScript.dataset.loaded === "true") {
      window.shokaxSakuraBound = true;
    }
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

  const script = document.createElement("script");
  script.id = SAKURA_SCRIPT_ID;
  script.src = options.scriptSrc;
  script.async = true;
  script.addEventListener(
    "load",
    () => {
      script.dataset.loaded = "true";
      window.shokaxSakuraBound = true;
    },
    { once: true },
  );
  script.addEventListener(
    "error",
    () => {
      script.remove();
      delete window.shokaxSakuraBound;
    },
    { once: true },
  );
  document.head.append(script);
};

const scheduleSakura = (options: SakuraRuntimeOptions) => {
  if (loadScheduled || window.shokaxSakuraBound || !shouldLoadSakura()) {
    return;
  }

  loadScheduled = true;
  const run = () => {
    loadScheduled = false;
    startSakura(options);
  };

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run, { timeout: 2000 });
  } else {
    window.setTimeout(run, 1200);
  }
};

export function init(options: SakuraRuntimeOptions): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const scheduleAfterLoad = () => scheduleSakura(options);

  // 装饰性第三方脚本不参与首屏竞争，等页面资源完成且浏览器空闲后再载入。
  if (document.readyState === "complete") {
    scheduleAfterLoad();
  } else {
    window.addEventListener("load", scheduleAfterLoad, { once: true });
  }

  // 后台页不启动动画；回到前台后才进入空闲排程。
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      scheduleAfterLoad();
    }
  });

  // 若日后启用 ClientRouter（View Transitions），模块脚本不会重跑，靠这个补上。
  document.addEventListener("astro:page-load", scheduleAfterLoad);
}
