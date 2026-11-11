import type { Article, SearchResponse } from "./contracts";

const MAX_URL_LENGTH = 4096;
const MAX_INPUT_TEXT = 100_000;
const MAX_CANDIDATES = 1000;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, limit: number): string | undefined {
  if (typeof value !== "string" || value.length > MAX_INPUT_TEXT) return;
  // These are plain strings, never HTML. React must render them as text.
  const clean = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim();
  if (!clean) return;
  return clean.length > limit ? `${clean.slice(0, limit - 1)}…` : clean;
}

export function validateArticleUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > MAX_URL_LENGTH) return null;
  // Inspect the original spelling too: URL() otherwise repairs backslashes,
  // whitespace, dot segments and some deceptive Unicode host spellings.
  const match = /^https:\/\/([a-z0-9.-]+)(?::443)?(\/[^?#]*)(?:[?#].*)?$/i.exec(value);
  if (!match || /[\s\\\u0000-\u001f\u007f-\u009f]/u.test(value)) return null;
  const host = match[1].toLowerCase();
  if (
    host !== "substack.com" &&
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.substack\.com$/.test(host)
  ) return null;
  const path = match[2];
  const articlePath = /^\/p\/[a-z0-9][a-z0-9_-]*\/?$/i.test(path);
  const profileArticlePath =
    (host === "substack.com" || host === "www.substack.com") &&
    /^\/@[a-z0-9_][a-z0-9_-]*\/p\/[a-z0-9][a-z0-9_-]*\/?$/i.test(path);
  if (!articlePath && !profileArticlePath) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port
      && url.hostname === host && url.pathname === path ? value : null;
  } catch {
    return null;
  }
}

export function articleIdentity(url: string): string {
  if (!validateArticleUrl(url)) return "";
  const parsed = new URL(url);
  // Do not use this identity as a navigation target.
  const host = parsed.hostname === "www.substack.com" ? "substack.com" : parsed.hostname;
  return `https://${host}${parsed.pathname.replace(/\/$/, "")}`;
}

function date(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 40) return;
  const match = /^([1-9]\d{3})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-](\d{2}):(\d{2})))?$/.exec(value);
  if (!match) return;
  const calendar = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
  if (calendar.toISOString().slice(0, 10) !== value.slice(0, 10)) return;
  if (match[4] && (+match[4] > 23 || +match[5] > 59 || +match[6] > 59 ||
    (match[8] !== undefined && (+match[8] > 23 || +match[9] > 59)))) return;
  return Number.isFinite(Date.parse(value)) ? value : undefined;
}

export function parseArticle(value: unknown): Article | null {
  if (!record(value)) return null;
  const url = validateArticleUrl(value.url);
  const title = text(value.title, 300);
  if (!url || !title) return null;
  const article: Article = { url, title };
  const excerpt = text(value.excerpt, 1200);
  const author = text(value.author, 160);
  const publication = text(value.publication, 160);
  const publishedDate = date(value.publishedDate);
  if (excerpt) article.excerpt = excerpt;
  if (author) article.author = author;
  if (publication) article.publication = publication;
  if (publishedDate) article.publishedDate = publishedDate;
  return article;
}

export function parseSearchResponse(value: unknown): SearchResponse | null {
  if (!record(value) || (value.mode !== "live" && value.mode !== "demo") ||
    !Array.isArray(value.results) || value.results.length > MAX_CANDIDATES) return null;
  const results: Article[] = [];
  const seen = new Set<string>();
  for (const candidate of value.results) {
    const article = parseArticle(candidate);
    if (!article) continue;
    const identity = articleIdentity(article.url);
    if (seen.has(identity)) continue;
    seen.add(identity);
    results.push(article);
    if (results.length === 10) break;
  }
  return { results, mode: value.mode };
}
