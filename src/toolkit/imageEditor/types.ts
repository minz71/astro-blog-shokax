/**
 * 图片编辑工具的共享型别。
 *
 * 这些型别同时被浏览器主执行绪（岛屿 UI）与编码 Worker 引用，因此**不要**在这个
 * 档案里 import 任何 codec 或 DOM 专属实作 —— 一旦 types.ts 把 @jsquash 拉进静态
 * 相依图，Vite 就会把 wasm glue 併进岛屿主 chunk，编解码器就再也不是「用到才载」。
 */

/** 输出格式。解码一律走浏览器原生 createImageBitmap，只有编码用 wasm。 */
export type OutputFormat = "jpeg" | "png" | "webp" | "avif";

/** 顺时针旋转角度，只支援 90 度的倍数（无损的整数像素搬移）。 */
export type RotateAngle = 0 | 90 | 180 | 270;

/** 裁切框，座标与尺寸都以来源图的自然像素为单位。 */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 缩放方式。`original` 代表不缩放。 */
export type ResizeSpec =
  | { mode: "original" }
  | { mode: "percent"; percent: number }
  | { mode: "width"; width: number }
  | { mode: "longestEdge"; edge: number };

/** 一张图的完整编辑描述。UI 只改这个物件，输出流程再据此重放。 */
export interface EditSpec {
  crop: CropRect | null;
  rotate: RotateAngle;
  flipH: boolean;
  flipV: boolean;
  resize: ResizeSpec;
}

/** 浮水印模式。三种互斥，`none` 代表不套用。 */
export type WatermarkMode = "none" | "text" | "image" | "tiledText";

/** 九宫格锚点，格式为 `{垂直}-{水平}`，刚好对应 canvas 的 textBaseline/textAlign 值。 */
export type WatermarkAnchor =
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "middle-center"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

/** 单一文字浮水印：贴在九宫格其中一个锚点。 */
export interface TextWatermarkSpec {
  text: string;
  /** `<input type="color">` 的 hex 值。 */
  color: string;
  opacity: number;
  /** 字级，画面短边的百分比，图片缩放时浮水印跟着等比缩放。 */
  size: number;
  anchor: WatermarkAnchor;
}

/** 图片／Logo 浮水印：贴在九宫格其中一个锚点。 */
export interface ImageWatermarkSpec {
  bitmap: ImageBitmap | null;
  opacity: number;
  /** 相对画面宽度的百分比，保持 logo 原始长宽比缩放。 */
  scale: number;
  anchor: WatermarkAnchor;
}

/** 满版文字浮水印：以固定角度重复铺满整张画面（像证件照那样）。 */
export interface TiledTextWatermarkSpec {
  text: string;
  color: string;
  opacity: number;
  /** 字级，画面短边的百分比。 */
  size: number;
  /** 顺时针旋转角度（度）。 */
  angle: number;
  /** 重复间距，字级的倍数。 */
  spacing: number;
}

/** 整批共用一份浮水印设定，跟 `EditSpec`（逐张）不同层级。 */
export interface WatermarkSpec {
  mode: WatermarkMode;
  text: TextWatermarkSpec;
  image: ImageWatermarkSpec;
  tiledText: TiledTextWatermarkSpec;
}

/**
 * 拼贴版面。
 *
 * - `grid`：等大方格，配合 `fit` 决定裁切填满或完整留白
 * - `vertical`：全部等宽堆叠（长截图接图），永不裁切
 * - `horizontal`：全部等高并排（before/after），永不裁切
 * - `justified`：保留比例的列排（每列等高、宽度按原比例分配），永不裁切
 */
export type CollageLayout = "grid" | "vertical" | "horizontal" | "justified";

/** 拼贴设定。跟浮水印一样是整批共用，不放进逐张的 `EditSpec`。 */
export interface CollageSpec {
  layout: CollageLayout;
  /** grid：列数。justified：每列大约放几张（换算成目标列高）——两个模式共用同一个控件。 */
  columns: number;
  /** 格子间距（输出像素）。 */
  gap: number;
  /** 间距与留白的底色。 */
  background: string;
  /** 只有 grid 用得到：裁切填满 / 完整留白。 */
  fit: "cover" | "contain";
  /** 输出基准：grid / justified / vertical 是总宽度，horizontal 是总高度。 */
  targetSize: number;
}

/** 各格式的编码参数。刻意分开，因为三个 codec 的参数语意并不通用。 */
export interface CodecOptionsMap {
  jpeg: { quality: number };
  /**
   * `lossless` 是 0/1。开着的时候 libwebp 会把 `quality` 改解读成「压缩要花多少力气」
   * 而不是画质 —— 输出一律逐像素无损，数字只影响档案大小与耗时。
   */
  webp: { quality: number; lossless: number };
  /** @jsquash/avif v2 起改用 0-100 的 quality；speed 越大越快但压缩率越差。 */
  avif: { quality: number; speed: number };
  /** PNG 走无损路线，`level` 是 oxipng 的最佳化强度而非画质。 */
  png: { level: number };
}

export type CodecOptions = CodecOptionsMap[OutputFormat];

/**
 * 主执行绪 → Worker：已经套好编辑、摊平成 RGBA 的像素资料。
 *
 * 刻意做成以 format 为判别子的联集，Worker 里 switch (request.format) 之后
 * request.options 会自动收敛到该格式的参数型别，不需要任何 type assertion。
 */
export type EncodeRequest = {
  [F in OutputFormat]: {
    id: number;
    format: F;
    options: CodecOptionsMap[F];
    width: number;
    height: number;
    /** RGBA8 像素，转移（transfer）而非复制。 */
    buffer: ArrayBuffer;
  };
}[OutputFormat];

export type EncodeResponse =
  | { id: number; ok: true; buffer: ArrayBuffer }
  | { id: number; ok: false; error: string };

/** 一张待处理图片在 UI 中的状态。 */
export interface EditorItemMeta {
  id: number;
  name: string;
  /** 原始档案大小（bytes）。 */
  originalSize: number;
  /** 原始像素尺寸。 */
  naturalWidth: number;
  naturalHeight: number;
}
