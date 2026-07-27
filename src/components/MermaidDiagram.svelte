<svelte:options customElement="mermaid-diagram" />

<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import CheckFill from "@/assets/icons/check-fill.svg";
  import FileCopyFill from "@/assets/icons/file-copy-fill.svg";
  import FullscreenLine from "@/assets/icons/fullscreen-line.svg";
  import FullscreenExitLine from "@/assets/icons/fullscreen-exit-line.svg";
  import ZoomInLine from "@/assets/icons/zoom-in-line.svg";
  import ZoomOutLine from "@/assets/icons/zoom-out-line.svg";
  import Focus3Line from "@/assets/icons/focus-3-line.svg";
  import { currentLocale, getT } from "@/i18n";
  import { renderMermaidSvg, themeSignature } from "@/toolkit/mermaid/mermaidRuntime";
  import {
    IDENTITY_VIEWPORT,
    isIdentity,
    panBy,
    toTransform,
    zoomAt,
    zoomByStep,
    type Viewport,
  } from "@/toolkit/mermaid/panZoom";

  const t = getT(currentLocale);

  let cardElement = $state<HTMLElement | null>(null);
  let sourceSlot = $state<HTMLElement | null>(null);
  let viewportElement = $state<HTMLElement | null>(null);

  let title = $state("");
  let source = $state("");
  let svg = $state("");
  let errorMessage = $state("");
  let status = $state<"loading" | "ready" | "error">("loading");

  let copied = $state(false);
  let isFullscreen = $state(false);
  let isExiting = $state(false);
  let viewport = $state<Viewport>(IDENTITY_VIEWPORT);
  let isPanning = $state(false);

  let copyTimer: ReturnType<typeof setTimeout> | undefined;
  let exitTimer: ReturnType<typeof setTimeout> | undefined;
  /** 记录当前已渲染的主题，避免重复渲染 */
  let renderedTheme = "";
  const activePointers = new Map<number, { x: number; y: number }>();
  let pinchDistance = 0;

  /** 自定义元素的宿主节点（属性与源码都挂在 light DOM 上） */
  function getHost(): HTMLElement | null {
    const root = cardElement?.getRootNode();
    return root instanceof ShadowRoot ? (root.host as HTMLElement) : cardElement;
  }

  /** 从 slot 里取出插件生成的 <pre class="mermaid-source"> */
  function readSource(): string {
    const slot = sourceSlot?.querySelector("slot") as HTMLSlotElement | null;
    const assigned = slot?.assignedElements({ flatten: true }) ?? [];
    const pre = assigned.find((element) => element.matches("pre.mermaid-source"));
    return pre?.textContent ?? "";
  }

  async function renderDiagram() {
    if (!source) return;
    const theme = themeSignature();
    status = svg ? status : "loading";

    try {
      const rendered = await renderMermaidSvg(source);
      svg = rendered;
      errorMessage = "";
      status = "ready";
      renderedTheme = theme;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
      status = "error";
      renderedTheme = theme;
    }
  }

  async function copySource() {
    if (!source) return;
    try {
      await navigator.clipboard.writeText(source);
      copied = true;
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => {
        copied = false;
      }, 3000);
    } catch (error) {
      console.error("Failed to copy mermaid source:", error);
    }
  }

  function resetViewport() {
    viewport = IDENTITY_VIEWPORT;
  }

  function stepZoom(factor: number) {
    const rect = viewportElement?.getBoundingClientRect();
    viewport = zoomByStep(viewport, factor, rect?.width ?? 0, rect?.height ?? 0);
  }

  function toggleFullscreen() {
    if (isFullscreen) {
      isExiting = true;
      clearTimeout(exitTimer);
      exitTimer = setTimeout(() => {
        isFullscreen = false;
        isExiting = false;
        document.body.style.overflow = "";
      }, 300);
    } else {
      isFullscreen = true;
      document.body.style.overflow = "hidden";
    }
    resetViewport();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && isFullscreen && !isExiting) {
      toggleFullscreen();
    }
  }

  function handleWheel(event: WheelEvent) {
    // 内联状态下不劫持页面滚动，需按住 Ctrl/⌘ 才缩放；全屏时滚轮直接缩放
    if (!isFullscreen && !event.ctrlKey && !event.metaKey) return;
    event.preventDefault();

    const rect = viewportElement?.getBoundingClientRect();
    if (!rect) return;
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    viewport = zoomAt(viewport, factor, event.clientX - rect.left, event.clientY - rect.top);
  }

  function pointerDistance(): number {
    const [first, second] = [...activePointers.values()];
    if (!first || !second) return 0;
    return Math.hypot(first.x - second.x, first.y - second.y);
  }

  function handlePointerDown(event: PointerEvent) {
    if (status !== "ready") return;
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (activePointers.size === 2) {
      pinchDistance = pointerDistance();
      isPanning = false;
      return;
    }
    if (activePointers.size === 1) {
      isPanning = true;
      viewportElement?.setPointerCapture(event.pointerId);
    }
  }

  function handlePointerMove(event: PointerEvent) {
    const previous = activePointers.get(event.pointerId);
    if (!previous) return;
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (activePointers.size >= 2) {
      const distance = pointerDistance();
      if (pinchDistance > 0 && distance > 0) {
        const rect = viewportElement?.getBoundingClientRect();
        const [first, second] = [...activePointers.values()];
        if (rect && first && second) {
          viewport = zoomAt(
            viewport,
            distance / pinchDistance,
            (first.x + second.x) / 2 - rect.left,
            (first.y + second.y) / 2 - rect.top,
          );
        }
      }
      pinchDistance = distance;
      event.preventDefault();
      return;
    }

    if (!isPanning) return;
    event.preventDefault();
    viewport = panBy(viewport, event.clientX - previous.x, event.clientY - previous.y);
  }

  function endPointer(event: PointerEvent) {
    activePointers.delete(event.pointerId);
    if (activePointers.size < 2) pinchDistance = 0;
    if (activePointers.size === 0) {
      isPanning = false;
      if (viewportElement?.hasPointerCapture(event.pointerId)) {
        viewportElement.releasePointerCapture(event.pointerId);
      }
    }
  }

  onMount(() => {
    const host = getHost();
    title = host?.dataset.title?.trim() || t("mermaid.label");
    source = readSource().trim();

    if (!source) {
      status = "error";
      errorMessage = "Empty mermaid source";
      return;
    }

    void renderDiagram();
    window.addEventListener("keydown", handleKeydown);
  });

  onDestroy(() => {
    clearTimeout(copyTimer);
    clearTimeout(exitTimer);
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", handleKeydown);
    }
    if (typeof document !== "undefined" && isFullscreen) {
      document.body.style.overflow = "";
    }
  });

  // 深浅色切换后按新主题重绘（mermaid 的配色是渲染时烘进 SVG 的）
  $effect(() => {
    const observer = new MutationObserver(() => {
      if (!source || themeSignature() === renderedTheme) return;
      void renderDiagram();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  });
</script>

<div
  bind:this={cardElement}
  class="mermaid-card"
  class:fullscreen={isFullscreen}
  class:exiting={isExiting}
>
  <div class="header">
    <div class="controls">
      <div class="dot red"></div>
      <div class="dot yellow"></div>
      <div class="dot green"></div>
      <span class="title-text">{title}</span>
    </div>
    <div class="actions">
      <button
        class="action-btn"
        style="mask-image: url({ZoomOutLine.src}); -webkit-mask-image: url({ZoomOutLine.src});"
        onclick={() => stepZoom(1 / 1.25)}
        disabled={status !== "ready"}
        aria-label={t("mermaid.zoomOut")}
        title={t("mermaid.zoomOut")}
      ></button>
      <button
        class="action-btn"
        style="mask-image: url({ZoomInLine.src}); -webkit-mask-image: url({ZoomInLine.src});"
        onclick={() => stepZoom(1.25)}
        disabled={status !== "ready"}
        aria-label={t("mermaid.zoomIn")}
        title={t("mermaid.zoomIn")}
      ></button>
      <button
        class="action-btn"
        style="mask-image: url({Focus3Line.src}); -webkit-mask-image: url({Focus3Line.src});"
        onclick={resetViewport}
        disabled={status !== "ready" || isIdentity(viewport)}
        aria-label={t("mermaid.reset")}
        title={t("mermaid.reset")}
      ></button>
      <span class="divider"></span>
      <button
        class="action-btn"
        style="mask-image: url({copied ? CheckFill.src : FileCopyFill.src}); -webkit-mask-image: url({copied
          ? CheckFill.src
          : FileCopyFill.src});"
        onclick={copySource}
        aria-label={copied ? t("mermaid.copied") : t("mermaid.copy")}
        title={copied ? t("mermaid.copied") : t("mermaid.copy")}
      ></button>
      <button
        class="action-btn"
        style="mask-image: url({isFullscreen
          ? FullscreenExitLine.src
          : FullscreenLine.src}); -webkit-mask-image: url({isFullscreen
          ? FullscreenExitLine.src
          : FullscreenLine.src});"
        onclick={toggleFullscreen}
        aria-label={isFullscreen ? t("mermaid.exitFullscreen") : t("mermaid.fullscreen")}
        title={isFullscreen ? t("mermaid.exitFullscreen") : t("mermaid.fullscreen")}
      ></button>
    </div>
  </div>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    bind:this={viewportElement}
    class="viewport"
    class:panning={isPanning}
    class:interactive={status === "ready"}
    onwheel={handleWheel}
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onpointerup={endPointer}
    onpointercancel={endPointer}
    onpointerleave={endPointer}
  >
    {#if status === "loading"}
      <div class="placeholder">
        <span class="spinner"></span>
        <span>{t("mermaid.loading")}</span>
      </div>
    {:else if status === "error"}
      <div class="error">
        <p class="error-title">{t("mermaid.error")}</p>
        <p class="error-message">{errorMessage}</p>
        <pre class="error-source">{source}</pre>
      </div>
    {:else}
      <div
        class="stage"
        role="img"
        aria-label={title}
        style="transform: {toTransform(viewport)};"
      >
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        {@html svg}
      </div>
    {/if}
  </div>

  <div bind:this={sourceSlot} class="source" aria-hidden="true">
    <slot />
  </div>
</div>

<style>
  .mermaid-card {
    margin: 1.5rem 0;
    border: 1px solid var(--mermaid-card-border);
    border-radius: 0.5rem;
    overflow: hidden;
    box-shadow: var(--mermaid-card-shadow);
    background-color: var(--mermaid-card-bg);
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    padding: 0.5rem 1rem;
    background-color: var(--mermaid-card-header-bg);
    min-height: 1.5rem;
  }

  .controls {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin-left: 0.8125rem;
    min-width: 0;
  }

  .dot {
    width: 0.9375rem;
    height: 0.9375rem;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .red {
    background: var(--codeblock-dot-red);
  }
  .yellow {
    background: var(--codeblock-dot-yellow);
  }
  .green {
    background: var(--codeblock-dot-green);
  }

  .title-text {
    margin-left: 0.75rem;
    font-size: 0.95rem;
    color: var(--text-color-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding-right: 0.5rem;
  }

  .divider {
    width: 1px;
    height: 1rem;
    background-color: var(--border-color-muted);
    opacity: 0.6;
  }

  .action-btn {
    border: none;
    padding: 0;
    cursor: pointer;
    background-color: var(--codeblock-action-color);
    width: 1.1rem;
    height: 1.1rem;
    mask-size: contain;
    mask-repeat: no-repeat;
    mask-position: center;
    -webkit-mask-size: contain;
    -webkit-mask-repeat: no-repeat;
    -webkit-mask-position: center;
    transition: background-color 0.2s;
  }

  .action-btn:hover:not(:disabled) {
    background-color: var(--codeblock-action-hover-color);
  }

  .action-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .viewport {
    position: relative;
    overflow: hidden;
    padding: 1.25rem 1rem;
    min-height: 6rem;
    touch-action: pan-y;
  }

  .viewport.interactive {
    cursor: grab;
  }

  .viewport.panning {
    cursor: grabbing;
    user-select: none;
  }

  .stage {
    transform-origin: 0 0;
    transition: transform 0.12s ease-out;
    will-change: transform;
  }

  .panning .stage {
    transition: none;
  }

  .stage :global(svg) {
    display: block;
    max-width: 100%;
    height: auto;
    margin: 0 auto;
  }

  .placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    min-height: 5rem;
    color: var(--text-color-muted);
    font-size: 0.9rem;
  }

  .spinner {
    width: 1rem;
    height: 1rem;
    border: 2px solid var(--border-color-muted);
    border-top-color: var(--primary-color);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .spinner {
      animation: none;
    }
    .stage {
      transition: none;
    }
  }

  .error {
    color: var(--text-color);
    font-size: 0.9rem;
  }

  .error-title {
    margin: 0 0 0.35rem;
    color: var(--color-red);
    font-weight: 600;
  }

  .error-message {
    margin: 0 0 0.75rem;
    color: var(--text-color-muted);
    white-space: pre-wrap;
  }

  .error-source {
    margin: 0;
    padding: 0.75rem;
    border-radius: 0.375rem;
    background-color: var(--surface-code-header);
    color: var(--text-color-muted);
    font-family: "Maple Mono", "Courier New", monospace;
    font-size: 0.85rem;
    overflow-x: auto;
  }

  .source {
    display: none;
  }

  /* 全屏 */
  .fullscreen {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    margin: 0;
    border: none;
    border-radius: 0;
    z-index: var(--z-fullscreen);
    display: flex;
    flex-direction: column;
    background-color: var(--codeblock-overlay-bg);
    backdrop-filter: blur(8px);
    padding: 2rem;
    box-sizing: border-box;
    animation: fullscreenIn 0.3s ease-out;
  }

  .fullscreen .header {
    border-radius: 0.5rem 0.5rem 0 0;
  }

  .fullscreen .viewport {
    flex: 1;
    background-color: var(--mermaid-card-bg);
    border-radius: 0 0 0.5rem 0.5rem;
    touch-action: none;
  }

  .fullscreen .stage :global(svg) {
    max-width: none;
  }

  @keyframes fullscreenIn {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .exiting {
    animation: fullscreenOut 0.3s ease-in forwards;
  }

  @keyframes fullscreenOut {
    from {
      opacity: 1;
      transform: scale(1);
    }
    to {
      opacity: 0;
      transform: scale(0.95);
    }
  }
</style>
