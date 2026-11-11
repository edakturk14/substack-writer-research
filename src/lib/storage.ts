import { articleIdentity, parseArticle } from "./articles";
import type { Article } from "./contracts";

export const SAVED_STORAGE_KEY = "substack-writer-research:saved:v1";
export const STORAGE_UNAVAILABLE =
  "Browser storage is unavailable. Your reading list cannot be saved on this device.";

type StorageAccess = Pick<Storage, "getItem" | "setItem">;
export type SavedState = { articles: Article[]; warning: string | null };

function normalize(values: unknown[]): SavedState {
  const articles: Article[] = [];
  const identities = new Set<string>();
  let invalid = false;
  for (const value of values) {
    const article = parseArticle(value);
    if (!article) {
      invalid = true;
      continue;
    }
    const identity = articleIdentity(article.url);
    if (!identities.has(identity)) {
      identities.add(identity);
      articles.push(article);
    }
  }
  return {
    articles,
    warning: invalid
      ? "Some saved entries could not be read and were left out. You can save those articles again."
      : null,
  };
}

export function readSavedArticles(storage: StorageAccess): SavedState {
  try {
    const raw = storage.getItem(SAVED_STORAGE_KEY);
    if (raw === null) return { articles: [], warning: null };
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      return { articles: [], warning: "Your saved list could not be read. Save an article to start a new list." };
    }
    if (!Array.isArray(value)) {
      return { articles: [], warning: "Your saved list could not be read. Save an article to start a new list." };
    }
    return normalize(value);
  } catch {
    return { articles: [], warning: STORAGE_UNAVAILABLE };
  }
}

export function writeSavedArticles(
  storage: StorageAccess,
  values: Article[],
): { success: boolean; state: SavedState } {
  const state = normalize(values);
  try {
    storage.setItem(SAVED_STORAGE_KEY, JSON.stringify(state.articles));
    return { success: true, state };
  } catch {
    return {
      success: false,
      state: { articles: state.articles, warning: "Your change could not be saved. Browser storage may be full or blocked. Your reading list has not changed." },
    };
  }
}
