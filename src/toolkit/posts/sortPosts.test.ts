import { describe, expect, it } from "vitest";
import type { Post } from "./types";
import {
  comparePostsByOrderDateAsc,
  comparePostsByOrderDateDesc,
  getPostOrderDate,
} from "./sortPosts";

describe("sortPosts", () => {
  const olderPost: Post = {
    id: "older",
    collection: "posts",
    data: {
      title: "較舊文章",
      date: new Date("2024-01-01T00:00:00Z"),
      categories: [],
      encrypted: false,
    },
    body: "older",
  };

  const updatedPost: Post = {
    id: "updated",
    collection: "posts",
    data: {
      title: "最近更新文章",
      date: new Date("2023-01-01T00:00:00Z"),
      updated: new Date("2025-01-01T00:00:00Z"),
      categories: [],
      encrypted: false,
    },
    body: "updated",
  };

  it("should prefer updated over date", () => {
    expect(getPostOrderDate(updatedPost)).toEqual(updatedPost.data.updated!);
    expect(getPostOrderDate(olderPost)).toEqual(olderPost.data.date);
  });

  it("should sort posts by updated or date in descending order", () => {
    const posts = [olderPost, updatedPost].toSorted(comparePostsByOrderDateDesc);
    expect(posts.map((post) => post.id)).toEqual(["updated", "older"]);
  });

  it("should sort posts by updated or date in ascending order", () => {
    const posts = [olderPost, updatedPost].toSorted(comparePostsByOrderDateAsc);
    expect(posts.map((post) => post.id)).toEqual(["older", "updated"]);
  });
});
