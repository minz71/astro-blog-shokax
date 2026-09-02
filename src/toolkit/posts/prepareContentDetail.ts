import type { CollectionEntry, RenderResult } from "astro:content";
import { render } from "astro:content";

import { encryptContent } from "@/toolkit/encryption/crypto";
import type { EncryptedData } from "@/toolkit/encryption/types";
import { getContentRenderMode } from "@/toolkit/posts/content";
import { createPostContentContainer } from "@/toolkit/posts/createPostContentContainer";
import { wrapCodeGroups } from "@/toolkit/wrapCodeGroups";
import { wrapExternalLinks } from "@/toolkit/wrapExternalLinks";
import { wrapRenderedCodeBlocks } from "@/toolkit/wrapRenderedCodeBlocks";
import { wrapRenderedImages } from "@/toolkit/wrapRenderedImages";

type ContentContainer = Awaited<ReturnType<typeof createPostContentContainer>>;

/**
 * 内容详情的建置期产物：文章与工具共用同一套预处理。
 *
 * 只在 getStaticPaths 里跑，所以不含任何呈现层决策——要不要渲染上下篇、侧栏、
 * 相关文章，是 ContentDetail.astro 依内容型别决定的事。
 */
export interface PreparedContentDetail {
  isEncrypted: boolean;
  renderedContentHtml?: string;
  encryptedContent?: EncryptedData;
  encryptedToc?: EncryptedData;
  headings: RenderResult["headings"];
}

interface PrepareContentDetailOptions {
  /** 由呼叫端建立一次并重复使用，避免每篇内容各建一个 container。 */
  container: ContentContainer;
  /** 供 wrapExternalLinks 判定站内外链接。 */
  siteUrl?: string;
}

export async function prepareContentDetail(
  entry: CollectionEntry<"posts">,
  options: PrepareContentDetailOptions,
): Promise<PreparedContentDetail> {
  const { Content, headings } = await render(entry);

  /**
   * 带 client island 的内容不走 container 预渲染：container API 解析不出
   * astro-island 的 component-url，会渲成建置前的裸路径。这类内容改在
   * ContentDetail.astro 里直接渲染 <Content />。
   *
   * 判定只看 clientIsland 栏位，不读 entry id、slug、tool 或 categories。
   */
  const renderedHtml =
    getContentRenderMode(entry) === "interactive"
      ? ""
      : wrapExternalLinks(
          wrapRenderedImages(
            wrapCodeGroups(wrapRenderedCodeBlocks(await options.container.renderToString(Content))),
          ),
          { siteUrl: options.siteUrl },
        );

  if (entry.data.encrypted && entry.data.password) {
    const encryptedContent = await encryptContent(renderedHtml, entry.data.password);

    const tocData = headings.map((h) => ({
      id: h.slug,
      text: h.text,
      level: h.depth,
    }));
    const encryptedToc =
      tocData.length > 0
        ? await encryptContent(JSON.stringify(tocData), entry.data.password)
        : undefined;

    return {
      isEncrypted: true,
      encryptedContent,
      encryptedToc,
      headings,
    };
  }

  return {
    isEncrypted: false,
    renderedContentHtml: renderedHtml,
    headings,
  };
}
