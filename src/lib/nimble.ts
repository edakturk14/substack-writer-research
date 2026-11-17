import "server-only";
import { parseArticle, parseSearchResponse } from "./articles";
import type { SearchResponse } from "./contracts";
import { readBoundedJson, SearchError, withDeadline } from "./exa";

export const NIMBLE_TIMEOUT_MS = 15_000;
const invalidResponse = () => new SearchError(
  "INVALID_PROVIDER_RESPONSE", "Nimble returned an invalid response. Please try again.", 502,
);

/** One search, no retries or fallback to a different provider. */
export async function searchNimble(query: string): Promise<SearchResponse> {
  const key = process.env.NIMBLE_API_KEY?.trim();
  if (!key || key.length > 512 || /[^!-~]/.test(key) ||
    /^(?:your|replace|insert|paste|example|placeholder|change|test|demo|xxx|<)/i.test(key)) {
    throw new SearchError("SEARCH_NOT_CONFIGURED", "Set a valid NIMBLE_API_KEY on the server.", 503);
  }
  try {
    return await withDeadline(async (signal) => {
      const response = await fetch("https://sdk.nimbleway.com/v2/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ query, max_results: 10, include_domains: ["substack.com"], search_depth: "standard" }),
        signal, cache: "no-store", redirect: "error",
      });
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        if (response.status === 401 || response.status === 403) {
          throw new SearchError("SEARCH_AUTH_FAILED", "Check the server's NIMBLE_API_KEY.", 503);
        }
        if (response.status === 429) {
          throw new SearchError("SEARCH_RATE_LIMITED", "Nimble is busy. Please try again shortly.", 429);
        }
        throw new SearchError("SEARCH_UNAVAILABLE", "Nimble is temporarily unavailable. Please try again.", 503);
      }
      if (response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
        void response.body?.cancel().catch(() => {});
        throw invalidResponse();
      }
      let payload: unknown;
      try {
        payload = await readBoundedJson(response, 2 * 1024 * 1024, signal, invalidResponse);
      } catch (error) {
        if (signal.aborted) throw error;
        throw invalidResponse();
      }
      if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
        !("results" in payload) || !Array.isArray(payload.results) || payload.results.length > 1000) {
        throw invalidResponse();
      }
      const results = payload.results.map((item: unknown) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return null;
        const { title, url, description } = item as Record<string, unknown>;
        // Descriptions are provider snippets, not guaranteed verbatim article passages.
        // Do not invent dates, authors, engagement, or relevance percentages.
        return parseArticle({ title, url, excerpt: description });
      });
      return parseSearchResponse({ results, mode: "live" })!;
    }, NIMBLE_TIMEOUT_MS, () => new SearchError("SEARCH_TIMEOUT", "Nimble took too long. Please try again.", 504));
  } catch (error) {
    if (error instanceof SearchError) throw error;
    throw new SearchError("SEARCH_UNAVAILABLE", "Nimble is temporarily unavailable. Please try again.", 503);
  }
}
