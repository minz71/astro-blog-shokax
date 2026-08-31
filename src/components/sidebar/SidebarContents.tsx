import { createSignal, For, onCleanup, onMount } from "solid-js";

import type { TocItem } from "./SidebarTypes";

interface SidebarContentsProps {
  toc?: TocItem[];
  isActive?: boolean;
}

const HEADING_OFFSET = 100;

function SidebarContents(props: SidebarContentsProps) {
  const [activeIndex, setActiveIndex] = createSignal(0);
  const [currentItems, setCurrentItems] = createSignal<Set<number>>(new Set());
  let containerElement: HTMLDivElement | undefined;

  const toc = () => props.toc ?? [];

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
        <ol class="toc">
          <For each={toc()}>
            {(item, i) => (
              <li
                class={getTocItemClass(i())}
                style={`padding-left: ${(item.level - 1) * 0.75}rem`}
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
      ) : (
        <p class="no-toc">No contents available</p>
      )}
    </div>
  );
}

export default SidebarContents;
