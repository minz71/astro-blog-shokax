import { createMemo, createSignal, createUniqueId, For, onCleanup, onMount } from "solid-js";

import { buildTocRailPath, tocRailCenterY, type TocRailRow } from "@/toolkit/ui/tocRail";
import type { TocItem } from "./SidebarTypes";

interface SidebarContentsProps {
  toc?: TocItem[];
  isActive?: boolean;
}

const HEADING_OFFSET = 100;
/** 每层缩排（rem） */
const TOC_INDENT_REM = 0.75;
/** 文字距轨道的间距（rem） */
const TOC_RAIL_GAP_REM = 0.75;

function SidebarContents(props: SidebarContentsProps) {
  const [activeIndex, setActiveIndex] = createSignal(0);
  const [currentItems, setCurrentItems] = createSignal<Set<number>>(new Set());
  const [railRows, setRailRows] = createSignal<TocRailRow[]>([]);
  const [hoverIndex, setHoverIndex] = createSignal<number | null>(null);
  const gradientId = `toc-rail-gradient-${createUniqueId()}`;
  let containerElement: HTMLDivElement | undefined;
  let listElement: HTMLOListElement | undefined;
  let measurePathElement: SVGPathElement | undefined;

  const toc = () => props.toc ?? [];
  const minLevel = createMemo(() =>
    toc().reduce((min, item) => Math.min(min, item.level), Number.POSITIVE_INFINITY),
  );

  /** 量测每个目录项相对 .toc-rail-wrap 的位置，换算成轨道坐标；面板隐藏时尺寸为 0，跳过 */
  const measureRail = () => {
    if (!listElement || listElement.offsetHeight === 0) return;
    const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    const gap = (Number.isFinite(rootFontSize) ? rootFontSize : 16) * TOC_RAIL_GAP_REM;
    const items = listElement.querySelectorAll<HTMLElement>(":scope > .toc-item");
    setRailRows(
      Array.from(items, (item) => {
        const link = item.querySelector<HTMLElement>(":scope > .toc-link");
        return {
          x: (link?.offsetLeft ?? item.offsetLeft) - gap,
          top: item.offsetTop,
          height: item.offsetHeight,
        };
      }),
    );
  };

  const railPath = createMemo(() => buildTocRailPath(railRows()));

  /** 轨道起点到每一项中线的路径长度，用于进度描边 */
  const railLengths = createMemo(() => {
    const rows = railRows();
    const path = measurePathElement;
    if (rows.length === 0 || !path || typeof path.getTotalLength !== "function") return [];
    const lengths = rows.map((_, index) => {
      path.setAttribute("d", buildTocRailPath(rows, index));
      return path.getTotalLength();
    });
    path.removeAttribute("d");
    return lengths;
  });

  const progressDasharray = () => {
    const lengths = railLengths();
    if (lengths.length === 0) return "0 1";
    const total = lengths[lengths.length - 1];
    const progress = lengths[Math.min(activeIndex(), lengths.length - 1)];
    return `${progress} ${total + 1}`;
  };

  const railDotTransform = (index: number) => {
    const rows = railRows();
    const row = rows[Math.max(0, Math.min(index, rows.length - 1))];
    return row ? `translate(${row.x}px, ${tocRailCenterY(rows, index)}px)` : undefined;
  };

  const getTocItemClass = (index: number): string => {
    const classes = ["toc-item"];
    if (currentItems().has(index)) {
      classes.push("current");
    }
    if (activeIndex() === index) {
      classes.push("active");
    }
    return classes.join(" ");
  };

  const scrollActiveItemIntoView = () => {
    if (!props.isActive || !containerElement) return;

    requestAnimationFrame(() => {
      const scrollContainer = containerElement?.closest(".panels > .inner");
      const activeElement = containerElement?.querySelector<HTMLElement>(".toc-item.active");
      if (!(scrollContainer instanceof HTMLElement) || !activeElement) return;

      const containerRect = scrollContainer.getBoundingClientRect();
      const activeRect = activeElement.getBoundingClientRect();
      if (activeRect.top >= containerRect.top && activeRect.bottom <= containerRect.bottom) return;

      scrollContainer.scrollTo({
        top:
          scrollContainer.scrollTop +
          activeRect.top -
          containerRect.top -
          scrollContainer.clientHeight / 4,
        behavior: "smooth",
      });
    });
  };

  const activateNavByIndex = (index: number): void => {
    const items = toc();
    if (index < 0 || index >= items.length) return;

    setActiveIndex(index);
    const next = new Set<number>([index]);
    let currentToc = items[index];

    for (let i = index - 1; i >= 0; i--) {
      if (items[i].level < currentToc.level) {
        next.add(i);
        currentToc = items[i];
      }
    }

    setCurrentItems(next);
    scrollActiveItemIntoView();
  };

  const handleTocClick = (event: MouseEvent, id: string, index: number) => {
    event.preventDefault();
    const target = document.getElementById(id);
    if (!target) return;

    const scrollTop = target.getBoundingClientRect().top + window.scrollY - HEADING_OFFSET;
    window.scrollTo({ top: scrollTop, behavior: "smooth" });
    activateNavByIndex(index);
  };

  // 面板切换显示、字体载入、视窗缩放、目录内容变化（加密文章解密后才有列表）都会改变列表尺寸，
  // 统一由 ResizeObserver 触发重量；观察对象在 <ol> 挂载时才绑定
  let resizeObserver: ResizeObserver | undefined;
  const bindListElement = (element: HTMLOListElement) => {
    listElement = element;
    if (typeof ResizeObserver === "undefined") return;
    resizeObserver ??= new ResizeObserver(() => measureRail());
    resizeObserver.disconnect();
    resizeObserver.observe(element);
  };
  onCleanup(() => resizeObserver?.disconnect());

  onMount(() => {
    if (typeof window === "undefined") return;
    void document.fonts?.ready.then(() => measureRail());
  });

  onMount(() => {
    if (typeof window === "undefined" || toc().length === 0) return;

    const sections: Array<{ index: number; element: HTMLElement }> = [];
    toc().forEach((item, index) => {
      const element = document.getElementById(item.id);
      if (element) sections.push({ index, element });
    });
    if (sections.length === 0) return;

    const findIndex = (): number => {
      let index = sections[0]?.index ?? 0;
      for (const section of sections) {
        if (section.element.getBoundingClientRect().top - HEADING_OFFSET > 2) break;
        index = section.index;
      }
      return index;
    };

    let lastIndex = -1;
    let animationFrame = 0;
    const update = () => {
      const index = findIndex();
      if (index === lastIndex) return;
      lastIndex = index;
      activateNavByIndex(index);
    };
    const scheduleUpdate = () => {
      if (animationFrame !== 0) return;
      animationFrame = requestAnimationFrame(() => {
        animationFrame = 0;
        update();
      });
    };

    update();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    onCleanup(() => {
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      if (animationFrame !== 0) cancelAnimationFrame(animationFrame);
    });
  });

  return (
    <div
      class="contents"
      ref={(element) => {
        containerElement = element;
      }}
    >
      {toc().length > 0 ? (
        <div class="toc-rail-wrap">
          <svg class="toc-rail" aria-hidden="true">
            <defs>
              <linearGradient
                id={gradientId}
                gradientUnits="userSpaceOnUse"
                x1="0"
                x2="0"
                y1={tocRailCenterY(railRows(), 0)}
                y2={tocRailCenterY(railRows(), activeIndex()) + 1}
              >
                <stop offset="0" class="toc-rail-stop-start" />
                <stop offset="1" class="toc-rail-stop-end" />
              </linearGradient>
            </defs>
            <path
              ref={(element) => {
                measurePathElement = element;
              }}
              fill="none"
            />
            <path class="toc-rail-track" d={railPath()} />
            <path
              class="toc-rail-progress"
              d={railPath()}
              stroke={`url(#${gradientId})`}
              style={{ "stroke-dasharray": progressDasharray() }}
            />
            {railRows().length > 0 && (
              <>
                <circle
                  class="toc-rail-hover"
                  classList={{
                    "toc-rail-hover-on": hoverIndex() !== null && hoverIndex() !== activeIndex(),
                  }}
                  r="3"
                  style={{ transform: railDotTransform(hoverIndex() ?? activeIndex()) }}
                />
                <circle
                  class="toc-rail-dot"
                  r="4"
                  style={{ transform: railDotTransform(activeIndex()) }}
                />
              </>
            )}
          </svg>
          <ol class="toc" ref={bindListElement}>
            <For each={toc()}>
              {(item, i) => (
                <li
                  class={getTocItemClass(i())}
                  style={`padding-left: ${(item.level - minLevel()) * TOC_INDENT_REM + TOC_RAIL_GAP_REM + 0.25}rem`}
                  onMouseEnter={() => setHoverIndex(i())}
                  onMouseLeave={() => setHoverIndex(null)}
                >
                  <a
                    href={`#${item.id}`}
                    class="toc-link"
                    onclick={(event) => handleTocClick(event, item.id, i())}
                  >
                    {item.text}
                  </a>
                  {item.children && item.children.length > 0 && (
                    <ol class="toc-child">
                      <For each={item.children}>
                        {(child) => (
                          <li class="toc-item">
                            <a href={`#${child.id}`} class="toc-link">
                              {child.text}
                            </a>
                          </li>
                        )}
                      </For>
                    </ol>
                  )}
                </li>
              )}
            </For>
          </ol>
        </div>
      ) : (
        <p class="no-toc">No contents available</p>
      )}
    </div>
  );
}

export default SidebarContents;
