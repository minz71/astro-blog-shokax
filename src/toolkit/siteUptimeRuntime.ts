export interface SiteUptimeUnits {
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
}

export interface SiteUptimeRuntimeOptions {
  siteCreatedAt: string;
  prefixText: string;
  units: SiteUptimeUnits;
  spaced: boolean;
  targetSelector?: string;
}

const DEFAULT_TARGET_SELECTOR =
  ".hyacine-slot-footer-status, .footer-status, #footer .status";

function formatUnit(value: number, singular: string, plural: string, spaced: boolean): string {
  const unit = value === 1 ? singular : plural;
  return spaced ? `${value} ${unit}` : `${value}${unit}`;
}

function calculateUptime(startDate: number, options: SiteUptimeRuntimeOptions): string {
  const { units, spaced } = options;
  const diff = Math.max(0, Date.now() - startDate);

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(months / 12);

  const parts: string[] = [];
  if (years > 0) {
    parts.push(formatUnit(years, units.year, units.years, spaced));
  }
  if (months % 12 > 0) {
    parts.push(formatUnit(months % 12, units.month, units.months, spaced));
  }
  if (days % 30 > 0) {
    parts.push(formatUnit(days % 30, units.day, units.days, spaced));
  }
  if (hours % 24 > 0) {
    parts.push(formatUnit(hours % 24, units.hour, units.hours, spaced));
  }
  if (minutes % 60 > 0) {
    parts.push(formatUnit(minutes % 60, units.minute, units.minutes, spaced));
  }
  // 秒永远保留，否则整点整分时字串会突然只剩前缀
  if (seconds % 60 > 0 || parts.length === 0) {
    parts.push(formatUnit(seconds % 60, units.second, units.seconds, spaced));
  }

  return `${options.prefixText} ${parts.join(spaced ? " " : "")}`;
}

export function init(options: SiteUptimeRuntimeOptions): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const startDate = new Date(options.siteCreatedAt).getTime();
  if (Number.isNaN(startDate)) return;

  const targetSelector = options.targetSelector ?? DEFAULT_TARGET_SELECTOR;

  const update = () => {
    const host = document.querySelector(targetSelector);
    if (!host) return;

    let counter = host.querySelector(".hyacine-uptime-counter");
    if (!counter) {
      counter = document.createElement("span");
      counter.className = "hyacine-uptime-counter";
      host.append(counter);
    }

    counter.textContent = calculateUptime(startDate, options);
  };

  update();
  setInterval(update, 1000);
}

export default { init };
