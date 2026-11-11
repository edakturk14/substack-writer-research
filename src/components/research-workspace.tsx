"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { articleIdentity, parseSearchResponse } from "@/lib/articles";
import { MAX_QUERY_LENGTH, type Article, type SearchResponse } from "@/lib/contracts";
import { articlePage, PAGE_SIZE, shortExcerpt, sortArticles, type ArticleSort } from "@/lib/presentation";
import {
  readSavedArticles,
  SAVED_STORAGE_KEY,
  STORAGE_UNAVAILABLE,
  writeSavedArticles,
  type SavedState,
} from "@/lib/storage";
import styles from "@/app/page.module.css";

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <span aria-hidden="true">{diagonal ? "↗" : "→"}</span>;
}

function safeSearchError(status: number, body: unknown): string {
  const code = body && typeof body === "object" && "error" in body
    && body.error && typeof body.error === "object" && "code" in body.error
    ? body.error.code : null;
  // Choose our own copy by known code; never display upstream error text.
  if (code === "SEARCH_NOT_CONFIGURED") return "Live search is not configured. Set a valid EXA_API_KEY on the server.";
  if (code === "SEARCH_AUTH_FAILED") return "Live search could not authenticate. Check the server's EXA_API_KEY.";
  if (status === 503) return "Search is temporarily unavailable. Please try again.";
  if (status === 504 || status === 408) return "Search took too long. Please try again.";
  if (status === 429) return "Search is busy right now. Please wait a moment and try again.";
  if (status === 400) return `Enter a research question between 1 and ${MAX_QUERY_LENGTH} characters.`;
  return "We couldn’t complete your search. Please try again.";
}

function dateLabel(value: string): string | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function ArticleCard({ article, saved, savedView, onSave, onRemove, storageReady }: {
  article: Article;
  saved: boolean;
  savedView: boolean;
  onSave: () => void;
  onRemove: () => void;
  storageReady: boolean;
}) {
  const date = article.publishedDate ? dateLabel(article.publishedDate) : null;
  return (
    <article className={styles.article}>
      <h3>{article.title}</h3>
      <div className={styles.metadata}>
        <span className={styles.publication}>{article.publication || new URL(article.url).hostname}</span>
        {article.author && <span>By {article.author}</span>}
        {date && <time dateTime={article.publishedDate}>{date}</time>}
      </div>
      {article.excerpt && <p className={styles.excerpt}>{shortExcerpt(article.excerpt)}</p>}
      <div className={styles.cardActions}>
        <a href={article.url} target="_blank" rel="noopener noreferrer" title="Opens in a new tab">
          Open original <Arrow diagonal />
        </a>
        <button
          type="button"
          className={styles.saveButton}
          disabled={!storageReady || (!savedView && saved)}
          onClick={savedView ? onRemove : onSave}
        >
          <span aria-hidden="true">{savedView ? "−" : saved ? "✓" : "+"}</span>
          {savedView ? "Remove" : saved ? "Saved" : "Save"}
        </button>
      </div>
    </article>
  );
}

