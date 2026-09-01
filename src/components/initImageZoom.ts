import imageZoomStylesheet from "@/styles/image-zoom.css?url";
import { loadStylesheet } from "@/toolkit/loadStylesheet";

import { registerImageZoom } from "./image-zoom-element";

void loadStylesheet(imageZoomStylesheet);
registerImageZoom();
