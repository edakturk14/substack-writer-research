import "server-only";
import { parseArticle, validateArticleUrl } from "./articles";
import type { Article } from "./contracts";
import { readBoundedJson, SearchError, withDeadline } from "./exa";

const unavailable = () => new SearchError("ARTICLE_METADATA_UNAVAILABLE", "Could not check Substack post details.", 502);

async function enrichArticle(article: Article): Promise<Article> {
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

    if (!metadata || typeof metadata !== "object" || !("slug" in metadata) || metadata.slug !== slug) return article;
    const post = metadata as Record<string, unknown>;
    const breakdown = post.reactions && typeof post.reactions === "object"
      ? post.reactions as Record<string, unknown>
      : {};
    return parseArticle({
      ...article,
      paid: post.audience === "only_paid" || post.audience === "founding",
      likes: breakdown["❤"] ?? breakdown["❤️"] ?? (post.reaction_count === 0 ? 0 : undefined),
      reactions: post.reaction_count,
      comments: post.comment_count,
    }) ?? article;
  } catch {
    // An unavailable Substack lookup should not prevent the search from working.
  }
  return article;
}

export function enrichSubstackArticles(articles: Article[]): Promise<Article[]> {
  return Promise.all(articles.map(enrichArticle));
}
