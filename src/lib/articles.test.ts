import { describe, expect, it } from "vitest";
import { articleIdentity, parseArticle, parseSearchResponse, validateArticleUrl } from "./articles";
import { demoResponse } from "./fixtures";

const article = { title: "An article", url: "https://writer.substack.com/p/an-article" };

describe("validateArticleUrl", () => {
  it.each([
    article.url,
    "https://substack.com/p/an-article",
    "https://substack.com/@writer/p/an-article",
    "https://www.substack.com/@writer/p/an-article/",
    "HTTPS://Writer.Substack.Com:443/p/an-article/?utm_source=test#section",
    "https://writer.substack.com/p/Article_2?redirect=https://evil.example",
  ])("preserves the supplied validated destination: %s", (url) => {
    expect(validateArticleUrl(url)).toBe(url);
  });

  it.each([
    null, undefined, 1, {}, [], "",
    "http://writer.substack.com/p/article",
    "javascript:alert(1)", "//writer.substack.com/p/article",
    "https://substack.com.evil.example/p/article",
    "https://ev il.substack.com/p/article",
    "https://evilsubstack.com/p/article",
    "https://a.b.substack.com/p/article",
    "https://-writer.substack.com/p/article",
    "https://writer-.substack.com/p/article",
    "https://writer.substack.com./p/article",
    "https://ｗriter.substack.com/p/article",
    "https://writer.substack.com:444/p/article",
    "https://writer.substack.com:80/p/article",
    "https://evil.example@writer.substack.com/p/article",
    "https://writer.substack.com@evil.example/p/article",
    "https://user:password@writer.substack.com/p/article",
    "https://@writer.substack.com/p/article",
    "https://writer.substack.com\\p\\article",
    " https://writer.substack.com/p/article",
    "https://writer.substack.com/p/article\n",
    "https://writer.substack.com/p/article?x=\t",
    "https://writer.substack.com/",
    "https://writer.substack.com/archive",
    "https://writer.substack.com/about",
    "https://writer.substack.com/subscribe",
    "https://substack.com/@writer",
    "https://substack.com/@writer/note/c-123",
    "https://writer.substack.com/@writer/p/article",
    "https://writer.substack.com/p/",
    "https://writer.substack.com/p/article/comments",
    "https://writer.substack.com/p/article//",
    "https://writer.substack.com/../p/article",
    "https://writer.substack.com/p/%2e%2e",
    "https://writer.substack.com/p/%61rticle",
    "https://writer.substack.com/p/a%2fb",
    `https://writer.substack.com/p/${"a".repeat(4096)}`,
  ])("rejects an unsafe or nonarticle destination: %s", (url) => {
    expect(validateArticleUrl(url)).toBeNull();
  });
});

describe("articleIdentity", () => {
  it("normalizes host, standard port, query, fragment and trailing slash separately", () => {
    expect(articleIdentity("HTTPS://WRITER.SUBSTACK.COM:443/p/an-article/?utm_source=x#x"))
      .toBe(articleIdentity(article.url));
    expect(articleIdentity("https://www.substack.com/@writer/p/post/"))
      .toBe(articleIdentity("https://substack.com/@writer/p/post"));
  });
  it("preserves distinct publications and case-sensitive paths; rejects unsafe input", () => {
    expect(articleIdentity(article.url)).not.toBe(articleIdentity("https://other.substack.com/p/an-article"));
    expect(articleIdentity(article.url)).not.toBe(articleIdentity("https://writer.substack.com/p/An-article"));
    expect(articleIdentity("not a URL")).toBe("");
    expect(articleIdentity("https://evil.example/p/article")).toBe("");
  });
});