export default function ResearchWorkspace({ demoMode }: { demoMode: boolean }) {
  const [view, setView] = useState<"search" | "saved">("search");
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedState, setSavedState] = useState<SavedState>({ articles: [], warning: null });
  const [storageReady, setStorageReady] = useState(false);
  const [saveNotice, setSaveNotice] = useState("");
  const [pages, setPages] = useState({ search: 1, saved: 1 });
  const [sorts, setSorts] = useState<{ search: ArticleSort; saved: ArticleSort }>({ search: "relevance", saved: "relevance" });
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsHeadingRef = useRef<HTMLHeadingElement>(null);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const loadSaved = () => {
      try {
        setSavedState(readSavedArticles(window.localStorage));
      } catch {
        setSavedState({ articles: [], warning: STORAGE_UNAVAILABLE });
      }
      setStorageReady(true);
    };
    // Read after hydration; never persist the initial empty React state.
    const frame = window.requestAnimationFrame(loadSaved);
    const onStorage = (event: StorageEvent) => {
      if (event.key === SAVED_STORAGE_KEY || event.key === null) loadSaved();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("storage", onStorage);
      requestRef.current?.abort();
    };
  }, []);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestRef.current) return;
    const trimmed = query.trim();
    if (!trimmed || trimmed.length > MAX_QUERY_LENGTH) {
      setError(`Enter a research question between 1 and ${MAX_QUERY_LENGTH} characters.`);
      inputRef.current?.focus();
      return;
    }
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError(null);
    setResponse(null);
    setPages((previous) => ({ ...previous, search: 1 }));
    setSubmittedQuery(trimmed);
    const timeout = window.setTimeout(() => controller.abort(), 30000);
    try {
      const result = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
        signal: controller.signal,
      });
      if (!result.ok) {
        setError(safeSearchError(result.status, await result.json().catch(() => null)));
        return;
      }
      const parsed = parseSearchResponse(await result.json());
      if (!parsed) {
        setError("The search returned an unreadable response. Please try again.");
        return;
      }
      setResponse(parsed);
    } catch {
      setError(controller.signal.aborted
        ? "The search took too long. Your question is still here; please try again."
        : "We couldn’t reach search. Check your connection and try again.");
    } finally {
      window.clearTimeout(timeout);
      requestRef.current = null;
      setLoading(false);
    }
  }

  function updateSaved(article: Article, remove: boolean) {
    if (!storageReady) return;
    try {
      // Re-read at the moment of a user action to preserve changes in other tabs.
      const current = readSavedArticles(window.localStorage);
      if (current.warning === STORAGE_UNAVAILABLE) {
        setSavedState((previous) => ({ ...previous, warning: STORAGE_UNAVAILABLE }));
        return;
      }
      const identity = articleIdentity(article.url);
      const next = remove
        ? current.articles.filter((item) => articleIdentity(item.url) !== identity)
        : [...current.articles, article];
      const result = writeSavedArticles(window.localStorage, next);
      if (result.success) {
        setSavedState(result.state);
        setPages((previous) => ({
          ...previous,
          saved: Math.min(previous.saved, Math.max(1, Math.ceil(result.state.articles.length / PAGE_SIZE))),
        }));
        setSaveNotice(remove ? "Article removed from your reading list." : "Article saved to your reading list.");
      } else {
        setSavedState((previous) => ({ ...previous, warning: result.state.warning }));
      }
    } catch {
      setSavedState((previous) => ({ ...previous, warning: STORAGE_UNAVAILABLE }));
    }
  }

  const isDemo = demoMode || response?.mode === "demo";
  const articles = view === "saved" ? savedState.articles : response?.results ?? [];
  const pagination = articlePage(sortArticles(articles, sorts[view]), pages[view]);
  const changePage = (page: number) => {
    setPages((previous) => ({ ...previous, [view]: page }));
    resultsHeadingRef.current?.focus({ preventScroll: true });
    resultsHeadingRef.current?.scrollIntoView({ block: "start" });
  };
  const savedIds = new Set(savedState.articles.map((article) => articleIdentity(article.url)));
  const statusText = loading
    ? "Searching for articles. Your question is still here."
    : response
      ? `${response.results.length} ${response.results.length === 1 ? "article" : "articles"} ${response.mode === "demo" ? "in these fixed examples" : "found"}.`
      : "";

  return (
    <div className={styles.page}>
      <a className={styles.skipLink} href="#main">Skip to content</a>
      <header className={styles.header}>
        <span className={styles.brandName}>Substack Writer Research</span>
        <nav className={styles.navigation} aria-label="Workspace views">
          <button type="button" aria-pressed={view === "search"} onClick={() => setView("search")}>Search</button>
          <button type="button" aria-pressed={view === "saved"} onClick={() => setView("saved")}>
            Saved <span className={styles.count} aria-hidden="true">{savedState.articles.length}</span>
          </button>
        </nav>
      </header>

      <main id="main" className={styles.main}>
        {isDemo && <div className={styles.demoBanner}><span className={styles.demoDot} aria-hidden="true" /><strong>Demo mode</strong><span>Fixed examples, not live search results. Every question returns the same articles.</span></div>}

        {view === "search" ? (
          <>
            <section className={styles.pageHeading} aria-labelledby="page-title">
              <h1 id="page-title">Search Substack posts</h1>
            </section>
            <section className={styles.searchSection} aria-label="Article search">
              <form onSubmit={search} className={styles.form}>
                <label htmlFor="research-question">Research question</label>
                <div className={styles.inputRow}>
                  <input
                    ref={inputRef}
                    id="research-question"
                    name="query"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="A topic or question"
                    maxLength={MAX_QUERY_LENGTH}
                    aria-describedby="search-hint"
                    readOnly={loading}
                    autoComplete="off"
                  />
                  <button className={styles.searchButton} type="submit" disabled={loading}>
                    {loading ? "Searching…" : "Search"} <Arrow />
                  </button>
                </div>
                <p id="search-hint" className={styles.hint}>Search by topic or question. Up to 10 posts per search.</p>
              </form>
            </section>
          </>
        ) : (
          <section className={styles.pageHeading} aria-labelledby="page-title">
            <h1 id="page-title">Saved articles</h1>
            <p>Saved in this browser, on this device.</p>
          </section>
        )}

        <p className={styles.srOnly} role="status" aria-live="polite">{statusText} {saveNotice}</p>
        {savedState.warning && <p className={styles.warning} role="status">{savedState.warning}</p>}

        <section className={styles.readingSection} aria-label={view === "saved" ? "Saved reading list" : "Search results"} aria-busy={view === "search" && loading}>
          <div className={styles.sectionHeading}>
            <h2 ref={resultsHeadingRef} tabIndex={-1}>{view === "saved" ? "Reading list" : response?.mode === "demo" ? "Fixed example articles" : "Search results"}</h2>
            {(view === "saved" || response) && <span>{view === "saved" ? `${articles.length} saved` : `${articles.length} ${articles.length === 1 ? "article" : "articles"}`}</span>}
          </div>
          {view === "search" && error ? (
            <div className={styles.feedback} role="alert">
              <h3>Search couldn’t finish.</h3>
              <p>{error}</p>
              <p className={styles.retryHint}>Your question is still in the field above. Select Search to retry.</p>
            </div>
          ) : view === "search" && loading ? (
            <div className={styles.feedback}>
              <span className={styles.loadingMark} aria-hidden="true" />
              <h3>Searching posts…</h3>
              <p>{demoMode ? "Opening the fixed example articles." : `Looking for articles on “${submittedQuery}”.`}</p>
            </div>
          ) : articles.length ? (
            <>
              {view === "search" && response?.mode === "live" && <p className={styles.querySummary}>For “{submittedQuery}”</p>}
              <div className={styles.resultsToolbar}>
                <p role="status">Showing {pagination.start + 1}–{pagination.start + pagination.articles.length} of {articles.length}</p>
                <div className={styles.sortControl}>
                  <label htmlFor="article-sort">Sort by</label>
                  <select id="article-sort" value={sorts[view]} onChange={(event) => {
                    setSorts((previous) => ({ ...previous, [view]: event.target.value as ArticleSort }));
                    setPages((previous) => ({ ...previous, [view]: 1 }));
                  }}>
                    <option value="relevance">{view === "saved" ? "Saved order" : response?.mode === "demo" ? "Example order" : "Relevance"}</option>
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                  </select>
                </div>
              </div>
              {sorts[view] !== "relevance" && <p className={styles.resultsNote}>Sorted by publication date. Undated articles appear last.</p>}
              <div className={styles.articleList}>
                {pagination.articles.map((article) => (
                  <ArticleCard key={articleIdentity(article.url)} article={article}
                    saved={savedIds.has(articleIdentity(article.url))} savedView={view === "saved"}
                    storageReady={storageReady} onSave={() => updateSaved(article, false)} onRemove={() => updateSaved(article, true)} />
                ))}
              </div>
              {pagination.pageCount > 1 && (
                <nav className={styles.pagination} aria-label="Article pages">
                  <button type="button" disabled={pagination.page === 1} onClick={() => changePage(pagination.page - 1)}>Previous</button>
                  <span aria-live="polite">Page {pagination.page} of {pagination.pageCount}</span>
                  <button type="button" disabled={pagination.page === pagination.pageCount} onClick={() => changePage(pagination.page + 1)}>Next</button>
                </nav>
              )}
            </>
          ) : view === "saved" ? (
            <div className={styles.feedback}>
              <h3>{storageReady ? "No saved articles yet." : "Opening your reading list…"}</h3>
              <p>Choose Save on any search result to keep it here for later.</p>
              <button className={styles.textButton} type="button" onClick={() => { setView("search"); }}>Search posts <Arrow /></button>
            </div>
          ) : response ? (
            <div className={styles.feedback}>
              <h3>No articles found.</h3>
              <p>Try a broader topic or a different phrasing. Your question is still above, ready to edit.</p>
            </div>
          ) : (
            <div className={styles.feedback}>
              <p>Enter a topic or question above to find posts.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
