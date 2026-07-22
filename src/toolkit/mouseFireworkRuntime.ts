import type { PluginInitFunction } from "@hyacine/helper/runtime";
import firework from "mouse-firework";

interface MouseFireworkRuntimeOptions {
  colors: string[];
  count: number;
  radius: number;
}

const HEART_ENTITY_NAME = "heart";

// 愛心形狀：座標取自 Font Awesome 的 heart 圖示（512×512 viewBox），
// 以中心點對齊、依 radius 縮放。因為插件 options 不能傳類別，
// 形狀只能寫死在 runtime 這一層。
class HeartEntity extends firework.BaseEntity {
  paint() {
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

export const init: PluginInitFunction<MouseFireworkRuntimeOptions> = (options) => {
  firework.registerEntity(HEART_ENTITY_NAME, HeartEntity);
  firework({
    excludeElements: ["a", "button", "input", "textarea", "select", "summary"],
    particles: [
      {
        shape: HEART_ENTITY_NAME,
        move: "emit",
        easing: "easeOutExpo",
        colors: options.colors,
        number: options.count,
        duration: [2400, 3000],
        shapeOptions: {
          radius: options.radius,
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
          radius: options.radius,
          alpha: 0.5,
          lineWidth: 6,
        },
      },
    ],
  });
};
