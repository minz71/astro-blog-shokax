import { ShadowSlotElement } from "./web-components-base";
import { renderMermaidSvg, themeSignature } from "@/toolkit/mermaid/mermaidRuntime";
import {
  IDENTITY_VIEWPORT,
  isIdentity,
  panBy,
  toTransform,
  type Viewport,
  zoomAt,
  zoomByStep,
} from "@/toolkit/mermaid/panZoom";

export interface MermaidIcons {
  copy: string;
  copied: string;
  fullscreen: string;
  fullscreenExit: string;
  zoomIn: string;
  zoomOut: string;
  reset: string;
}

export interface MermaidLabels {
  label: string;
  loading: string;
  error: string;
  copy: string;
  copied: string;
  fullscreen: string;
  exitFullscreen: string;
  zoomIn: string;
  zoomOut: string;
  reset: string;
}

type Status = "loading" | "ready" | "error";

const EXIT_ANIMATION_MS = 300;
const COPIED_RESET_MS = 3000;
const WHEEL_ZOOM_STEP = 1.12;
const BUTTON_ZOOM_STEP = 1.25;

/**
 * <mermaid-diagram> —— 图表卡片（P3 迁移自 MermaidDiagram.svelte）
 *
 * 为什么是原生自定义元素而不是 Solid 组件：satteri 的 mermaid 插件把这个标签
 * 当作原始 HTML 产出（.md 走 rawHtml、.mdx 走 set:html），标签从不出现在 JSX 里，
 * 所以没有任何 Astro renderer 看得到它，client:* 指令也就无从附着。dev 上它是
 * `<svelte:options customElement>` 正是同一个原因；上游把 CodeBlock 与 ImageZoom
 * 迁到 *-element.ts 也是同一个判断。
 *
 * 图表源码由插件放在 light DOM 的 <pre class="mermaid-source"> 里，经 <slot> 分发。
 * 样式只作用于 shadow 内的 .source 容器（把它整个隐藏），不去选择被 slot 进来的
 * <pre> —— shadow 选择器够不到 slot 分发的内容，见 AGENTS.md 已知踩坑。
 */
class MermaidDiagramElement extends ShadowSlotElement {
  static icons: MermaidIcons | null = null;
  static labels: MermaidLabels | null = null;

  private card: HTMLElement | null = null;
  private viewportEl: HTMLElement | null = null;
  private stageEl: HTMLElement | null = null;
  private sourceEl: HTMLElement | null = null;
  private placeholderEl: HTMLElement | null = null;
  private errorEl: HTMLElement | null = null;
  private titleEl: HTMLElement | null = null;
  private buttons: Record<string, HTMLButtonElement | null> = {};

  private source = "";
  private status: Status = "loading";
  private errorMessage = "";
  private copied = false;
  private isFullscreen = false;
  private isExiting = false;
  private viewport: Viewport = IDENTITY_VIEWPORT;
  private isPanning = false;
  /** 记录当前已渲染的主题，避免重复渲染 */
  private renderedTheme = "";

  private copyTimer: ReturnType<typeof setTimeout> | undefined;
  private exitTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly activePointers = new Map<number, { x: number; y: number }>();
  private pinchDistance = 0;
  private keydownListener: ((event: KeyboardEvent) => void) | null = null;

  private get labels(): MermaidLabels {
    return (
      MermaidDiagramElement.labels ?? {
        label: "Diagram",
        loading: "Loading",
        error: "Render failed",
        copy: "Copy",
        copied: "Copied",
        fullscreen: "Fullscreen",
        exitFullscreen: "Exit fullscreen",
        zoomIn: "Zoom in",
        zoomOut: "Zoom out",
        reset: "Reset",
      }
    );
  }

