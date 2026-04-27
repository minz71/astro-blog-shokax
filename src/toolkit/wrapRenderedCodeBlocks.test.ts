import { describe, expect, it } from "bun:test";
import { wrapRenderedCodeBlocks } from "./wrapRenderedCodeBlocks";

describe("wrapRenderedCodeBlocks", () => {
  it("should wrap astro code blocks with code-block", () => {
    const html = '<pre class="astro-code"><code><span>const a = 1;</span></code></pre>';

    expect(wrapRenderedCodeBlocks(html)).toContain(
      '<code-block><pre class="astro-code"><code><span>const a = 1;</span></code></pre></code-block>',
    );
  });

  it("should wrap tables with table-container", () => {
    const html =
      "<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>B</td></tr></tbody></table>";

    expect(wrapRenderedCodeBlocks(html)).toContain(
      '<div class="table-container"><table><thead><tr><th>A</th></tr></thead><tbody><tr><td>B</td></tr></tbody></table></div>',
    );
  });
});
