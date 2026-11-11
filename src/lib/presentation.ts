import type { Article } from "./contracts";

export const PAGE_SIZE = 5;
export const EXCERPT_LENGTH = 300;
export type ArticleSort = "relevance" | "newest" | "oldest";

const COMMON_QUERY_WORDS = new Set(
  "a about an and are as at be by can could did do does find for from had has have how i in is it me of on or please show should tell than that the their them there they this to was were what when where which who why will with would you your".split(" "),
);

function words(text: string): string[] {
  return text.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

export function keywordMatch(query: string, title: string, excerpt = ""): number | null {
  const terms = [...new Set(words(query).filter((word) => !COMMON_QUERY_WORDS.has(word)))];
  if (!terms.length) return null;
  const articleWords = new Set(words(`${title} ${excerpt}`));
  const matched = terms.filter((term) => articleWords.has(term)).length;
  return Math.round(100 * matched / terms.length);
}

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