describe("parseArticle", () => {
  it.each([null, undefined, true, 3, [], {}, { ...article, title: [] },
    { ...article, title: " \n\u0000" }, { ...article, title: "a".repeat(100001) },
    { ...article, url: "https://evil.example/p/article" }])("rejects malformed required data", (value) => {
    expect(parseArticle(value)).toBeNull();
  });
  it("allowlists fields, normalizes text, and keeps markup as inert plain text", () => {
    expect(parseArticle({
      ...article, title: "  A\n title  ", excerpt: "<img src=x onerror=alert(1)>",
      author: " Writer\tName ", publication: " Some publication ", publishedDate: "2024-02-29",
      html: "<script>bad()</script>", summary: "generated", __proto__: { danger: true },
    })).toEqual({
      url: article.url, title: "A title", excerpt: "<img src=x onerror=alert(1)>",
      author: "Writer Name", publication: "Some publication", publishedDate: "2024-02-29",
    });
  });
  it("discards invalid optional fields rather than coercing objects", () => {
    expect(parseArticle({
      ...article, excerpt: { html: "bad" }, author: ["name"],
      publication: 3, publishedDate: {}, extra: "discard me",
    })).toEqual(article);
  });
  it("bounds renderable lengths and drops exceptionally large optional text", () => {
    const parsed = parseArticle({ ...article, title: "x".repeat(301), author: "a".repeat(161),
      publication: "b".repeat(161), excerpt: "c".repeat(1201) })!;
    expect(parsed.title).toHaveLength(300);
    expect(parsed.author).toHaveLength(160);
    expect(parsed.publication).toHaveLength(160);
    expect(parsed.excerpt).toHaveLength(1200);
    expect(parsed.excerpt?.endsWith("…")).toBe(true);
    expect(parseArticle({ ...article, excerpt: "x".repeat(100001) })).toEqual(article);
  });
  it.each(["2024-02-29", "2024-01-01T12:30:40Z", "2024-01-01T12:30:40.123+02:00"])(
    "accepts valid ISO dates: %s", (publishedDate) => {
      expect(parseArticle({ ...article, publishedDate })?.publishedDate).toBe(publishedDate);
    },
  );
  it.each(["2023-02-29", "2024-02-30", "2024-13-01", "2024-00-01", "2024-01-00",
    "2024-01-32", "2024-01-01T24:00:00Z", "2024-01-01T12:60:00Z",
    "2024-01-01T12:00:60Z", "2024-01-01T12:00:00+25:00",
    "2024-01-01T12:00:00+01:60", "2024-01-01T12:00:00", "yesterday", "1", "", null])(
    "drops invalid dates: %s", (publishedDate) => {
      expect(parseArticle({ ...article, publishedDate })?.publishedDate).toBeUndefined();
    },
  );
});

describe("parseSearchResponse", () => {
  it.each([null, [], {}, { results: [], mode: "other" }, { results: {}, mode: "live" },
    { results: new Array(1001).fill(article), mode: "live" }])("rejects malformed envelopes", (value) => {
    expect(parseSearchResponse(value)).toBeNull();
  });
  it("accepts empty and demo results", () => {
    expect(parseSearchResponse({ results: [], mode: "live" })).toEqual({ results: [], mode: "live" });
    expect(parseSearchResponse(demoResponse)).toEqual(demoResponse);
  });
  it("filters before deduplicating, preserves first original URL and provider order, caps at ten", () => {
    const candidates = [
      null, { ...article, title: "" }, article,
      { ...article, title: "Duplicate", url: `${article.url}/?utm_source=x#section` },
      ...Array.from({ length: 20 }, (_, i) => ({ title: `Post ${i}`, url: `https://writer.substack.com/p/post-${i}` })),
    ];
    const result = parseSearchResponse({ results: candidates, mode: "live", secret: "discard" })!;
    expect(result.results).toHaveLength(10);
    expect(result.results[0]).toEqual(article);
    expect(result.results.slice(1).map((item) => item.title)).toEqual(
      Array.from({ length: 9 }, (_, i) => `Post ${i}`),
    );
    expect(Object.keys(result)).toEqual(["results", "mode"]);
  });
});
