/**
 * 把主题调色板里的 CSS 颜色值转换成 mermaid 能消化的十六进制字符串。
 *
 * mermaid 内部用 khroma 对主题色做加深/变亮/取反等运算，而 khroma 只认
 * hex / rgb / hsl / 颜色关键字。本项目的 palette.css 全量使用 oklch()，
 * 直接喂给 mermaid 会被解析成黑色，因此需要先在这里落地成 sRGB。
 */

const HEX_RE = /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i;
const OKLCH_RE = /^oklch\(\s*([^\s/]+)\s+([^\s/]+)\s+([^\s/]+)\s*(?:\/\s*([^\s)]+)\s*)?\)$/i;
const RGB_RE = /^rgba?\(([^)]+)\)$/i;

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function toHexPair(channel01: number): string {
  return Math.round(clamp01(channel01) * 255)
    .toString(16)
    .padStart(2, "0");
}

/** 解析可能带单位的数值：`0.5` / `50%` / `120deg` */
function parseComponent(raw: string, percentBase: number): number {
  const token = raw.trim().toLowerCase();
  if (token.endsWith("%")) {
    return (Number.parseFloat(token) / 100) * percentBase;
  }
  if (token.endsWith("deg")) {
    return Number.parseFloat(token);
  }
  if (token === "none") return 0;
  return Number.parseFloat(token);
}

/** sRGB 传输函数（线性 → 伽马编码） */
function encodeSrgbChannel(linear: number): number {
  const abs = Math.abs(linear);
  const encoded = abs <= 0.0031308 ? abs * 12.92 : 1.055 * abs ** (1 / 2.4) - 0.055;
  return linear < 0 ? -encoded : encoded;
}

/** oklch → sRGB hex（超出色域时按通道钳制） */
export function oklchToHex(l: number, c: number, hDeg: number, alpha = 1): string {
  const hRad = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);

  const lCube = (l + 0.396_337_777_4 * a + 0.215_803_757_3 * b) ** 3;
  const mCube = (l - 0.105_561_345_8 * a - 0.063_854_172_8 * b) ** 3;
  const sCube = (l - 0.089_484_177_5 * a - 1.291_485_548 * b) ** 3;

  const r = 4.076_741_662_1 * lCube - 3.307_711_591_3 * mCube + 0.230_969_929_2 * sCube;
  const g = -1.268_438_004_6 * lCube + 2.609_757_401_1 * mCube - 0.341_319_396_5 * sCube;
  const bl = -0.004_196_086_3 * lCube - 0.703_418_614_7 * mCube + 1.707_614_701 * sCube;

  const hex = `#${toHexPair(encodeSrgbChannel(r))}${toHexPair(encodeSrgbChannel(g))}${toHexPair(encodeSrgbChannel(bl))}`;
  return alpha >= 1 ? hex : `${hex}${toHexPair(alpha)}`;
}

function expandShortHex(value: string): string {
  const body = value.slice(1);
  if (body.length !== 3 && body.length !== 4) return value.toLowerCase();
  return `#${body.replaceAll(/[\da-f]/gi, (channel) => channel + channel)}`.toLowerCase();
}

/**
 * 把任意受支持的 CSS 颜色值规范化成 hex；无法解析时返回 null，
 * 交由调用方决定回退策略（浏览器端可用 canvas 兜底）。
 */
export function cssColorToHex(value: string): string | null {
  const input = value.trim();
  if (!input) return null;

  if (HEX_RE.test(input)) {
    return expandShortHex(input);
  }

  const oklchMatched = OKLCH_RE.exec(input);
  if (oklchMatched) {
    const l = parseComponent(oklchMatched[1], 1);
    const c = parseComponent(oklchMatched[2], 0.4);
    const h = parseComponent(oklchMatched[3], 360);
    const alpha = oklchMatched[4] ? parseComponent(oklchMatched[4], 1) : 1;
    if ([l, c, h, alpha].some(Number.isNaN)) return null;
    return oklchToHex(l, c, h, alpha);
  }

  const rgbMatched = RGB_RE.exec(input);
  if (rgbMatched) {
    const parts = rgbMatched[1]
      .replaceAll("/", " ")
      .replaceAll(",", " ")
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length < 3) return null;
    const [r, g, b, a] = parts;
    const alpha = a === undefined ? 1 : parseComponent(a, 1);
    const channels = [r, g, b].map((part) => parseComponent(part, 255) / 255);
    if (channels.some(Number.isNaN) || Number.isNaN(alpha)) return null;
    const hex = `#${channels.map((channel) => toHexPair(channel)).join("")}`;
    return alpha >= 1 ? hex : `${hex}${toHexPair(alpha)}`;
  }

  return null;
}

/**
 * 浏览器端兜底：借 canvas 让引擎自己算出 sRGB（可处理 color-mix()、
 * 颜色关键字等本模块未覆盖的语法）。非浏览器环境返回 null。
 */
export function cssColorToHexWithCanvas(value: string): string | null {
  const direct = cssColorToHex(value);
  if (direct) return direct;
  if (typeof document === "undefined") return null;

  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = "#000000";
    context.fillStyle = value;
    // 赋值失败时 fillStyle 会保持上一次的值，说明引擎也不认这个颜色
    if (context.fillStyle === "#000000" && !/^(#0{3,8}|black)$/i.test(value.trim())) {
      return null;
    }
    context.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
    const hex = `#${toHexPair(r / 255)}${toHexPair(g / 255)}${toHexPair(b / 255)}`;
    return a >= 255 ? hex : `${hex}${toHexPair(a / 255)}`;
  } catch {
    return null;
  }
}
