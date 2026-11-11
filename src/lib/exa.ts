import "server-only";
import { parseArticle, parseSearchResponse } from "./articles";
import type { SearchResponse } from "./contracts";

export const UPSTREAM_TIMEOUT_MS = 10_000;
const MAX_PROVIDER_BYTES = 2 * 1024 * 1024;

export class SearchError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
    this.name = "SearchError";
  }
}

const unavailable = () => new SearchError(
  "SEARCH_UNAVAILABLE", "Search is temporarily unavailable. Please try again.", 503,
);
const invalidResponse = () => new SearchError(
  "INVALID_PROVIDER_RESPONSE", "Search returned an invalid response. Please try again.", 502,
);

/** A deadline covers fetch AND body consumption, even if fetch ignores abort. */
export async function withDeadline<T>(
  work: (signal: AbortSignal) => Promise<T>,
  milliseconds: number,
  failure: () => SearchError,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(failure());
          controller.abort();
        }, milliseconds);
      }),
      work(controller.signal),
    ]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

/** Limits actual bytes, not just the untrusted Content-Length header. */
export async function readBoundedJson(
  source: Request | Response,
  maxBytes: number,
  signal: AbortSignal,
  tooLarge: () => SearchError,
): Promise<unknown> {
  const length = source.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes)) {
    void source.body?.cancel().catch(() => {});
    throw tooLarge();
  }
  if (!source.body) throw new SyntaxError("Empty JSON");
  const reader = source.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    if (signal.aborted) throw new Error("Aborted");
    while (true) {
      const { done, value } = await reader.read();
      if (signal.aborted) throw new Error("Aborted");
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        cancel();
        throw tooLarge();
      }
      chunks.push(value);
    }
    const combined = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(combined));
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

function apiKey(): string {
  const key = process.env.EXA_API_KEY?.trim();
  if (!key || key.length > 512 || /[^!-~]/.test(key) ||
    /^(?:your|replace|insert|paste|example|placeholder|change|test|demo|xxx|<)/i.test(key)) {
    throw new SearchError(
      "SEARCH_NOT_CONFIGURED",
      "Live search is not configured. Set a valid EXA_API_KEY on the server.",
      503,
    );
  }
  return key;
}

function parseProviderResponse(value: unknown): SearchResponse {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
    !("results" in value) || !Array.isArray(value.results) || value.results.length > 1000) {
    throw invalidResponse();
  }
  const candidates = value.results.map((result: unknown) => {
    if (result === null || typeof result !== "object" || Array.isArray(result)) return null;
    const { url, title, author, publication, publishedDate, highlights } = result as Record<string, unknown>;
    const article = parseArticle({ url, title, author, publication, publishedDate });
    if (!article) return null;
    if (Array.isArray(highlights)) {
      for (const highlight of highlights.slice(0, 100)) {
        const excerpt = parseArticle({ ...article, excerpt: highlight })?.excerpt;
        if (excerpt) {
          article.excerpt = excerpt;
          break;
        }
      }
    }
    return article;
  });
  return parseSearchResponse({ results: candidates, mode: "live" })!;
}

export async function searchExa(query: string): Promise<SearchResponse> {
  const key = apiKey();
  try {
    return await withDeadline(async (signal) => {
      const response = await fetch("https://api.exa.ai/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": key },
        body: JSON.stringify({
          query,
          type: "lite",
          numResults: 10,
          includeDomains: ["substack.com", "*.substack.com"],
          contents: { highlights: true },
        }),
        signal,
        cache: "no-store",
        redirect: "error",
      });
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        if (response.status === 401 || response.status === 403) {
          throw new SearchError(
            "SEARCH_AUTH_FAILED",
            "Live search could not authenticate. Check the server's EXA_API_KEY.",
            503,
          );
        }
        throw unavailable();
      }
      const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
      if (contentType !== "application/json") {
        void response.body?.cancel().catch(() => {});
        throw invalidResponse();
      }
      let payload: unknown;
      try {
        payload = await readBoundedJson(response, MAX_PROVIDER_BYTES, signal, invalidResponse);
      } catch (error) {
        if (signal.aborted) throw error;
        throw invalidResponse();
      }
      return parseProviderResponse(payload);
    }, UPSTREAM_TIMEOUT_MS, () => new SearchError(
      "SEARCH_TIMEOUT", "Search took too long. Please try again.", 504,
    ));
  } catch (error) {
    if (error instanceof SearchError) throw error;
    throw unavailable();
  }
}
