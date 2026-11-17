import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { searchNimble, NIMBLE_TIMEOUT_MS } from "./nimble";

const fetchMock = vi.fn<typeof fetch>();
const article = { title: "A post", url: "https://writer.substack.com/p/a-post" };
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("NIMBLE_API_KEY", "valid-nimble-key");
  fetchMock.mockReset();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("searchNimble", () => {
  it("uses the documented endpoint, auth, and domain filter, mapping descriptions without inventing metadata", async () => {
    fetchMock.mockResolvedValue(Response.json({ results: [{ ...article, description: "A provider snippet", metadata: { position: 1 }, likes: 99 }] }));
    expect(await searchNimble("question")).toEqual({ results: [{ ...article, excerpt: "A provider snippet" }], mode: "live" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://sdk.nimbleway.com/v2/search");
    expect(init).toMatchObject({ headers: { Authorization: "Bearer valid-nimble-key" }, cache: "no-store", redirect: "error" });
    expect(JSON.parse(init!.body as string)).toEqual({ query: "question", max_results: 10, search_depth: "standard", include_domains: ["substack.com"] });
  });
  it("filters unsafe URLs and non-articles, deduplicating while preserving order", async () => {
    fetchMock.mockResolvedValue(Response.json({ results: [null, {}, { ...article, url: "https://evil.example/p/a" },
      { ...article, url: "https://writer.substack.com/about" }, article, { ...article, url: article.url + "?tracking=1" },
      { ...article, title: "Second", url: "https://writer.substack.com/p/second" }] }));
    expect((await searchNimble("q")).results.map(x => x.title)).toEqual(["A post", "Second"]);
  });
  it.each([undefined, "", "your_nimble_api_key_here", "bad\nkey"])("rejects absent or invalid credentials before fetching", async (key) => {
    vi.stubEnv("NIMBLE_API_KEY", key);
    await expect(searchNimble("q")).rejects.toMatchObject({ code: "SEARCH_NOT_CONFIGURED", status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([[401, "SEARCH_AUTH_FAILED", 503], [403, "SEARCH_AUTH_FAILED", 503], [429, "SEARCH_RATE_LIMITED", 429], [500, "SEARCH_UNAVAILABLE", 503]])("handles HTTP %s without leaking response details or retrying", async (status, code, expectedStatus) => {
    fetchMock.mockResolvedValue(new Response("SECRET", { status: Number(status) }));
    await expect(searchNimble("q")).rejects.toMatchObject({ code, status: expectedStatus });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([null, {}, { results: null }])("rejects malformed provider data", async (payload) => {
    fetchMock.mockResolvedValue(Response.json(payload));
    await expect(searchNimble("q")).rejects.toMatchObject({ code: "INVALID_PROVIDER_RESPONSE" });
  });
  it("keeps a genuine empty response empty", async () => {
    fetchMock.mockResolvedValue(Response.json({ results: [] }));
    expect(await searchNimble("q")).toEqual({ results: [], mode: "live" });
  });
  it("bounds response size", async () => {
    fetchMock.mockResolvedValue(Response.json({ results: [], oversized: "x".repeat(2 * 1024 * 1024) }));
    await expect(searchNimble("q")).rejects.toMatchObject({ code: "INVALID_PROVIDER_RESPONSE" });
  });
  it("times out even when fetch ignores abort", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const pending = expect(searchNimble("q")).rejects.toMatchObject({ code: "SEARCH_TIMEOUT", status: 504 });
    await vi.advanceTimersByTimeAsync(NIMBLE_TIMEOUT_MS);
    await pending;
  });
});
