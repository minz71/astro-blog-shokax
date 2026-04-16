import type { PluginInitFunction } from "@hyacine/helper/runtime";
import { getInjectPointSelector } from "@hyacine/helper/runtime";

interface SiteUptimeRuntimeOptions {
  siteCreatedAt: string;
  prefixText: string;
  units: {
    year: string;
    years: string;
    month: string;
    months: string;
    day: string;
    days: string;
    hour: string;
    hours: string;
    minute: string;
    minutes: string;
    second: string;
    seconds: string;
  };
}

function formatUnit(value: number, singular: string, plural: string, spaced: boolean): string {
  const unit = value === 1 ? singular : plural;
  return spaced ? `${value} ${unit}` : `${value}${unit}`;
}

function calculateUptime(createdAt: Date, options: SiteUptimeRuntimeOptions): string {
  const diff = Date.now() - createdAt.getTime();
  const spaced = /\s/.test(options.units.second) || /\s/.test(options.units.seconds);

  if (diff < 0) {
    return `${options.prefixText} ${formatUnit(0, options.units.second, options.units.seconds, spaced)}`;
  }

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(months / 12);

  const remainingMonths = months % 12;
  const remainingDays = days % 30;
  const remainingHours = hours % 24;
  const remainingMinutes = minutes % 60;
  const remainingSeconds = seconds % 60;

  const parts: string[] = [];
  if (years > 0) {
    parts.push(formatUnit(years, options.units.year, options.units.years, spaced));
  }
  if (remainingMonths > 0) {
    parts.push(formatUnit(remainingMonths, options.units.month, options.units.months, spaced));
  }
  if (remainingDays > 0) {
    parts.push(formatUnit(remainingDays, options.units.day, options.units.days, spaced));
  }
  if (remainingHours > 0) {
    parts.push(formatUnit(remainingHours, options.units.hour, options.units.hours, spaced));
  }
  if (remainingMinutes > 0) {
    parts.push(formatUnit(remainingMinutes, options.units.minute, options.units.minutes, spaced));
  }
  if (remainingSeconds > 0 || parts.length === 0) {
    parts.push(formatUnit(remainingSeconds, options.units.second, options.units.seconds, spaced));
  }

  return `${options.prefixText} ${parts.join(spaced ? " " : "")}`;
}

function createUptimeElement(options: SiteUptimeRuntimeOptions): HTMLElement {
  const container = document.createElement("div");
  container.className = "site-uptime";
  container.style.cssText = "margin: 0.5rem 0; font-size: 0.9em;";

  const createdAt = new Date(options.siteCreatedAt);
  container.textContent = calculateUptime(createdAt, options);

  const intervalId = window.setInterval(() => {
    container.textContent = calculateUptime(createdAt, options);
  }, 1000);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.removedNodes) {
        if (node === container) {
          clearInterval(intervalId);
          observer.disconnect();
        }
      }
    }
  });

  queueMicrotask(() => {
    if (container.parentNode) {
      observer.observe(container.parentNode, { childList: true });
    }
  });

  return container;
}

export const init: PluginInitFunction<SiteUptimeRuntimeOptions> = (options) => {
  const mount = () => {
    const selector = getInjectPointSelector("footer-status");
    const targetElement = document.querySelector(selector);
    if (!targetElement) return;
    targetElement.appendChild(createUptimeElement(options));
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }
};
