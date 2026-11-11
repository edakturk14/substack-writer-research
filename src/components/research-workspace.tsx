"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { articleIdentity, parseSearchResponse } from "@/lib/articles";
import { MAX_QUERY_LENGTH, type Article, type SearchResponse } from "@/lib/contracts";
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
      {(article.publication || date) && (
        <div className={styles.metadata}>
          {article.publication && <span className={styles.publication}>{article.publication}</span>}
          {date && <time dateTime={article.publishedDate}>{date}</time>}
        </div>
      )}
      <h3>{article.title}</h3>
      {article.author && <p className={styles.byline}>By {article.author}</p>}
      {article.excerpt && <p className={styles.excerpt}>{article.excerpt}</p>}
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
  const inputRef = useRef<HTMLInputElement>(null);
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
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">s.</span>
          <div><span className={styles.brandName}>Substack Writer Research</span><span className={styles.brandTag}>A READING SHELF FOR YOUR NEXT DRAFT</span></div>
        </div>
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
            <section className={styles.hero} aria-labelledby="page-title">
              <div className={styles.eyebrow}>A LITTLE CURIOSITY GOES A LONG WAY</div>
              <h1 id="page-title">Find a fresh perspective.<br /><em>Follow it somewhere.</em></h1>
              <p>Explore independent writing on Substack. Bring a question,<br className={styles.desktopBreak} /> discover an angle, and keep the pieces worth coming back to.</p>
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
                    placeholder="Find posts where someone measured what made their AI app slow."
                    maxLength={MAX_QUERY_LENGTH}
                    aria-describedby="search-hint"
                    readOnly={loading}
                    autoComplete="off"
                  />
                  <button className={styles.searchButton} type="submit" disabled={loading}>
                    {loading ? "Searching…" : "Search"} <Arrow />
                  </button>
                </div>
                <p id="search-hint" className={styles.hint}>Write naturally. A topic, a question, or an idea you want to explore.</p>
              </form>
              <div className={styles.prompts}>
                <span>Try a thread</span>
                {["Writing a newsletter consistently", "Making AI inference faster"].map((prompt) => (
                  <button key={prompt} type="button" disabled={loading} onClick={() => { setQuery(prompt); inputRef.current?.focus(); }}>{prompt} <Arrow diagonal /></button>
                ))}
              </div>
            </section>
          </>
        ) : (
          <section className={styles.hero} aria-labelledby="page-title">
            <div className={styles.eyebrow}>YOUR PERSONAL READING SHELF</div>
            <h1 id="page-title">Saved articles</h1>
            <p>A few good pieces to return to. Saved in this browser, on this device.</p>
          </section>
        )}

        <p className={styles.srOnly} role="status" aria-live="polite">{statusText} {saveNotice}</p>
        {savedState.warning && <p className={styles.warning} role="status">{savedState.warning}</p>}

        <section className={styles.readingSection} aria-label={view === "saved" ? "Saved reading list" : "Search results"} aria-busy={view === "search" && loading}>
          <div className={styles.sectionHeading}>
            <h2>{view === "saved" ? "The reading list" : response ? response.mode === "demo" ? "Fixed example articles" : "Search results" : "Room for a new idea"}</h2>
            <span>{view === "saved" ? `${articles.length} saved` : response ? `${articles.length} ${articles.length === 1 ? "article" : "articles"}` : "READ. REFLECT. RETURN."}</span>
          </div>
          {view === "search" && error ? (
            <div className={styles.feedback} role="alert">
              <span className={styles.smallLabel}>A PAUSE, NOT A DEAD END</span>
              <h3>Let’s try that again.</h3>
              <p>{error}</p>
              <p className={styles.retryHint}>Your question is still in the field above. Select Search to retry.</p>
            </div>
          ) : view === "search" && loading ? (
            <div className={styles.feedback}>
              <span className={styles.loadingMark} aria-hidden="true" />
              <h3>Following your thread…</h3>
              <p>{demoMode ? "Opening the fixed example articles." : `Looking for articles on “${submittedQuery}”.`}</p>
            </div>
          ) : articles.length ? (
            <>
              {view === "search" && response?.mode === "live" && <p className={styles.querySummary}>For “{submittedQuery}”</p>}
              <div className={styles.articleList}>
                {articles.map((article) => (
                  <ArticleCard key={articleIdentity(article.url)} article={article}
                    saved={savedIds.has(articleIdentity(article.url))} savedView={view === "saved"}
                    storageReady={storageReady} onSave={() => updateSaved(article, false)} onRemove={() => updateSaved(article, true)} />
                ))}
              </div>
            </>
          ) : view === "saved" ? (
            <div className={styles.feedback}>
              <span className={styles.smallLabel}>KEEP THE GOOD FINDS CLOSE</span>
              <h3>{storageReady ? "Your shelf is waiting." : "Opening your reading list…"}</h3>
              <p>Choose Save on any search result to keep it here for later.</p>
              <button className={styles.textButton} type="button" onClick={() => { setView("search"); }}>Explore articles <Arrow /></button>
            </div>
          ) : response ? (
            <div className={styles.feedback}>
              <span className={styles.smallLabel}>TRY ANOTHER ANGLE</span>
              <h3>No articles found.</h3>
              <p>Try a broader topic or a different phrasing. Your question is still above, ready to edit.</p>
            </div>
          ) : (
            <div className={styles.startingState}>
              <div className={styles.startIntro}><span className={styles.flourish} aria-hidden="true">↳</span><h3>Every good piece<br />starts with a question.</h3><p>Your next useful read might be one you weren’t looking for.</p></div>
              <ol className={styles.steps}>
                <li><span aria-hidden="true">01</span><div><h3>Start with a thought</h3><p>Ask a question or describe what you’re researching.</p></div></li>
                <li><span aria-hidden="true">02</span><div><h3>Read a little wider</h3><p>Scan excerpts, then open the original for the full piece.</p></div></li>
                <li><span aria-hidden="true">03</span><div><h3>Keep what resonates</h3><p>Save articles to build a small, thoughtful reading list.</p></div></li>
              </ol>
            </div>
          )}
        </section>
      </main>
      <footer className={styles.footer}><span>Made for the work before the writing.</span><span>Independent voices. Original sources.</span></footer>
    </div>
  );
}
