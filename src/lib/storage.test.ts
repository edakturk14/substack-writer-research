import { describe, expect, it } from "vitest";
import { demoArticles } from "./fixtures";
import { readSavedArticles, SAVED_STORAGE_KEY, STORAGE_UNAVAILABLE, writeSavedArticles } from "./storage";
import type { Article } from "./contracts";

function memoryStorage(initial: string | null = null) {
  const entries = new Map<string, string>();
  if (initial !== null) entries.set(SAVED_STORAGE_KEY, initial);
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); },
  };
}

describe("saved articles", () => {
  it("returns an empty list without creating or overwriting storage", () => {
    const storage = memoryStorage();
    expect(readSavedArticles(storage)).toEqual({ articles: [], warning: null });
    expect(storage.getItem(SAVED_STORAGE_KEY)).toBeNull();
  });

  it("preserves an existing reading list on initialization and round trips card fields", () => {
    const storage = memoryStorage(JSON.stringify(demoArticles));
    const before = storage.getItem(SAVED_STORAGE_KEY);
    expect(readSavedArticles(storage).articles).toEqual(demoArticles);
    expect(storage.getItem(SAVED_STORAGE_KEY)).toBe(before);
    expect(writeSavedArticles(storage, demoArticles).success).toBe(true);
    expect(readSavedArticles(storage).articles).toEqual(demoArticles);
  });

  it("deduplicates tracking links, fragments, and trailing slashes by identity", () => {
    const article = demoArticles[0];
    const duplicate = { ...article, url: `${article.url}/?utm_source=test#section` };
    const storage = memoryStorage(JSON.stringify([article, duplicate]));
    expect(readSavedArticles(storage).articles).toHaveLength(1);
    writeSavedArticles(storage, [article, duplicate]);
    expect(JSON.parse(storage.getItem(SAVED_STORAGE_KEY)!)).toHaveLength(1);
  });

  it("removes unknown fields on read and write", () => {
    const value = { ...demoArticles[0], providerPayload: "not stored", secret: "not stored" };
    const storage = memoryStorage(JSON.stringify([value]));
    expect(readSavedArticles(storage).articles).toEqual([demoArticles[0]]);
    writeSavedArticles(storage, [value]);
    expect(JSON.parse(storage.getItem(SAVED_STORAGE_KEY)!)).toEqual([demoArticles[0]]);
  });

  it.each(["{broken", "null", '{"articles":[]}', "42"])("recovers malformed storage: %s", (raw) => {
    const storage = memoryStorage(raw);
    const state = readSavedArticles(storage);
    expect(state.articles).toEqual([]);
    expect(state.warning).toContain("could not be read");
    expect(storage.getItem(SAVED_STORAGE_KEY)).toBe(raw);
    expect(writeSavedArticles(storage, demoArticles).success).toBe(true);
    expect(readSavedArticles(storage).articles).toEqual(demoArticles);
  });

  it("keeps valid entries while reporting invalid entries", () => {
    const storage = memoryStorage(JSON.stringify([null, { title: "Unsafe", url: "javascript:alert(1)" }, demoArticles[0]]));
    const state = readSavedArticles(storage);
    expect(state.articles).toEqual([demoArticles[0]]);
    expect(state.warning).toContain("Some saved entries");
  });

  it("validates writes even when the caller passes malformed runtime values", () => {
    const storage = memoryStorage();
    const result = writeSavedArticles(storage, [{ title: "Unsafe", url: "javascript:alert(1)" } as Article, demoArticles[0]]);
    expect(result.success).toBe(true);
    expect(readSavedArticles(storage).articles).toEqual([demoArticles[0]]);
    expect(result.state.warning).not.toBeNull();
  });

  it("returns feedback when reads are blocked", () => {
    const storage = { getItem: () => { throw new Error("denied"); }, setItem: () => {} };
    expect(readSavedArticles(storage)).toEqual({ articles: [], warning: STORAGE_UNAVAILABLE });
  });

  it("reports write failure and leaves the stored list intact", () => {
    const storage = memoryStorage(JSON.stringify(demoArticles));
    const blocked = { ...storage, setItem: () => { throw new Error("quota exceeded"); } };
    const result = writeSavedArticles(blocked, []);
    expect(result.success).toBe(false);
    expect(result.state.warning).toContain("could not be saved");
    expect(readSavedArticles(storage).articles).toEqual(demoArticles);
  });

  it("persists removal as an empty list", () => {
    const storage = memoryStorage(JSON.stringify(demoArticles));
    writeSavedArticles(storage, []);
    expect(readSavedArticles(storage).articles).toEqual([]);
  });
});
