import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { POST } from "./route";
import { demoResponse } from "@/lib/fixtures";

const fetchMock = vi.fn<typeof fetch>();
function request(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/search", {
    method: "POST", headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("DEMO_MODE", "");
  vi.stubEnv("EXA_API_KEY", "valid-server-key");
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("POST /api/search", () => {
  it("trims the query, returns live results, and performs exactly one provider request", async () => {
    fetchMock.mockResolvedValue(Response.json({ results: [] }));
    const response = await POST(request({ query: "  thoughtful\nwriting  " }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ results: [], mode: "live" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string).query).toBe("thoughtful\nwriting");
  });
  it("labels only results whose Substack metadata confirms paid access", async () => {
    const makeArticle = (slug: string) => ({ title: slug, url: `https://writer.substack.com/p/${slug}` });
    const paid = makeArticle("paid-post");
    const free = makeArticle("free-post");
    const unavailable = makeArticle("unknown-post");
    const wrong = makeArticle("wrong-post");
    fetchMock.mockResolvedValueOnce(Response.json({ results: [paid, { ...free, paid: true }, unavailable, wrong] }));
    fetchMock.mockImplementation(async (input) => {
      const endpoint = new URL(String(input));
      expect(endpoint.origin).toBe("https://writer.substack.com");
      expect(endpoint.pathname).toMatch(/^\/api\/v1\/posts\//);
      switch (endpoint.pathname.split("/").at(-1)) {
        case "paid-post": return Response.json({ slug: "paid-post", audience: "only_paid" });
        case "free-post": return Response.json({ slug: "free-post", audience: "everyone" });
        case "wrong-post": return Response.json({ slug: "different-post", audience: "founding" });
        default: return new Response(null, { status: 403 });
      }
    });
    const response = await POST(request({ query: "query" }));
    expect(await response.json()).toEqual({ results: [{ ...paid, paid: true }, free, unavailable, wrong], mode: "live" });
  });
  it.each(["a", "a".repeat(300), ` ${"a".repeat(300)} `])("accepts valid query length boundaries", async (query) => {
    fetchMock.mockResolvedValue(Response.json({ results: [] }));
    expect((await POST(request({ query }))).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([null, [], {}, { query: null }, { query: 42 }, { query: {} }, { query: ["text"] },
    { query: "" }, { query: " \n\t" }, { query: "a".repeat(301) }, { query: "bad\u0000query" }])(
    "rejects invalid query shapes and boundaries before upstream work", async (body) => {
      const response = await POST(request(body));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: { code: "INVALID_QUERY", message: "Enter a research question of 1–300 characters." },
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it.each(["{", "", "undefined"])("rejects invalid JSON", async (body) => {
    const response = await POST(new Request("http://localhost/api/search", {
      method: "POST", headers: { "content-type": "application/json" }, body,
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "INVALID_JSON", message: "Send a valid JSON request body." },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects non-JSON media types", async () => {
    const response = await POST(request({ query: "query" }, { "content-type": "text/plain" }));
    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({
      error: { code: "INVALID_CONTENT_TYPE", message: "Send a JSON request body." },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("accepts JSON charset parameters", async () => {
    vi.stubEnv("DEMO_MODE", "1");
    expect((await POST(request({ query: "query" }, { "content-type": "application/json; charset=utf-8" }))).status).toBe(200);
  });
  it.each([
    [{ query: "query", padding: "x".repeat(8192) }, {}],
    [{ query: "query" }, { "content-length": "8193" }],
    [{ query: "query", padding: "界".repeat(3000) }, { "content-length": "20" }],
  ] as const)("bounds bytes regardless of Content-Length", async (body, headers) => {
    const response = await POST(request(body, headers));
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      error: { code: "REQUEST_TOO_LARGE", message: "The request body is too large." },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("accepts a body at exactly the byte limit", async () => {
    vi.stubEnv("DEMO_MODE", "1");
    const paddingLength = 8192 - JSON.stringify({ query: "q", padding: "" }).length;
    expect((await POST(request({ query: "q", padding: "x".repeat(paddingLength) }))).status).toBe(200);
  });
  it("bounds time spent reading the request body", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const body = new ReadableStream({ cancel });
    const input = new Request("http://localhost/api/search", {
      method: "POST", headers: { "content-type": "application/json" }, body, duplex: "half",
    } as RequestInit);
    const pending = POST(input);
    await vi.advanceTimersByTimeAsync(5000);
    const response = await pending;
    expect(response.status).toBe(408);
    expect(await response.json()).toEqual({
      error: { code: "REQUEST_TIMEOUT", message: "The request took too long. Please try again." },
    });
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("returns fixtures only in explicit demo mode and never calls upstream, even without a key", async () => {
    vi.stubEnv("DEMO_MODE", "1");
    vi.stubEnv("EXA_API_KEY", undefined);
    const response = await POST(request({ query: "any valid question" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(demoResponse);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("still validates demo input", async () => {
    vi.stubEnv("DEMO_MODE", "1");
    expect((await POST(request({ query: "" }))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(["", "0", "true"])("does not silently enable demo with mode %s", async (mode) => {
    vi.stubEnv("DEMO_MODE", mode);
    vi.stubEnv("EXA_API_KEY", undefined);
    const response = await POST(request({ query: "query" }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: { code: "SEARCH_NOT_CONFIGURED", message: "Live search is not configured. Set a valid EXA_API_KEY on the server." },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("returns safe provider failures and never falls back to fixtures", async () => {
    fetchMock.mockRejectedValue(new Error("SECRET details"));
    const response = await POST(request({ query: "query" }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: { code: "SEARCH_UNAVAILABLE", message: "Search is temporarily unavailable. Please try again." },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("returns the upstream timeout status and retry message", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const pending = POST(request({ query: "query" }));
    await vi.advanceTimersByTimeAsync(10000);
    const response = await pending;
    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({
      error: { code: "SEARCH_TIMEOUT", message: "Search took too long. Please try again." },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
