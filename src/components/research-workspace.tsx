"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import SiteHeader from "@/components/site-header";
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

const starterPrompts = [
  "Moving to New York in your 30s",
  "What to see and do in Bryce Canyon in November",
  "Using AI agents to manage your personal finances",
];

function Arrow({ diagonal = true }: { diagonal?: boolean }) {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={diagonal ? "M4 12 12 4M6 4h6v6" : "M2 8h11m-5-5 5 5-5 5"} />
    </svg>
  );
}

function Book() {
  return (
    <svg aria-hidden="true" width="82" height="38" viewBox="0 0 100 46" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M50 40C35 30 18 31 3 36L17 10C30 2 42 10 50 29 58 10 70 2 83 10L97 36C82 31 65 30 50 40Z" />
      <path d="M50 40V29M8 31C25 24 37 29 50 36 63 29 75 24 92 31M11 25C27 19 39 25 50 33 61 25 73 19 89 25M14 19C29 14 41 21 50 30 59 21 71 14 86 19M3 36C23 32 36 35 50 40 64 35 77 32 97 36" />
    </svg>
  );
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

const numberFormat = new Intl.NumberFormat("en-US");

function countLabel(count: number | undefined, singular: string): string | undefined {
  if (count === undefined) return;
  return `${numberFormat.format(count)} ${singular}${count === 1 ? "" : "s"}`;
}

function ArticleCard({ article, saved, savedView, onSave, onRemove, storageReady, revealKey, revealed, index }: {
  article: Article;
  saved: boolean;
  savedView: boolean;
  onSave: () => void;
  onRemove: () => void;
  storageReady: boolean;
  revealKey: string;
  revealed: Set<string>;
  index: number;
}) {
  const date = article.publishedDate ? dateLabel(article.publishedDate) : null;
  const excerpt = article.excerpt ? shortExcerpt(article.excerpt) : undefined;
  const engagement = countLabel(article.likes, "like") ?? countLabel(article.reactions, "reaction");
  const comments = countLabel(article.comments, "comment");
  const [animate] = useState(() => !savedView && !revealed.has(revealKey));
  useEffect(() => { revealed.add(revealKey); }, [revealed, revealKey]);
  return (
    <article className={`${styles.article} ${animate ? styles.resultArrival : ""}`} style={{ animationDelay: `${Math.min(index * 45, 400)}ms` }}>
      <h3>{article.title}</h3>
      <div className={styles.metadata}>
        {article.paid && <span className={styles.paid} title="Full post is for paid subscribers"><span aria-hidden="true">$</span> Paid</span>}
        <span className={styles.publication}>{article.publication || new URL(article.url).hostname}</span>
        {article.author && <span>By {article.author}</span>}
        {date && <time dateTime={article.publishedDate}>{date}</time>}
        {engagement && <span>{engagement}</span>}
        {comments && <span>{comments}</span>}
      </div>
      {excerpt && <p className={styles.excerpt}>{excerpt}</p>}
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
          <svg className={saved ? styles.bookmarked : ""} aria-hidden="true" width="15" height="18" viewBox="0 0 15 18" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.2"><path d="M3 2h9v14l-4.5-3L3 16Z" /></svg>
          {savedView ? "Remove" : saved ? "Saved" : "Save"}
        </button>
      </div>
    </article>
  );
}

export default function ResearchWorkspace({ demoMode, initialQuery, initialView }: {
  demoMode: boolean;
  initialQuery: string;
  initialView: "search" | "saved";
}) {
  const [view, setView] = useState(initialView);
  const [query, setQuery] = useState(initialQuery);
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedState, setSavedState] = useState<SavedState>({ articles: [], warning: null });
  const [storageReady, setStorageReady] = useState(false);
  const [saveNotice, setSaveNotice] = useState("");
  const [pages, setPages] = useState({ search: 1, saved: 1 });
  const [sorts, setSorts] = useState<{ search: ArticleSort; saved: ArticleSort }>({ search: "relevance", saved: "relevance" });
  const [resultVersion, setResultVersion] = useState(0);
  const [revealed] = useState(() => new Set<string>());
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
      setResultVersion((previous) => previous + 1);
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
  const showRanking = view === "search" && response?.mode === "live";
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
      <div className={styles.sky} aria-hidden="true" />
      <SiteHeader>
        <button type="button" aria-pressed={view === "search"} onClick={() => setView("search")}>Search</button>
        <button type="button" aria-pressed={view === "saved"} onClick={() => setView("saved")}>
          Saved <span className={styles.count} aria-hidden="true">{savedState.articles.length}</span>
        </button>
      </SiteHeader>

      <main id="main" className={styles.main}>
        {isDemo && <div className={styles.demoBanner}><strong>Demo mode</strong><span>Fixed examples, not live search results. Every question returns the same articles.</span></div>}

        {view === "search" ? (
          <>
            <section className={styles.pageHeading} aria-labelledby="page-title">
              <h1 id="page-title">Good writing is<br /><em>out there.</em></h1>
              <p>Find the Substack posts that get into the specifics.</p>
            </section>
            <section className={styles.searchSection} aria-label="Article search">
              <form onSubmit={search} className={styles.form}>
                <label htmlFor="research-question"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="6.7" cy="6.7" r="4.6" /><path d="m10 10 4 4" /></svg><span aria-hidden="true">SEARCH SUBSTACK</span><span className={styles.srOnly}>Research question</span></label>
                <div className={styles.inputRow}>
                  <input
                    ref={inputRef}
                    id="research-question"
                    name="query"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="What would you like to read about?"
                    maxLength={MAX_QUERY_LENGTH}
                    aria-describedby="search-hint"
                    readOnly={loading}
                    autoComplete="off"
                  />
                </div>
                <div className={styles.formBottom}>
                  <p id="search-hint" className={styles.hint}>Up to 10 posts per search.</p>
                  <button className={styles.searchButton} type="submit" disabled={loading}>
                    {loading && <span className={styles.buttonSpinner} aria-hidden="true" />}
                    {loading ? "Searching…" : "Search"} <Arrow />
                  </button>
                </div>
              </form>
              <div className={styles.starters}>
                <p>A FEW PLACES TO START</p>
                <div className={styles.starterList}>
                  {starterPrompts.map((prompt, index) => (
                    <button key={prompt} type="button" disabled={loading} className={query === prompt ? styles.selectedPrompt : ""} aria-pressed={query === prompt}
                      onClick={() => { setQuery(prompt); inputRef.current?.focus(); }}>
                      <span className={styles.promptNumber}>0{index + 1}</span><span>{prompt}</span><Arrow />
                    </button>
                  ))}
                </div>
              </div>
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

        <section className={`${styles.readingSection} ${view === "search" && !response && !loading && !error ? styles.idleReading : ""}`} aria-label={view === "saved" ? "Saved reading list" : "Search results"} aria-busy={view === "search" && loading}>
          <div className={`${styles.sectionHeading} ${view === "search" && !response && !loading && !error ? styles.srOnly : ""}`}>
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
              {showRanking && (
                <details className={styles.rankingDetails}>
                  <summary>How ranking works</summary>
                  <p>Your whole question goes to Exa, a search engine that matches posts on what they’re about, not only on the words they share with your question. The post Exa judges closest to your question comes first.</p>
                  <p>That works better for specific questions than Substack’s own search, which often returns posts that share a word or two with your question but are about something else.</p>
                  <p>Sorting by date reorders these same results. Likes and comments come from Substack and are shown for context. They don’t change the order.</p>
                </details>
              )}
              <div className={styles.articleList}>
                {pagination.articles.map((article, index) => (
                  <ArticleCard key={`${view}:${resultVersion}:${articleIdentity(article.url)}`} article={article}
                    revealKey={`${resultVersion}:${articleIdentity(article.url)}`} revealed={revealed} index={index}
                    saved={savedIds.has(articleIdentity(article.url))} savedView={view === "saved"}
                    storageReady={storageReady}
                    onSave={() => updateSaved(article, false)} onRemove={() => updateSaved(article, true)} />
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
            <div className={styles.emptyState}>
              <Book />
              <h3>Your next good read starts here.</h3>
              <p>Start with a question. Leave with a few new perspectives.</p>
            </div>
          )}
        </section>
      </main>
      <footer className={styles.footer}><a href="https://exa.ai" target="_blank" rel="noopener noreferrer">SEARCH POWERED BY EXA <Arrow /></a></footer>
    </div>
  );
}
