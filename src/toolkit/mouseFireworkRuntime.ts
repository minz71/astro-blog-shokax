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

const HEART_ENTITY_NAME = "heart";
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
    const scale = radius / 256;
    const centerX = 256;
    const centerY = 256;

    ctx.beginPath();
    ctx.save();
    ctx.translate(0, 0);
    ctx.scale(scale, scale);

    ctx.moveTo(462.3 - centerX, 62.6 - centerY);
    ctx.bezierCurveTo(
      407.5 - centerX,
      15.9 - centerY,
      326 - centerX,
      24.3 - centerY,
      275.7 - centerX,
      76.2 - centerY,
    );
    ctx.lineTo(256 - centerX, 96.5 - centerY);
    ctx.lineTo(236.3 - centerX, 76.2 - centerY);
    ctx.bezierCurveTo(
      186.1 - centerX,
      24.3 - centerY,
      104.5 - centerX,
      15.9 - centerY,
      49.7 - centerX,
      62.6 - centerY,
    );
    ctx.bezierCurveTo(
      -13.1 - centerX,
      116.2 - centerY,
      -16.4 - centerX,
      212.4 - centerY,
      39.8 - centerX,
      270.5 - centerY,
    );
    ctx.lineTo(233.3 - centerX, 470.3 - centerY);
    ctx.bezierCurveTo(
      239.5 - centerX,
      476.75 - centerY,
      249.25 - centerX,
      480 - centerY,
      256 - centerX,
      480 - centerY,
    );
    ctx.bezierCurveTo(
      262.75 - centerX,
      480 - centerY,
      272.5 - centerX,
      476.75 - centerY,
      278.7 - centerX,
      470.3 - centerY,
    );
    ctx.lineTo(472.2 - centerX, 270.5 - centerY);
    ctx.bezierCurveTo(
      528.5 - centerX,
      212.4 - centerY,
      525.2 - centerX,
      116.2 - centerY,
      462.3 - centerX,
      62.6 - centerY,
    );
    ctx.closePath();
    ctx.restore();
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

  firework.registerEntity(HEART_ENTITY_NAME, HeartEntity);

  const count = Math.max(1, Math.round(options.count));
  const radius = Math.max(6, options.radius);
  const colors = options.colors.length > 0 ? options.colors : ["rgba(255,182,185,.9)"];

  window.shokaxHeartFireworkCleanup = firework({
    excludeElements: INTERACTIVE_SELECTORS,
    particles: [
      {
        shape: HEART_ENTITY_NAME,
        move: "emit",
        easing: "easeOutExpo",
        colors,
        number: count,
        duration: [1600, 2400],
        shapeOptions: {
          radius: [radius * 0.7, radius * 1.15],
          alpha: [0.85, 1],
        },
        moveOptions: {
          emitRadius: [60, 160],
          radius: [radius * 0.3, radius * 0.6],
          alphaChange: true,
          alpha: 0,
          alphaEasing: "easeOutQuad",
          alphaDuration: [1200, 2000],
        },
      },
      {
        shape: "circle",
        move: ["diffuse"],
        easing: "easeOutExpo",
        colors: ["#FFF"],
        number: 1,
        duration: [3000, 4000],
        shapeOptions: {
          radius,
          alpha: 0.5,
          lineWidth: 6,
        },
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