  protected override renderShadowMarkup(): string {
    const t = this.labels;
    const title = this.dataset.title?.trim() || t.label;
    return `
      <div class="mermaid-card" part="card">
        <div class="header">
          <div class="controls">
            <div class="dot red"></div>
            <div class="dot yellow"></div>
            <div class="dot green"></div>
            <span class="title-text"></span>
          </div>
          <div class="actions">
            <button class="action-btn zoom-out-btn" data-act="zoomOut" aria-label="${escapeAttr(t.zoomOut)}" title="${escapeAttr(t.zoomOut)}" disabled></button>
            <button class="action-btn zoom-in-btn" data-act="zoomIn" aria-label="${escapeAttr(t.zoomIn)}" title="${escapeAttr(t.zoomIn)}" disabled></button>
            <button class="action-btn reset-btn" data-act="reset" aria-label="${escapeAttr(t.reset)}" title="${escapeAttr(t.reset)}" disabled></button>
            <span class="divider"></span>
            <button class="action-btn copy-btn" data-act="copy" data-copied="false" aria-label="${escapeAttr(t.copy)}" title="${escapeAttr(t.copy)}"></button>
            <button class="action-btn fullscreen-btn" data-act="fullscreen" data-on="false" aria-label="${escapeAttr(t.fullscreen)}" title="${escapeAttr(t.fullscreen)}"></button>
          </div>
        </div>

        <div class="viewport">
          <div class="placeholder"><span class="spinner"></span><span>${escapeHtml(t.loading)}</span></div>
          <div class="error" hidden>
            <p class="error-title">${escapeHtml(t.error)}</p>
            <p class="error-message"></p>
            <pre class="error-source"></pre>
          </div>
          <div class="stage" role="img" aria-label="${escapeAttr(title)}" hidden></div>
        </div>

        <div class="source" aria-hidden="true"><slot></slot></div>
      </div>
    `;
  }

  protected override shadowStyleCss(): string {
    const icons = MermaidDiagramElement.icons;
    if (!icons) return MERMAID_CSS;
    return MERMAID_CSS.replaceAll("__ICON_COPY__", icons.copy)
      .replaceAll("__ICON_COPIED__", icons.copied)
      .replaceAll("__ICON_FULLSCREEN__", icons.fullscreen)
      .replaceAll("__ICON_FULLSCREEN_EXIT__", icons.fullscreenExit)
      .replaceAll("__ICON_ZOOM_IN__", icons.zoomIn)
      .replaceAll("__ICON_ZOOM_OUT__", icons.zoomOut)
      .replaceAll("__ICON_RESET__", icons.reset);
  }

  // mermaid 的配色是渲染时烘进 SVG 的，所以深浅色切换后必须按新主题重绘
  protected override themeTracked(): boolean {
    return true;
  }

  protected override bindDom(): void {
    const shadow = this.shadowRoot;
    if (!shadow) return;

    this.card = shadow.querySelector(".mermaid-card");
    this.viewportEl = shadow.querySelector(".viewport");
    this.stageEl = shadow.querySelector(".stage");
    this.sourceEl = shadow.querySelector(".source");
    this.placeholderEl = shadow.querySelector(".placeholder");
    this.errorEl = shadow.querySelector(".error");
    this.titleEl = shadow.querySelector(".title-text");

    for (const btn of shadow.querySelectorAll<HTMLButtonElement>("button[data-act]")) {
      this.buttons[btn.dataset.act ?? ""] = btn;
    }

    if (this.titleEl) {
      this.titleEl.textContent = this.dataset.title?.trim() || this.labels.label;
    }

    this.buttons.zoomOut?.addEventListener("click", () => this.stepZoom(1 / BUTTON_ZOOM_STEP));
    this.buttons.zoomIn?.addEventListener("click", () => this.stepZoom(BUTTON_ZOOM_STEP));
    this.buttons.reset?.addEventListener("click", () => this.resetViewport());
    this.buttons.copy?.addEventListener("click", () => void this.copySource());
    this.buttons.fullscreen?.addEventListener("click", () => this.toggleFullscreen());

    const vp = this.viewportEl;
    if (vp) {
      vp.addEventListener("wheel", (e) => this.handleWheel(e), { passive: false });
      vp.addEventListener("pointerdown", (e) => this.handlePointerDown(e));
      vp.addEventListener("pointermove", (e) => this.handlePointerMove(e));
      vp.addEventListener("pointerup", (e) => this.endPointer(e));
      vp.addEventListener("pointercancel", (e) => this.endPointer(e));
      vp.addEventListener("pointerleave", (e) => this.endPointer(e));
    }

    this.keydownListener = (event: KeyboardEvent) => {
      if (event.key === "Escape" && this.isFullscreen && !this.isExiting) {
        this.toggleFullscreen();
      }
    };
    window.addEventListener("keydown", this.keydownListener);

    this.readSourceAndRender();
  }

  protected override onSlotChange(): void {
    this.readSourceAndRender();
  }

  protected override onThemeChange(): void {
    if (!this.source || themeSignature() === this.renderedTheme) return;
    void this.renderDiagram();
  }

