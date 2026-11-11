import "server-only";
import { validateArticleUrl } from "./articles";
import type { Article } from "./contracts";
import { readBoundedJson, SearchError, withDeadline } from "./exa";

const unavailable = () => new SearchError("ARTICLE_ACCESS_UNAVAILABLE", "Could not check article access.", 502);

async function markPaidArticle(article: Article): Promise<Article> {
  const validated = validateArticleUrl(article.url);
  if (!validated) return article;

  const source = new URL(validated);
  const slug = /^\/p\/([a-z0-9][a-z0-9_-]*)\/?$/i.exec(source.pathname)?.[1];
  if (!slug || source.hostname === "substack.com" || source.hostname === "www.substack.com") return article;

  const endpoint = new URL(`/api/v1/posts/${slug}`, source.origin);
  try {
    const metadata = await withDeadline(async (signal) => {
      const response = await fetch(endpoint, {
        headers: { Accept: "application/json" },
        redirect: "error",
        next: { revalidate: 900 },
        signal,
      });
      const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
      if (!response.ok || contentType !== "application/json") {
        void response.body?.cancel().catch(() => {});
        return null;
      }
      return readBoundedJson(response, 1024 * 1024, signal, unavailable);
    }, 1500, unavailable);

    if (metadata && typeof metadata === "object" && "slug" in metadata && metadata.slug === slug &&
      "audience" in metadata && (metadata.audience === "only_paid" || metadata.audience === "founding")) {
      return { ...article, paid: true };
    }
  } catch {
    // An unavailable access check should not prevent the search from working.
  }
  return article;
}

export function markPaidArticles(articles: Article[]): Promise<Article[]> {
  return Promise.all(articles.map(markPaidArticle));
}
