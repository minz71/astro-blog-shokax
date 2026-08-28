import { onMount } from "solid-js";

import CheckFill from "@/assets/icons/check-fill.svg";
import FileCopyFill from "@/assets/icons/file-copy-fill.svg";
import Focus3Line from "@/assets/icons/focus-3-line.svg";
import FullscreenExitLine from "@/assets/icons/fullscreen-exit-line.svg";
import FullscreenLine from "@/assets/icons/fullscreen-line.svg";
import ZoomInLine from "@/assets/icons/zoom-in-line.svg";
import ZoomOutLine from "@/assets/icons/zoom-out-line.svg";
import { currentLocale, getT } from "@/i18n";
import type { MermaidIcons, MermaidLabels } from "./mermaid-diagram-element";

/**
 * mermaid-diagram 自定义元素注册器（P3 迁移自 MermaidDiagram.svelte）
 *
 * 在 Layout 中以 <MermaidDiagram client:idle /> 挂载以触发注册；文章里的
 * <mermaid-diagram> 由 mermaid-diagram-element.ts 的原生自定义元素接管。
 * 动态 import：自定义元素类 extends HTMLElement，仅可在客户端加载。
 *
 * 图标与文案在这里取：SVG 需要 Vite 处理才拿得到 .src，i18n 也只有在
 * 被打包的模块里才解析得到——element 那侧是纯 TS，两者都拿不到。
 */
function MermaidDiagram() {
  onMount(async () => {
    const t = getT(currentLocale);

    const icons: MermaidIcons = {
      copy: FileCopyFill.src,
      copied: CheckFill.src,
      fullscreen: FullscreenLine.src,
      fullscreenExit: FullscreenExitLine.src,
      zoomIn: ZoomInLine.src,
      zoomOut: ZoomOutLine.src,
      reset: Focus3Line.src,
    };

    const labels: MermaidLabels = {
      label: t("mermaid.label"),
      loading: t("mermaid.loading"),
      error: t("mermaid.error"),
      copy: t("mermaid.copy"),
      copied: t("mermaid.copied"),
      fullscreen: t("mermaid.fullscreen"),
      exitFullscreen: t("mermaid.exitFullscreen"),
      zoomIn: t("mermaid.zoomIn"),
      zoomOut: t("mermaid.zoomOut"),
      reset: t("mermaid.reset"),
    };

    const { registerMermaidDiagram } = await import("./mermaid-diagram-element");
    registerMermaidDiagram(icons, labels);
  });

  return null;
}

export default MermaidDiagram;
