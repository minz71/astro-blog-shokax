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

/** 归档页按创建日期排序：分组、月份标题与显示的日期都取 data.date，排序必须一致 */
export function getPostCreatedDate(post: Post): Date {
  return post.data.date;
}

export function comparePostsByCreatedDateDesc(a: Post, b: Post): number {
  return getPostCreatedDate(b).getTime() - getPostCreatedDate(a).getTime();
}

export function comparePostsByCreatedDateAsc(a: Post, b: Post): number {
  return getPostCreatedDate(a).getTime() - getPostCreatedDate(b).getTime();
}
