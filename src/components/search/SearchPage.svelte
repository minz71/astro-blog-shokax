<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { currentLocale, getT } from "@/i18n";
  import { lockBodyScroll } from "@/toolkit/ui/scrollLock";
  import { buildPaginationItems } from "@/toolkit/posts/buildPaginationItems";

  const isDev = import.meta.env.DEV;
  const searchPanelTransitionMs = 350;
  /** 与旧版 ShokaX `search.hits.per_page` 默认值一致 */
  const hitsPerPage = 10;
  const searchDebounceMs = 200;

  interface Props {
    selector?: string | HTMLElement;
    showSearch?: boolean;
  }

  let { selector, showSearch = $bindable(false) }: Props = $props();
  const t = getT(currentLocale);

  let internalVisible = $state(false);
  let rendered = $state(false);
  let animatedVisible = $state(false);
  let cleanupListener: (() => void) | null = null;
  let cleanupKeyboard: (() => void) | null = null;
  let hideTimeoutId: number | null = null;
  let inputElement: HTMLInputElement | null = null;
  const visible = $derived(selector ? internalVisible : Boolean(showSearch));

  // Pagefind 原生 JS API：旧版的命中列表 / 统计 / 分页都需要自己掌控渲染，
  // 组件化 UI（@pagefind/component-ui）无法提供这些结构，因此直接用底层接口。
  interface PagefindFragment {
    url: string;
    meta?: Record<string, string | undefined>;
    /** 命中上下文，形如 `文字 <mark>命中</mark> 文字`，其余字符已被 Pagefind 转义 */
    excerpt?: string;
  }

  interface PagefindRawResult {
    id: string;
    data: () => Promise<PagefindFragment>;
  }

  interface PagefindResponse {
    results: PagefindRawResult[];
    timings?: { preload: number; search: number; total: number };
  }

  interface PagefindModule {
    options: (options: Record<string, unknown>) => Promise<void>;
    init: () => Promise<void>;
    debouncedSearch: (
      term: string,
      options?: unknown,
      debounceTimeoutMs?: number,
    ) => Promise<PagefindResponse | null>;
  }

  interface HighlightSegment {
    text: string;
    marked: boolean;
  }

  interface SearchHit {
    url: string;
    title: string;
    excerpt: HighlightSegment[];
  }

  let query = $state("");
  let rawResults = $state<PagefindRawResult[]>([]);
  let pageHits = $state<SearchHit[]>([]);
  let currentPage = $state(1);
  let statsTime = $state(0);
  let hasSearched = $state(false);
  let loading = $state(false);
  let loadFailed = $state(false);
  /** 输入与翻页共用的请求序号，用于丢弃过期的 `data()` 结果 */
  let requestToken = 0;

  let pagefindModule: PagefindModule | null = null;
  let pagefindLoader: Promise<PagefindModule | null> | null = null;

  const lastPage = $derived(Math.max(1, Math.ceil(rawResults.length / hitsPerPage)));
  const paginationItems = $derived(buildPaginationItems(currentPage, lastPage));
  const submittedQuery = $derived(query.trim());

  async function loadPagefind(): Promise<PagefindModule | null> {
    if (isDev) return null;
    if (pagefindModule) return pagefindModule;

    pagefindLoader ??= (async () => {
      try {
        // 经变量拼接绕开 Vite 的静态依赖分析：/pagefind/ 由 pagefind CLI 在
        // astro build 之后才生成，构建期解析这个路径必然失败。
        const basePath = "/pagefind/";
        const loaded: PagefindModule = await import(
          /* @vite-ignore */ `${basePath}pagefind.js`
        );

        await loaded.options({ basePath });
        await loaded.init();

        pagefindModule = loaded;
        return loaded;
      } catch (error) {
        console.warn("Pagefind 初始化失败：", error);
        loadFailed = true;
        return null;
      }
    })();

    return pagefindLoader;
  }

  function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * 旧版由 Algolia 的 `_highlightResult` 提供标题高亮，Pagefind 的片段只给出纯标题，
   * 因此这里自行切分。返回段落数组而非 HTML 字符串，交给 Svelte 模板渲染 `<mark>`，
   * 避免 `{@html}` 带来的转义风险。
   */
  function buildTitleSegments(title: string, term: string): HighlightSegment[] {
    const words = term
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => escapeRegExp(word));

    if (words.length === 0) return [{ text: title, marked: false }];

    const alternation = words.join("|");
    const splitter = new RegExp(`(${alternation})`, "gi");
    const matcher = new RegExp(`^(?:${alternation})$`, "i");

    return title
      .split(splitter)
      .filter((part) => part !== "")
      .map((part) => ({ text: part, marked: matcher.test(part) }));
  }

  const NAMED_ENTITIES: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };

  /** 单次扫描解码，避免先换 `&lt;` 再换 `&amp;` 造成的二次解码 */
  function decodeEntities(value: string) {
    return value.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, body: string) => {
      if (body.startsWith("#")) {
        const isHex = body[1] === "x" || body[1] === "X";
        const code = Number.parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10);
        return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : match;
      }

      return NAMED_ENTITIES[body.toLowerCase()] ?? match;
    });
  }

  /**
   * Pagefind 的 excerpt 是 HTML 片段：正文里的 `< > &` 已转义，只有命中词被真正的
   * `<mark>` 包住。这里把它拆成段落交给模板渲染，同样不走 `{@html}`。
   */
  function buildExcerptSegments(excerpt: string): HighlightSegment[] {
    const segments: HighlightSegment[] = [];
    const pattern = /<mark>([\s\S]*?)<\/mark>/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null = pattern.exec(excerpt);

    while (match !== null) {
      if (match.index > lastIndex) {
        segments.push({
          text: decodeEntities(excerpt.slice(lastIndex, match.index)),
          marked: false,
        });
      }

      segments.push({ text: decodeEntities(match[1]), marked: true });
      lastIndex = pattern.lastIndex;
      match = pattern.exec(excerpt);
    }

    if (lastIndex < excerpt.length) {
      segments.push({ text: decodeEntities(excerpt.slice(lastIndex)), marked: false });
    }

    return segments;
  }

  function resetResults() {
    rawResults = [];
    pageHits = [];
    currentPage = 1;
    statsTime = 0;
    hasSearched = false;
    loading = false;
  }

  async function loadPageHits(page: number, token: number) {
    const start = (page - 1) * hitsPerPage;
    const slice = rawResults.slice(start, start + hitsPerPage);

    loading = true;

    const fragments = await Promise.all(slice.map((result) => result.data()));

    // 翻页 / 继续输入都会推进 requestToken，过期结果直接丢弃，避免画面错位
    if (token !== requestToken) return;

    pageHits = fragments.map((fragment) => ({
      url: fragment.url,
      title: fragment.meta?.title?.trim() || fragment.url,
      // excerpt 与查询词无关，在这里算一次即可，不必每次渲染重算
      excerpt: fragment.excerpt ? buildExcerptSegments(fragment.excerpt) : [],
    }));
    loading = false;
  }

  async function runSearch() {
    const term = query.trim();
    requestToken += 1;
    const token = requestToken;

    if (!term) {
      resetResults();
      return;
    }

    const pagefind = await loadPagefind();
    if (!pagefind || token !== requestToken) return;

    loading = true;

    // debouncedSearch 在被后续输入取代时返回 null，天然充当防抖 + 竞态保护
    const response = await pagefind.debouncedSearch(term, null, searchDebounceMs);
    if (response === null || token !== requestToken) return;

    rawResults = response.results;
    statsTime = response.timings?.total ?? 0;
    hasSearched = true;
    currentPage = 1;

    await loadPageHits(1, token);
  }

  function goToPage(page: number) {
    const target = Math.min(Math.max(1, page), lastPage);
    if (target === currentPage) return;

    currentPage = target;
    requestToken += 1;
    void loadPageHits(target, requestToken);
  }

  function clearHideTimeout() {
    if (hideTimeoutId === null || typeof window === "undefined") return;

    window.clearTimeout(hideTimeoutId);
    hideTimeoutId = null;
  }

  function openSearch() {
    if (selector) {
      internalVisible = true;
      return;
    }

    showSearch = true;
  }

  function closeSearch() {
    if (selector) {
      internalVisible = false;
      return;
    }

    showSearch = false;
  }

  function toggleVisibility() {
    if (selector) {
      internalVisible = !internalVisible;
      return;
    }

    showSearch = !showSearch;
  }

  function focusSearchInput() {
    if (typeof window === "undefined") return;

    window.requestAnimationFrame(() => {
      inputElement?.focus();
    });
  }

  function isEditableTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;

    return (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target.isContentEditable
    );
  }

  onMount(() => {
    // Setup selector listener
    if (selector) {
      let element: HTMLElement | null = null;

      if (typeof selector === "string") {
        element = document.querySelector(selector);
      } else if (selector instanceof HTMLElement) {
        element = selector;
      }

      if (element) {
        element.addEventListener("click", toggleVisibility);
        cleanupListener = () => {
          element?.removeEventListener("click", toggleVisibility);
        };
      } else {
        console.warn("Invalid selector provided for PagefindSearch component.");
      }
    }

    const handleKeydown = (event: KeyboardEvent) => {
      const isSearchShortcut =
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "k" &&
        !event.altKey;

      if (isSearchShortcut && !isEditableTarget(event.target)) {
        event.preventDefault();
        openSearch();
        focusSearchInput();
        return;
      }

      if (event.key === "Escape") {
        closeSearch();
      }
    };

    window.addEventListener("keydown", handleKeydown);
    cleanupKeyboard = () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  });

  onDestroy(() => {
    clearHideTimeout();

    if (cleanupListener) {
      cleanupListener();
      cleanupListener = null;
    }
    if (cleanupKeyboard) {
      cleanupKeyboard();
      cleanupKeyboard = null;
    }
  });

  $effect(() => {
    clearHideTimeout();

    if (visible) {
      rendered = true;

      if (typeof window === "undefined") {
        animatedVisible = true;
        return;
      }

      const frameId = window.requestAnimationFrame(() => {
        animatedVisible = true;
      });

      return () => {
        window.cancelAnimationFrame(frameId);
      };
    }

    animatedVisible = false;

    if (typeof window === "undefined") {
      rendered = false;
      return;
    }

    const currentTimeoutId = window.setTimeout(() => {
      rendered = false;
      hideTimeoutId = null;
    }, searchPanelTransitionMs);

    hideTimeoutId = currentTimeoutId;

    return () => {
      window.clearTimeout(currentTimeoutId);
      if (hideTimeoutId === currentTimeoutId) {
        hideTimeoutId = null;
      }
    };
  });

  $effect(() => {
    if (!visible) return;

    focusSearchInput();
    // 面板一打开就预热索引与 wasm，首次敲键不必等下载
    void loadPagefind();
  });

  $effect(() => {
    if (typeof document === "undefined" || !visible) return;

    return lockBodyScroll(document, {
      innerWidth: window.innerWidth,
      getComputedPaddingInlineEnd: () => window.getComputedStyle(document.body).paddingInlineEnd,
    });
  });
