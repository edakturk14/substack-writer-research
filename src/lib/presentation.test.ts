import { describe, expect, test } from "vitest";
import type { Article } from "./contracts";
import { articlePage, EXCERPT_LENGTH, shortExcerpt, sortArticles } from "./presentation";

const articles: Article[] = [
  { url: "https://example.substack.com/p/first", title: "First", publishedDate: "2024-01-01" },
  { url: "https://example.substack.com/p/second", title: "Second" },
  { url: "https://example.substack.com/p/third", title: "Third", publishedDate: "2026-03-01" },
  { url: "https://example.substack.com/p/fourth", title: "Fourth", publishedDate: "2024-01-01" },
  { url: "https://example.substack.com/p/fifth", title: "Fifth", publishedDate: "invalid" },
];
const titles = (items: Article[]) => items.map((item) => item.title);

describe("article ordering", () => {
  test("relevance preserves provider order without mutating the input", () => {
    expect(sortArticles(articles, "relevance")).toEqual(articles);
    expect(sortArticles(articles, "relevance")).not.toBe(articles);
    sortArticles(articles, "newest");
    expect(articles[0].title).toBe("First");
  });
  test("newest puts unknown dates last and keeps equal dates stable", () => {
    expect(titles(sortArticles(articles, "newest"))).toEqual(["Third", "First", "Fourth", "Second", "Fifth"]);
  });
  test("oldest puts unknown dates last", () => {
    expect(titles(sortArticles(articles, "oldest"))).toEqual(["First", "Fourth", "Third", "Second", "Fifth"]);
  });
  test("compares timestamp offsets, not date strings", () => {
    const dates = [{ ...articles[0], publishedDate: "2026-01-01T01:00:00+03:00" }, { ...articles[2], publishedDate: "2025-12-31T23:00:00Z" }];
    expect(sortArticles(dates, "newest")[0].title).toBe("Third");
  });
});

describe("five articles per page", () => {
  test.each([0, 1, 5, 6, 10, 11, 101])("handles a %i-article collection without gaps or duplicates", (count) => {
    const collection = Array.from({ length: count }, (_, index) => ({ ...articles[0], title: String(index) }));
    const { pageCount } = articlePage(collection, 1);
    const combined = Array.from({ length: pageCount }, (_, index) => articlePage(collection, index + 1).articles).flat();
    expect(combined).toEqual(collection);
    expect(articlePage(collection, 1).articles.length).toBeLessThanOrEqual(5);
  });
  test("clamps an empty final page after a removal", () => {
    expect(articlePage(articles, 2)).toMatchObject({ page: 1, pageCount: 1, start: 0 });
  });
  test("never uses negative page offsets", () => {
    expect(articlePage(articles, -1).page).toBe(1);
  });
  test("sorts the whole set before slicing, not each page", () => {
    const collection = [...articles, { ...articles[0], title: "Newest", publishedDate: "2026-11-11" }];
    expect(articlePage(sortArticles(collection, "newest"), 1).articles[0].title).toBe("Newest");
  });
});

describe("short plain-text passages", () => {
  test.each([EXCERPT_LENGTH - 1, EXCERPT_LENGTH, EXCERPT_LENGTH + 1, 1200])("caps %i characters including the ellipsis", (length) => {
    const text = "x".repeat(length);
    const shortened = shortExcerpt(text);
    expect(Array.from(shortened).length).toBeLessThanOrEqual(EXCERPT_LENGTH);
    expect(shortened.endsWith("…")).toBe(length > EXCERPT_LENGTH);
  });
  test("keeps short excerpts unchanged", () => {
    expect(shortExcerpt("An original passage.")).toBe("An original passage.");
  });
  test("truncates at a word boundary and adds no invented words", () => {
    const text = "An original passage. ".repeat(40);
    const excerpt = shortExcerpt(text);
    expect(excerpt.endsWith("…")).toBe(true);
    expect(text.startsWith(excerpt.slice(0, -1))).toBe(true);
    expect(excerpt).not.toMatch(/\s…$/);
  });
  test("does not split Unicode surrogate pairs", () => {
    const excerpt = shortExcerpt("💡".repeat(301));
    expect(excerpt).toBe(`${"💡".repeat(299)}…`);
  });
});
