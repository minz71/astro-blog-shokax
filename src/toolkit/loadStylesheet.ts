const stylesheetLoads = new Map<string, Promise<void>>();

function findStylesheet(href: string): HTMLLinkElement | undefined {
  return Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).find(
    (link) => link.getAttribute("href") === href,
  );
}

/** 按需插入样式表；同一 URL 在加载期间与加载完成后都只保留一个 link。 */
export function loadStylesheet(href: string): Promise<void> {
  if (typeof document === "undefined" || !href) return Promise.resolve();

  const pendingLoad = stylesheetLoads.get(href);
  if (pendingLoad) return pendingLoad;

  const existingLink = findStylesheet(href);
  if (existingLink?.sheet) return Promise.resolve();

  const link = existingLink ?? document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;

  const load = new Promise<void>((resolve, reject) => {
    link.addEventListener(
      "load",
      () => {
        resolve();
      },
      { once: true },
    );
    link.addEventListener(
      "error",
      () => {
        stylesheetLoads.delete(href);
        link.remove();
        reject(new Error(`样式表载入失败：${href}`));
      },
      { once: true },
    );
  });

  stylesheetLoads.set(href, load);
  if (!existingLink) document.head.append(link);

  return load;
}