  protected override onDetach(): void {
    clearTimeout(this.copyTimer);
    clearTimeout(this.exitTimer);
    if (this.keydownListener) {
      window.removeEventListener("keydown", this.keydownListener);
      this.keydownListener = null;
    }
    if (this.isFullscreen) {
      document.body.style.overflow = "";
    }
  }

  /** 从 slot 里取出插件生成的 <pre class="mermaid-source"> */
  private readSource(): string {
    const slot = this.sourceEl?.querySelector("slot");
    if (!(slot instanceof HTMLSlotElement)) return "";
    const assigned = slot.assignedElements({ flatten: true });
    const pre = assigned.find((el) => el.matches("pre.mermaid-source"));
    return pre?.textContent ?? "";
  }

  private readSourceAndRender(): void {
    const next = this.readSource().trim();
    if (!next) {
      if (!this.source) {
        this.status = "error";
        this.errorMessage = "Empty mermaid source";
        this.applyState();
      }
      return;
    }
    if (next === this.source && this.status === "ready") return;
    this.source = next;
    void this.renderDiagram();
  }

  private async renderDiagram(): Promise<void> {
    if (!this.source) return;
    const theme = themeSignature();
    if (!this.stageEl?.innerHTML) {
      this.status = "loading";
      this.applyState();
    }

    try {
      const svg = await renderMermaidSvg(this.source);
      if (this.stageEl) this.stageEl.innerHTML = svg;
      this.errorMessage = "";
      this.status = "ready";
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
      this.status = "error";
    }
    this.renderedTheme = theme;
    this.applyState();
  }

  private async copySource(): Promise<void> {
    if (!this.source) return;
    try {
      await navigator.clipboard.writeText(this.source);
      this.copied = true;
      clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => {
        this.copied = false;
        this.applyState();
      }, COPIED_RESET_MS);
      this.applyState();
    } catch (error) {
      console.error("Failed to copy mermaid source:", error);
    }
  }

  private resetViewport(): void {
    this.viewport = IDENTITY_VIEWPORT;
    this.applyViewport();
  }

  private stepZoom(factor: number): void {
    const rect = this.viewportEl?.getBoundingClientRect();
    this.viewport = zoomByStep(this.viewport, factor, rect?.width ?? 0, rect?.height ?? 0);
    this.applyViewport();
  }

  private toggleFullscreen(): void {
    if (this.isFullscreen) {
      this.isExiting = true;
      clearTimeout(this.exitTimer);
      this.exitTimer = setTimeout(() => {
        this.isFullscreen = false;
        this.isExiting = false;
        document.body.style.overflow = "";
        this.applyState();
      }, EXIT_ANIMATION_MS);
    } else {
      this.isFullscreen = true;
      document.body.style.overflow = "hidden";
    }
    this.resetViewport();
    this.applyState();
  }

  private handleWheel(event: WheelEvent): void {
    // 内联状态下不劫持页面滚动，需按住 Ctrl/⌘ 才缩放；全屏时滚轮直接缩放
    if (!this.isFullscreen && !event.ctrlKey && !event.metaKey) return;
    event.preventDefault();

    const rect = this.viewportEl?.getBoundingClientRect();
    if (!rect) return;
    const factor = event.deltaY < 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP;
    this.viewport = zoomAt(
      this.viewport,
      factor,
      event.clientX - rect.left,
      event.clientY - rect.top,
    );
    this.applyViewport();
  }

  private pointerDistance(): number {
    const [first, second] = [...this.activePointers.values()];
    if (!first || !second) return 0;
    return Math.hypot(first.x - second.x, first.y - second.y);
  }

  private handlePointerDown(event: PointerEvent): void {
    if (this.status !== "ready") return;
    this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.activePointers.size === 2) {
      this.pinchDistance = this.pointerDistance();
      this.isPanning = false;
      this.applyViewport();
      return;
    }
    if (this.activePointers.size === 1) {
      this.isPanning = true;
      this.viewportEl?.setPointerCapture(event.pointerId);
      this.applyViewport();
    }
  }

  private handlePointerMove(event: PointerEvent): void {
    const previous = this.activePointers.get(event.pointerId);
    if (!previous) return;
    this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.activePointers.size >= 2) {
      const distance = this.pointerDistance();
      if (this.pinchDistance > 0 && distance > 0) {
        const rect = this.viewportEl?.getBoundingClientRect();
        const [first, second] = [...this.activePointers.values()];
        if (rect && first && second) {
          this.viewport = zoomAt(
            this.viewport,
            distance / this.pinchDistance,
            (first.x + second.x) / 2 - rect.left,
            (first.y + second.y) / 2 - rect.top,
          );
          this.applyViewport();
        }
      }
      this.pinchDistance = distance;
      event.preventDefault();
      return;
    }

    if (!this.isPanning) return;
    event.preventDefault();
    this.viewport = panBy(
      this.viewport,
      event.clientX - previous.x,
      event.clientY - previous.y,
    );
    this.applyViewport();
  }

  private endPointer(event: PointerEvent): void {
    this.activePointers.delete(event.pointerId);
    if (this.activePointers.size < 2) this.pinchDistance = 0;
    if (this.activePointers.size === 0) {
      this.isPanning = false;
      if (this.viewportEl?.hasPointerCapture(event.pointerId)) {
        this.viewportEl.releasePointerCapture(event.pointerId);
      }
      this.applyViewport();
    }
  }

  private applyViewport(): void {
    if (this.stageEl) this.stageEl.style.transform = toTransform(this.viewport);
    this.viewportEl?.classList.toggle("panning", this.isPanning);
    const reset = this.buttons.reset;
    if (reset) reset.disabled = this.status !== "ready" || isIdentity(this.viewport);
  }

  /** 单一出口：状态 -> DOM。避免每个 handler 各自散着改 class 与 hidden */
  private applyState(): void {
    const t = this.labels;

    this.placeholderEl?.toggleAttribute("hidden", this.status !== "loading");
    this.errorEl?.toggleAttribute("hidden", this.status !== "error");
    this.stageEl?.toggleAttribute("hidden", this.status !== "ready");

    if (this.status === "error" && this.errorEl) {
      const msg = this.errorEl.querySelector(".error-message");
      const src = this.errorEl.querySelector(".error-source");
      if (msg) msg.textContent = this.errorMessage;
      if (src) src.textContent = this.source;
    }

    this.viewportEl?.classList.toggle("interactive", this.status === "ready");

    for (const act of ["zoomOut", "zoomIn"]) {
      const btn = this.buttons[act];
      if (btn) btn.disabled = this.status !== "ready";
    }

    const copy = this.buttons.copy;
    if (copy) {
      copy.dataset.copied = String(this.copied);
      const label = this.copied ? t.copied : t.copy;
      copy.setAttribute("aria-label", label);
      copy.title = label;
    }

    const full = this.buttons.fullscreen;
    if (full) {
      full.dataset.on = String(this.isFullscreen);
      const label = this.isFullscreen ? t.exitFullscreen : t.fullscreen;
      full.setAttribute("aria-label", label);
      full.title = label;
    }

    this.card?.classList.toggle("fullscreen", this.isFullscreen);
    this.card?.classList.toggle("exiting", this.isExiting);

    this.applyViewport();
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replaceAll('"', "&quot;");
}

