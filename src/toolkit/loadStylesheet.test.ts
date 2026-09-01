// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import { loadStylesheet } from "./loadStylesheet";

afterEach(() => {
  document.head.querySelectorAll('link[rel="stylesheet"]').forEach((link) => link.remove());
});

describe("loadStylesheet", () => {
  it("并发载入同一 URL 时只插入一个 link", async () => {
    const firstLoad = loadStylesheet("/styles/on-demand.css");
    const secondLoad = loadStylesheet("/styles/on-demand.css");
    const links = document.head.querySelectorAll('link[href="/styles/on-demand.css"]');

    expect(links).toHaveLength(1);
    links[0]?.dispatchEvent(new Event("load"));
    await expect(Promise.all([firstLoad, secondLoad])).resolves.toEqual([undefined, undefined]);
  });

  it("载入失败时移除 link，并允许再次尝试", async () => {
    const failedLoad = loadStylesheet("/styles/retry.css");
    const failedLink = document.head.querySelector<HTMLLinkElement>(
      'link[href="/styles/retry.css"]',
    );

    failedLink?.dispatchEvent(new Event("error"));
    await expect(failedLoad).rejects.toThrow("样式表载入失败");
    expect(document.head.querySelector('link[href="/styles/retry.css"]')).toBeNull();

    const retryLoad = loadStylesheet("/styles/retry.css");
    const retryLink = document.head.querySelector<HTMLLinkElement>(
      'link[href="/styles/retry.css"]',
    );
    retryLink?.dispatchEvent(new Event("load"));

    await expect(retryLoad).resolves.toBeUndefined();
  });
});
