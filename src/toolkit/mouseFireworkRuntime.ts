import firework from "mouse-firework";

export interface MouseFireworkRuntimeOptions {
  colors: string[];
  count: number;
  radius: number;
}

declare global {
  interface Window {
    shokaxHeartFireworkCleanup?: () => void;
  }
}

const INTERACTIVE_SELECTORS = [
  "a",
  "button",
  "input",
  "textarea",
  "select",
  "label",
  "summary",
  "[role='button']",
  "[contenteditable='true']",
  "[data-no-click-heart]",
];

class HeartEntity extends firework.BaseEntity {
  paint(): void {
    const { ctx, radius } = this;

    ctx.shadowColor = this.color;
    ctx.shadowBlur = Math.max(2, radius * 0.2);
    ctx.beginPath();
    ctx.moveTo(0, radius * 0.35);
    ctx.bezierCurveTo(-radius * 0.9, -radius * 0.25, -radius * 0.65, -radius, 0, -radius * 0.45);
    ctx.bezierCurveTo(radius * 0.65, -radius, radius * 0.9, -radius * 0.25, 0, radius * 0.85);
    ctx.closePath();
  }
}

function markFireworkCanvas(): void {
  const canvas = Array.from(document.body.querySelectorAll("canvas")).find(
    (element) =>
      element.style.position === "fixed" &&
      element.style.pointerEvents === "none" &&
      element.style.zIndex === "9999999",
  );
  if (canvas) canvas.dataset.clickHeart = "true";
}

export function init(options: MouseFireworkRuntimeOptions): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  window.shokaxHeartFireworkCleanup?.();
  delete window.shokaxHeartFireworkCleanup;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  firework.registerEntity("heart", HeartEntity);

  const count = Math.max(1, Math.round(options.count));
  const radius = Math.max(6, options.radius);
  const colors = options.colors.length > 0 ? options.colors : ["rgba(255,182,185,.9)"];

  window.shokaxHeartFireworkCleanup = firework({
    excludeElements: INTERACTIVE_SELECTORS,
    particles: [
      {
        shape: "heart",
        move: ["emit", "rotate"],
        easing: "easeOutExpo",
        colors,
        number: count,
        duration: [1200, 1800],
        shapeOptions: {
          radius: [radius * 0.7, radius * 1.15],
        },
        moveOptions: [
          {
            emitRadius: [60, 120],
            radius: 0.1,
            alphaChange: true,
            alpha: 0,
            alphaDuration: [900, 1200],
          },
          {
            angle: [-35, 35],
          },
        ],
      },
    ],
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", markFireworkCanvas, { once: true });
  } else {
    markFireworkCanvas();
  }
}

export default { init };
