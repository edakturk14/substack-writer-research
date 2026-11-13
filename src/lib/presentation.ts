import type { Article } from "./contracts";

export const PAGE_SIZE = 5;
export const EXCERPT_LENGTH = 300;
export type ArticleSort = "relevance" | "newest" | "oldest";

export function shortExcerpt(text: string): string {
  const characters = Array.from(text.trim());
  if (characters.length <= EXCERPT_LENGTH) return text.trim();
  const prefix = characters.slice(0, EXCERPT_LENGTH - 1).join("");
  const boundary = prefix.search(/\s+\S*$/u);
  return `${(boundary > EXCERPT_LENGTH / 2 ? prefix.slice(0, boundary) : prefix).trimEnd()}…`;
}

export function sortArticles(articles: readonly Article[], order: ArticleSort): Article[] {
  if (order === "relevance") return [...articles];
  const timestamp = (article: Article) => {
    const time = article.publishedDate ? Date.parse(article.publishedDate) : NaN;
    return Number.isFinite(time) ? time : null;
  };
  return [...articles].sort((a, b) => {
    const left = timestamp(a);
    const right = timestamp(b);
    if (left === null) return right === null ? 0 : 1;
    if (right === null) return -1;
    return order === "newest" ? right - left : left - right;
  });
}

export function articlePage(articles: readonly Article[], requestedPage: number) {
  const pageCount = Math.max(1, Math.ceil(articles.length / PAGE_SIZE));
  const page = Math.min(pageCount, Math.max(1, Math.floor(requestedPage) || 1));
  const start = (page - 1) * PAGE_SIZE;
  return { articles: articles.slice(start, start + PAGE_SIZE), page, pageCount, start };
}
