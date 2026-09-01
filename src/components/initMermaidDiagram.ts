import CheckFill from "@/assets/icons/check-fill.svg";
import FileCopyFill from "@/assets/icons/file-copy-fill.svg";
import Focus3Line from "@/assets/icons/focus-3-line.svg";
import FullscreenExitLine from "@/assets/icons/fullscreen-exit-line.svg";
import FullscreenLine from "@/assets/icons/fullscreen-line.svg";
import ZoomInLine from "@/assets/icons/zoom-in-line.svg";
import ZoomOutLine from "@/assets/icons/zoom-out-line.svg";
import { currentLocale, getT } from "@/i18n";

import { registerMermaidDiagram } from "./mermaid-diagram-element";

const t = getT(currentLocale);

registerMermaidDiagram(
  {
    copy: FileCopyFill.src,
    copied: CheckFill.src,
    fullscreen: FullscreenLine.src,
    fullscreenExit: FullscreenExitLine.src,
    zoomIn: ZoomInLine.src,
    zoomOut: ZoomOutLine.src,
    reset: Focus3Line.src,
  },
  {
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
  },
);