</script>

<div
  class="search-shell"
  class:search-shell-visible={animatedVisible}
  hidden={!rendered}
  aria-hidden={!animatedVisible}
>
  <button
    type="button"
    class="search-backdrop"
    aria-label="Close search overlay"
    onclick={closeSearch}
  ></button>

  <div class="panel" role="dialog" aria-modal="true" aria-label="Search">
    <div class="header">
      <span class="icon" aria-hidden="true">
        <span class="i-ri-search-line"></span>
      </span>

      <div class="search-input-container">
        <form role="search" onsubmit={(event) => event.preventDefault()}>
          <input
            bind:this={inputElement}
            bind:value={query}
            oninput={() => void runSearch()}
            class="search-input"
            type="search"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            enterkeyhint="search"
            placeholder={t("search.placeholder")}
            aria-label={t("search.placeholder")}
            aria-controls="search-hits"
          />
        </form>
      </div>

      <button
        type="button"
        class="close-btn"
        onclick={closeSearch}
        aria-label="Close search"
        aria-controls="search-hits"
      >
        <span class="i-ri-close-circle-line" aria-hidden="true"></span>
      </button>
    </div>

    <div class="results">
      <div class="results-inner">
        {#if isDev}
          <div id="search-hits" class="dev-tip">
            {t("search.devModeSkipped")}<br />
            {t("search.buildHint")}
          </div>
        {:else}
          <div id="search-stats" aria-live="polite">
            {#if loadFailed}
              {t("search.failed")}
              <hr />
            {:else if hasSearched}
              {t("search.stats", { time: statsTime, hits: rawResults.length })}
              <hr />
            {:else if loading}
              {t("search.loading")}
              <hr />
            {/if}
          </div>

          <div id="search-hits">
            {#if hasSearched && rawResults.length === 0}
              <div id="hits-empty">
                {t("search.empty", { query: submittedQuery })}
              </div>
            {:else}
              <ol>
                {#each pageHits as hit (hit.url)}
                  <li class="item">
                    <a href={hit.url}>
                      <span class="item-title">
                        {#each buildTitleSegments(hit.title, submittedQuery) as segment, index (index)}
                          {#if segment.marked}<mark>{segment.text}</mark>{:else}{segment.text}{/if}
                        {/each}
                      </span>

                      {#if hit.excerpt.length > 0}
                        <!-- 旧版此处是分类面包屑（本站索引无该字段），沿用同一条 70% 字号的副行放命中上下文 -->
                        <span class="item-excerpt">
                          {#each hit.excerpt as segment, index (index)}
                            {#if segment.marked}<mark>{segment.text}</mark>{:else}{segment.text}{/if}
                          {/each}
                        </span>
                      {/if}
                    </a>
                  </li>
                {/each}
              </ol>
            {/if}
          </div>

          <div id="search-pagination">
            {#if lastPage > 1}
              <ul class="pagination">
                <li class="pagination-item" class:disabled-item={currentPage <= 1}>
                  <button
                    type="button"
                    class="page-number"
                    disabled={currentPage <= 1}
                    aria-label={t("search.prev")}
                    onclick={() => goToPage(currentPage - 1)}
                  >
                    <span class="i-ri-arrow-left-s-line" aria-hidden="true"></span>
                  </button>
                </li>

                {#each paginationItems as item, index (index)}
                  {#if item === "…"}
                    <li class="pagination-item space" aria-hidden="true">…</li>
                  {:else}
                    <li class="pagination-item" class:current={item === currentPage}>
                      <button
                        type="button"
                        class="page-number"
                        aria-current={item === currentPage ? "page" : undefined}
                        onclick={() => goToPage(item)}
                      >
                        {item}
                      </button>
                    </li>
                  {/if}
                {/each}

                <li class="pagination-item" class:disabled-item={currentPage >= lastPage}>
                  <button
                    type="button"
                    class="page-number"
                    disabled={currentPage >= lastPage}
                    aria-label={t("search.next")}
                    onclick={() => goToPage(currentPage + 1)}
                  >
                    <span class="i-ri-arrow-right-s-line" aria-hidden="true"></span>
                  </button>
                </li>
              </ul>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  /* 结构与配色对齐旧版 ShokaX 的 source/css/_common/components/third-party/search.styl */
  .search-shell {
    position: fixed;
    inset: 0;
    z-index: var(--z-search-overlay);
    padding: 1.25rem;
    pointer-events: none;
  }

  .search-shell[hidden] {
    display: none !important;
  }

  .search-shell-visible {
    pointer-events: auto;
  }

  .search-backdrop {
    position: absolute;
    inset: 0;
    border: 0;
    padding: 0;
    cursor: pointer;
    background: var(--nav-bg);
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  .search-shell-visible .search-backdrop {
    opacity: 1;
  }

  .panel {
    position: relative;
    z-index: var(--z-content);
    display: flex;
    flex-direction: column;
    height: 100%;
    margin: 0 auto;
    width: 43.75rem;
    text-shadow: none;
    /* 旧版 transition.shrinkIn：从 1.1 倍缩回原尺寸 */
    opacity: 0;
    transform: scale(1.06);
    transition:
      transform 0.35s ease,
      opacity 0.3s ease;
  }

  .search-shell-visible .panel {
    opacity: 1;
    transform: scale(1);
  }

  .icon,
  .close-btn {
    color: var(--grey-5);
    font-size: 1.125rem;
    padding: 0 0.625rem;
    display: inline-flex;
    align-items: center;
  }

  .close-btn {
    border: 0;
    background: none;
    cursor: pointer;
    transition: color 0.2s ease;
  }

  .close-btn:hover,
  .close-btn:focus-visible {
    color: var(--grey-7);
    outline: none;
  }

  .header {
    display: flex;
    flex: 0 0 auto;
    background: var(--grey-1-a5);
    border-radius: 3rem;
    padding: 0.5rem 1.5rem;
    margin-bottom: 1.25rem;
    border: 0.0625rem solid var(--grey-5);
    font-size: 1.125rem;
    align-items: center;
  }

  .search-input-container {
    flex-grow: 1;
    min-width: 0;
  }

  .search-input-container form {
    padding: 0.125rem;
  }

  .search-input {
    background: transparent;
    border: 0;
    outline: 0;
    width: 100%;
    color: var(--text-color);
    font: inherit;
  }

  .search-input::-webkit-search-cancel-button {
    display: none;
  }

  .results {
    flex: 1;
    min-height: 0;
    padding: 1.875rem 1.875rem 0.3125rem;
    border-radius: 0.3125rem;
    background: var(--grey-1-a7) url("/images/other/search.png") no-repeat bottom right;
    color: var(--text-color);
  }

  .results-inner {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .results hr {
    margin: 0.625rem 0;
  }

  #search-stats {
    flex: 0 0 auto;
    font-size: 0.875rem;
  }

  #search-hits {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  #search-hits ol {
    padding: 0;
    margin: 0;
    list-style: none;
  }

  #search-hits .item {
    margin: 0.9375rem 0;
  }

  #search-hits .item a {
    border-bottom: 0.0625rem dashed var(--grey-4);
    display: block;
    color: inherit;
    text-decoration: none;
    transition:
      color 0.2s ease,
      border-color 0.2s ease;
  }

  #search-hits .item a:hover,
  #search-hits .item a:focus-visible {
    color: var(--color-red);
    border-color: var(--color-red);
  }

  /* 对齐旧版 `.item span { font-size: 70%; display: block; }` 的副行样式 */
  #search-hits .item-excerpt {
    display: block;
    font-size: 70%;
    line-height: 1.7;
    color: var(--grey-5);
  }

  #search-hits mark {
    background: none;
    color: var(--color-red);
    font-weight: 700;
  }

  #search-pagination {
    flex: 0 0 auto;
  }

  #search-pagination ul {
    padding: 0;
    margin: 1.25rem 0;
    list-style: none;
    text-align: center;
  }

  #search-pagination .pagination {
    opacity: 1;
    padding: 0;
    color: var(--grey-5);
  }

  #search-pagination .pagination-item {
    display: inline-block;
    margin: 0 0.5rem;
  }

  #search-pagination .space {
    margin: 0;
  }

  /* 数字与站内其他分页（Pagination.astro）保持同一套视觉 */
  #search-pagination .page-number {
    display: inline-block;
    padding: 0 0.75rem;
    border: 0;
    border-radius: 0.3125rem;
    background: none;
    color: inherit;
    cursor: pointer;
    font: inherit;
    transition:
      background 0.2s ease,
      color 0.2s ease,
      box-shadow 0.2s ease;
  }

  #search-pagination .page-number:hover {
    background: linear-gradient(to right, var(--color-pink), var(--color-orange));
    color: var(--grey-0);
  }

  #search-pagination .current .page-number {
    background: linear-gradient(to right, var(--color-pink), var(--color-orange));
    color: var(--grey-0);
    cursor: default;
  }

  #search-pagination .current .page-number:hover {
    box-shadow: 0 0 0.3125rem var(--primary-color);
  }

  #search-pagination .disabled-item {
    color: var(--grey-4);
    cursor: default;
  }

  #search-pagination .disabled-item .page-number {
    cursor: default;
  }

  #search-pagination .disabled-item .page-number:hover {
    color: var(--grey-4);
    background: none;
    box-shadow: none;
  }

  .dev-tip {
    display: grid;
    place-items: center;
    height: 100%;
    line-height: 1.9;
    text-align: center;
  }

  @media (max-width: 768px) {
    .panel {
      width: 100%;
    }

    .results {
      padding: 1.25rem 1.25rem 0.3125rem;
    }
  }
</style>
