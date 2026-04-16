import type { PluginManifest } from "@hyacine/core";

export interface SiteUptimeOptions {
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

export default function SiteUpTime(options: SiteUptimeOptions): PluginManifest {
  const createdDate = new Date(options.siteCreatedAt);
  if (Number.isNaN(createdDate.getTime())) {
    throw new Error(
      `[site-uptime] Invalid siteCreatedAt: "${options.siteCreatedAt}". Please provide a valid date string.`,
    );
  }

  return {
    name: "local-site-uptime",
    version: "0.0.1",
    minRenderCapability: "runtime-only",
    entry: [
      {
        type: "runtime-only",
        injectPoint: "footer-status",
        path: new URL("./siteUptimeRuntime.ts", import.meta.url).href,
        name: "local-site-uptime-runtime",
        options: options as unknown as Record<string, unknown>,
      },
    ],
  };
}
