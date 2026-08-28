import themeConfig from "@/theme.config";

export type ThemeMode = "light" | "dark";

const STORAGE_KEY = "shokax-color-scheme";

function getStoredTheme(win: Window): ThemeMode | null {
  try {
    const stored = win.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      return stored;
    }
  } catch (err) {
    console.warn("[ShokaX] Unable to read theme from storage", err);
  }

  return null;
}

function getPreferredTheme(win: Window): ThemeMode {
  return win.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
}

export type ThemeDefaultMode = "light" | "dark" | "system";

function getDefaultTheme(win: Window, defaultMode: ThemeDefaultMode): ThemeMode {
  if (defaultMode === "light" || defaultMode === "dark") {
    return defaultMode;
  }
  return getPreferredTheme(win);
}

export function applyTheme(doc: Document, theme: ThemeMode) {
  doc.documentElement.dataset.theme = theme;
}

/**
 * defaultMode 是参数而不是直接读 themeConfig：站点把它设成 light 之后，
 * 「无储存值时跟随系统」这条行为就变得不可测——测试会跟着站点设定红掉。
 */
export function initTheme(
  doc: Document,
  win: Window,
  defaultMode: ThemeDefaultMode = themeConfig.theme?.defaultMode ?? "system",
): ThemeMode {
  const theme = getStoredTheme(win) ?? getDefaultTheme(win, defaultMode);
  applyTheme(doc, theme);
  return theme;
}

function supportsViewTransitions(doc: Document): boolean {
  return "startViewTransition" in doc;
}

function prefersReducedMotion(win: Window): boolean {
  return win.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function persistTheme(win: Window, theme: ThemeMode) {
  try {
    win.localStorage.setItem(STORAGE_KEY, theme);
  } catch (err) {
    console.warn("[ShokaX] Unable to persist theme", err);
  }
}

export function toggleThemeWithTransition(
  doc: Document,
  win: Window,
  current: ThemeMode,
): ThemeMode {
  const next: ThemeMode = current === "dark" ? "light" : "dark";
  persistTheme(win, next);

  if (!supportsViewTransitions(doc) || prefersReducedMotion(win)) {
    applyTheme(doc, next);

    return next;
  }

  const transition = doc.startViewTransition(() => {
    applyTheme(doc, next);
  });

  transition.finished
    .then(() => {})
    .catch((err) => {
      console.warn("[ShokaX] Theme transition failed", err);
      persistTheme(win, next);
    });

  return next;
}

export function toggleTheme(doc: Document, win: Window, current: ThemeMode): ThemeMode {
  const next: ThemeMode = current === "dark" ? "light" : "dark";
  applyTheme(doc, next);
  persistTheme(win, next);

  return next;
}