export function registerMermaidDiagram(icons: MermaidIcons, labels: MermaidLabels) {
  MermaidDiagramElement.icons = icons;
  MermaidDiagramElement.labels = labels;
  if (typeof customElements !== "undefined" && !customElements.get("mermaid-diagram")) {
    customElements.define("mermaid-diagram", MermaidDiagramElement);
  }
}

const MERMAID_CSS = `
  .mermaid-card {
    margin: 1.5rem 0;
    border: 1px solid var(--mermaid-card-border);
    border-radius: 0.5rem;
    overflow: hidden;
    box-shadow: var(--mermaid-card-shadow);
    background-color: var(--mermaid-card-bg);
  }
  .header {
    display: flex; justify-content: space-between; align-items: center; gap: 1rem;
    padding: 0.5rem 1rem; background-color: var(--mermaid-card-header-bg); min-height: 1.5rem;
  }
  .controls { display: flex; align-items: center; gap: 0.6rem; margin-left: 0.8125rem; min-width: 0; }
  .dot { width: 0.9375rem; height: 0.9375rem; border-radius: 50%; flex-shrink: 0; }
  .red { background: var(--codeblock-dot-red); }
  .yellow { background: var(--codeblock-dot-yellow); }
  .green { background: var(--codeblock-dot-green); }
  .title-text {
    margin-left: 0.75rem; font-size: 0.95rem; color: var(--text-color-muted);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .actions { display: flex; align-items: center; gap: 0.75rem; padding-right: 0.5rem; }
  .divider { width: 1px; height: 1rem; background-color: var(--border-color-muted); opacity: 0.6; }
  .action-btn {
    border: none; padding: 0; cursor: pointer;
    background-color: var(--codeblock-action-color);
    width: 1.1rem; height: 1.1rem;
    mask-size: contain; mask-repeat: no-repeat; mask-position: center;
    -webkit-mask-size: contain; -webkit-mask-repeat: no-repeat; -webkit-mask-position: center;
    transition: background-color 0.2s;
  }
  .action-btn:hover:not(:disabled) { background-color: var(--codeblock-action-hover-color); }
  .action-btn:disabled { opacity: 0.35; cursor: default; }
  .zoom-out-btn { mask-image: url(__ICON_ZOOM_OUT__); -webkit-mask-image: url(__ICON_ZOOM_OUT__); }
  .zoom-in-btn { mask-image: url(__ICON_ZOOM_IN__); -webkit-mask-image: url(__ICON_ZOOM_IN__); }
  .reset-btn { mask-image: url(__ICON_RESET__); -webkit-mask-image: url(__ICON_RESET__); }
  .copy-btn { mask-image: url(__ICON_COPY__); -webkit-mask-image: url(__ICON_COPY__); }
  .copy-btn[data-copied="true"] { mask-image: url(__ICON_COPIED__); -webkit-mask-image: url(__ICON_COPIED__); }
  .fullscreen-btn { mask-image: url(__ICON_FULLSCREEN__); -webkit-mask-image: url(__ICON_FULLSCREEN__); }
  .fullscreen-btn[data-on="true"] { mask-image: url(__ICON_FULLSCREEN_EXIT__); -webkit-mask-image: url(__ICON_FULLSCREEN_EXIT__); }
  .viewport {
    position: relative; overflow: hidden; padding: 1.25rem 1rem;
    min-height: 6rem; touch-action: pan-y;
  }
  .viewport.interactive { cursor: grab; }
  .viewport.panning { cursor: grabbing; user-select: none; }
  .stage { transform-origin: 0 0; transition: transform 0.12s ease-out; will-change: transform; }
  .panning .stage { transition: none; }
  .stage svg { display: block; max-width: 100%; height: auto; margin: 0 auto; }
  .placeholder {
    display: flex; align-items: center; justify-content: center; gap: 0.6rem;
    min-height: 5rem; color: var(--text-color-muted); font-size: 0.9rem;
  }
  .placeholder[hidden], .error[hidden], .stage[hidden] { display: none; }
  .spinner {
    width: 1rem; height: 1rem; border: 2px solid var(--border-color-muted);
    border-top-color: var(--primary-color); border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) {
    .spinner { animation: none; }
    .stage { transition: none; }
  }
  .error { color: var(--text-color); font-size: 0.9rem; }
  .error-title { margin: 0 0 0.35rem; color: var(--color-red); font-weight: 600; }
  .error-message { margin: 0 0 0.75rem; color: var(--text-color-muted); white-space: pre-wrap; }
  .error-source {
    margin: 0; padding: 0.75rem; border-radius: 0.375rem;
    background-color: var(--surface-code-header); color: var(--text-color-muted);
    font-family: var(--shokax-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, "Courier New", monospace);
    font-size: 0.85rem; overflow-x: auto;
  }
  /* 只隐藏 shadow 内的容器；slot 分发进来的 <pre> 选择器够不到 */
  .source { display: none; }
  .fullscreen {
    position: fixed; inset: 0; width: 100vw; height: 100vh; margin: 0;
    border: none; border-radius: 0; z-index: var(--z-fullscreen);
    display: flex; flex-direction: column;
    background-color: var(--codeblock-overlay-bg); backdrop-filter: blur(8px);
    padding: 2rem; box-sizing: border-box; animation: fullscreenIn 0.3s ease-out;
  }
  .fullscreen .header { border-radius: 0.5rem 0.5rem 0 0; }
  .fullscreen .viewport {
    flex: 1; background-color: var(--mermaid-card-bg);
    border-radius: 0 0 0.5rem 0.5rem; touch-action: none;
  }
  .fullscreen .stage svg { max-width: none; }
  @keyframes fullscreenIn {
    from { opacity: 0; transform: scale(0.95); }
    to { opacity: 1; transform: scale(1); }
  }
  .exiting { animation: fullscreenOut 0.3s ease-in forwards; }
  @keyframes fullscreenOut {
    from { opacity: 1; transform: scale(1); }
    to { opacity: 0; transform: scale(0.95); }
  }
`;
