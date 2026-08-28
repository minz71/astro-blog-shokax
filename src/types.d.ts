/**
 * vite-plugin-font 的 ?subsets 虚拟模块除了 css 之外，还会把 metrics.json 里的
 * fontFamilyFallback（metric 对齐过的本机字体堆叠）一起 export，
 * 但套件的 font.d.ts 只宣告了 css，这里补上宣告。
 */
declare module "@konghayao/_font_" {
  export const fontFamilyFallback: string;
}

declare module "nyx-player";
declare module "nyx-player/style";
declare module "@waline/client/style";
declare module "@pagefind/component-ui";
declare module "@pagefind/component-ui/css";

declare module "virtual:hyacine/runtime" {
  export const initialized: boolean;
}
declare module "virtual:hyacine/config" {
  export const config: Record<string, unknown>;
}
declare module "virtual:hyacine/slots-manifest" {
  const slotsManifest: Record<string, any>;
  export { slotsManifest };
}
declare module "virtual:hyacine/slots/*" {
  const component: any;
  export default component;
}
