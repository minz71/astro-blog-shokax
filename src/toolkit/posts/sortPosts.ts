import type { Post } from "./types";

export function getPostOrderDate(post: Post): Date {
  return post.data.updated ?? post.data.date;
}

export function comparePostsByOrderDateDesc(a: Post, b: Post): number {
  return getPostOrderDate(b).getTime() - getPostOrderDate(a).getTime();
}

export function comparePostsByOrderDateAsc(a: Post, b: Post): number {
  return getPostOrderDate(a).getTime() - getPostOrderDate(b).getTime();
}
