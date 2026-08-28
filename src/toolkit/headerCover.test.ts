import { describe, expect, it } from "vitest";
import coversConfig from "@/covers.config";
import { resolveHeaderCovers } from "./headerCover";

describe("headerCover", () => {
  it("should return coverUrls when provided", async () => {
    const options = {
      coverUrls: ["cover1.jpg", "cover2.jpg"],
      fallbackCovers: ["fallback1.jpg", "fallback2.jpg"],
    };
    const result = await resolveHeaderCovers(options);
    expect(result).toEqual(["cover1.jpg", "cover2.jpg"]);
  });

  it("should trim and filter out invalid coverUrls", async () => {
    const options = {
      coverUrls: ["  cover1.jpg  ", "", "   ", "cover2.jpg"],
      fallbackCovers: ["fallback1.jpg", "fallback2.jpg"],
    };
    const result = await resolveHeaderCovers(options);
    expect(result).toEqual(["cover1.jpg", "cover2.jpg"]);
  });

  it("should return covers from config when coverUrls is empty", async () => {
    const options = {
      coverUrls: [],
      fallbackCovers: ["fallback1.jpg", "fallback2.jpg"],
    };
    const result = await resolveHeaderCovers(options);
    expect(result).toEqual(
      coversConfig.urls.length > 0 ? coversConfig.urls : options.fallbackCovers,
    );
  });

  it("should resolve preset keys to local assets and keep remote URLs as-is", async () => {
    const cover1: ImageMetadata = {
      src: "/_astro/cover-1.avif",
      width: 1920,
      height: 1080,
      format: "avif",
    };
    const result = await resolveHeaderCovers({
      coverUrls: [
        "cover-1",
        "https://picbed.example.com/api/anime?1",
        "https://picbed.example.com/api/anime?2",
      ],
      fallbackCovers: ["fallback1.jpg"],
      presets: { "cover-1": cover1 },
    });
    expect(result).toEqual([
      cover1,
      "https://picbed.example.com/api/anime?1",
      "https://picbed.example.com/api/anime?2",
    ]);
  });

  it("should leave unknown keys untouched when presets are provided", async () => {
    const result = await resolveHeaderCovers({
      coverUrls: ["  cover-9  ", "https://picbed.example.com/a.jpg"],
      fallbackCovers: ["fallback1.jpg"],
      presets: {},
    });
    expect(result).toEqual(["cover-9", "https://picbed.example.com/a.jpg"]);
  });
});
