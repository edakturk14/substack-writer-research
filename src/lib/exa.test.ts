import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { searchExa, UPSTREAM_TIMEOUT_MS } from "./exa";

const article = { title: "Article", url: "https://writer.substack.com/p/article" };
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("EXA_API_KEY", "valid-server-key");
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("searchExa", () => {
  it("makes exactly one POST with the exact search payload and server key", async () => {
    fetchMock.mockResolvedValue(Response.json({ results: [article] }));
    expect(await searchExa("How do writers find ideas?")).toEqual({ results: [article], mode: "live" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.exa.ai/search");
    expect(init).toMatchObject({
      method: "POST", headers: { "Content-Type": "application/json", "x-api-key": "valid-server-key" },
      cache: "no-store", redirect: "error", signal: expect.any(AbortSignal),
    });
    expect(JSON.parse(init!.body as string)).toEqual({
      query: "How do writers find ideas?", type: "lite", numResults: 10,
      includeDomains: ["substack.com", "*.substack.com"], contents: { highlights: true },
    });
  });
  it.each(["", " ", "your_exa_api_key", "replace-me", "EXAMPLE_KEY", "placeholder",
    "changeme", "test-key", "demo-key", "xxxxxxxx", "<key>", "bad\nkey", "x".repeat(513)])(
    "rejects placeholder or malformed key without requesting: %s", async (key) => {
      vi.stubEnv("EXA_API_KEY", key);
      await expect(searchExa("query")).rejects.toMatchObject({ code: "SEARCH_NOT_CONFIGURED", status: 503 });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it("rejects a missing key", async () => {
    vi.stubEnv("EXA_API_KEY", undefined);
    await expect(searchExa("query")).rejects.toMatchObject({ code: "SEARCH_NOT_CONFIGURED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("uses only the first useful highlight, and never substitutes summary or full text", async () => {
    fetchMock.mockResolvedValue(Response.json({ results: [
      { ...article, highlights: [null, {}, " \n\u0000", " First useful passage ", "Second"],
        summary: "Generated", text: "Full text", excerpt: "Untrusted fallback" },
      { ...article, url: "https://writer.substack.com/p/second", summary: "Generated",
        text: "Full text", excerpt: "Untrusted fallback", highlights: "not an array" },
    ] }));
    const result = await searchExa("query");
    expect(result.results[0].excerpt).toBe("First useful passage");
    expect(result.results[1].excerpt).toBeUndefined();
    expect(JSON.stringify(result)).not.toMatch(/Generated|Full text|Untrusted fallback/);
  });
  it("validates hostile rows and optional fields, deduplicates and retains order", async () => {
    fetchMock.mockResolvedValue(Response.json({ results: [
      null, "bad", {}, { ...article, url: "https://evil.example/p/article" },
      { ...article, author: {}, publishedDate: "2023-02-29" },
      { ...article, url: `${article.url}/?tracking=x` },
      ...Array.from({ length: 20 }, (_, i) => ({ ...article, title: `Post ${i}`, url: `${article.url}-${i}` })),
    ] }));
    const result = await searchExa("query");
    expect(result.results).toHaveLength(10);
    expect(result.results[0]).toEqual(article);
    expect(result.results[9].title).toBe("Post 8");
  });
  it.each([null, [], {}, { results: null }, { results: {} }, { results: new Array(1001).fill(null) }])(
    "rejects a malformed provider envelope", async (payload) => {
      fetchMock.mockResolvedValue(Response.json(payload));
      await expect(searchExa("query")).rejects.toMatchObject({ code: "INVALID_PROVIDER_RESPONSE", status: 502 });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
  it("allows a genuine empty result and filters all-invalid rows to empty", async () => {
    fetchMock.mockResolvedValue(Response.json({ results: [null, {}] }));
    expect(await searchExa("query")).toEqual({ results: [], mode: "live" });
  });
  it.each([400, 408, 429, 500, 502, 503])("returns safe retry errors, without retries, for HTTP %s", async (status) => {
    fetchMock.mockResolvedValue(new Response("SECRET upstream details", { status }));
    await expect(searchExa("query")).rejects.toMatchObject({
      code: "SEARCH_UNAVAILABLE", status: 503, message: "Search is temporarily unavailable. Please try again.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([401, 403])("returns safe authentication errors for HTTP %s", async (status) => {
    fetchMock.mockResolvedValue(new Response("SECRET upstream details", { status }));
    await expect(searchExa("query")).rejects.toMatchObject({ code: "SEARCH_AUTH_FAILED", status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("does not disclose network errors or log secrets", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      fetchMock.mockRejectedValue(new Error("SECRET token"));
      await expect(searchExa("query")).rejects.toMatchObject({
        code: "SEARCH_UNAVAILABLE", message: "Search is temporarily unavailable. Please try again.",
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
  it.each([
    new Response("<html>SECRET</html>", { headers: { "content-type": "text/html" } }),
    new Response("{bad", { headers: { "content-type": "application/json" } }),
    new Response("", { headers: { "content-type": "application/json" } }),
    new Response(new Uint8Array([0xff]), { headers: { "content-type": "application/json" } }),
    new Response("{}", { headers: { "content-type": "application/json", "content-length": "2097153" } }),
    new Response(`"${"x".repeat(2097153)}"`, { headers: { "content-type": "application/json" } }),
  ])("rejects non-JSON, malformed, invalid UTF-8 and oversized bodies", async (response) => {
    fetchMock.mockResolvedValue(response);
    await expect(searchExa("query")).rejects.toMatchObject({ code: "INVALID_PROVIDER_RESPONSE", status: 502 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("times out a stalled fetch, aborts it, and never retries", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const pending = expect(searchExa("query")).rejects.toMatchObject({ code: "SEARCH_TIMEOUT", status: 504 });
    await vi.advanceTimersByTimeAsync(UPSTREAM_TIMEOUT_MS);
    await pending;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("keeps the deadline active during body consumption and cancels the stalled stream", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{"results":')); }, cancel });
    fetchMock.mockResolvedValue(new Response(stream, { headers: { "content-type": "application/json" } }));
    const pending = expect(searchExa("query")).rejects.toMatchObject({ code: "SEARCH_TIMEOUT", status: 504 });
    await vi.advanceTimersByTimeAsync(UPSTREAM_TIMEOUT_MS);
    await pending;
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("clears its timer on success", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(Response.json({ results: [] }));
    await searchExa("query");
    expect(vi.getTimerCount()).toBe(0);
  });
});
