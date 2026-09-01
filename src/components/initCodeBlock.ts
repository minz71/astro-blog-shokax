import ArrowDownSLine from "@/assets/icons/arrow-down-s-line.svg";
import ArrowUpSLine from "@/assets/icons/arrow-up-s-line.svg";
import CheckFill from "@/assets/icons/check-fill.svg";
import FileCopyFill from "@/assets/icons/file-copy-fill.svg";
import FullscreenExitLine from "@/assets/icons/fullscreen-exit-line.svg";
import FullscreenLine from "@/assets/icons/fullscreen-line.svg";
import codeBlockStylesheet from "@/styles/code-block-light.css?url";
import { loadStylesheet } from "@/toolkit/loadStylesheet";

import { registerCodeBlock } from "./code-block-element";

void loadStylesheet(codeBlockStylesheet);
registerCodeBlock({
  copy: FileCopyFill.src,
  copied: CheckFill.src,
  fullscreen: FullscreenLine.src,
  fullscreenExit: FullscreenExitLine.src,
  arrowDown: ArrowDownSLine.src,
  arrowUp: ArrowUpSLine.src,
});
