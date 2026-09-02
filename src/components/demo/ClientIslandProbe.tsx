import { createSignal } from "solid-js";

interface ClientIslandProbeProps {
  label?: string;
}

/**
 * client island 机制的示范探针。
 *
 * 主题的 `clientIsland` 开关只是一个机制：带 island 的内容不走 container 预渲染，
 * 改在模板里直接渲染 <Content />，让 astro-island 的 component-url 能解析成建置后
 * 带 hash 的资源路径。这个机制需要一个真的会水合的组件才测得出来，而具体工具的
 * 组件按 AGENTS.md 属于站点负载（只存在于 cloudflare），所以主题这边自备一个最小
 * 探针，供示范文章与 E2E 使用。
 *
 * 刻意不做「默认隐藏、水合后才显示」：SSR 就渲出可读内容，水合只负责让计数会动
 *（见 AGENTS.md「CSS 默认隐藏 + JS 异步加显示类很脆」）。
 */
export default function ClientIslandProbe(props: ClientIslandProbeProps) {
  const [count, setCount] = createSignal(0);

  return (
    <div class="client-island-probe" data-testid="client-island-probe">
      <button
        type="button"
        data-testid="client-island-probe-button"
        onClick={() => setCount(count() + 1)}
      >
        {props.label ?? "点我"}
      </button>
      <output data-testid="client-island-probe-count">{count()}</output>
    </div>
  );
}
