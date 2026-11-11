# Implementation contract

`POST /api/search`: JSON `{ "query": "natural language" }`, trimmed, 1–300
characters. Success: `SearchResponse` in `src/lib/contracts.ts`. Failure:
`SearchErrorResponse` with safe user-facing message and appropriate HTTP status.
One Exa POST for each valid live submission, no automatic retries.

`DEMO_MODE=1` is a server-side runtime switch. The page must be dynamic and
pass the mode to its client component so both page and route agree. Demo searches
return `demoResponse` for any valid query; clearly label them fixed examples.
Browser tests mock `/api/search` to exercise delayed, empty, and error outcomes.
Normal mode always uses Exa, never silently falls back to fixtures.

Search-owned `src/lib/articles.ts` exports:
- `validateArticleUrl(value: unknown): string | null`: validated original
  provider URL, never reconstruct a destination from a title or ID.
- `articleIdentity(url: string): string`: stable URL identity for duplicate
  detection (ignore tracking query, fragment, and trailing slash).
- `parseArticle(value: unknown): Article | null`: allowlisted render fields,
  valid required title and URL, optional text/date fields checked at runtime.
- `parseSearchResponse(value: unknown): SearchResponse | null`: runtime check
  client response shape, normalize and deduplicate articles.

Interface-owned storage key: `substack-writer-research:saved:v1`.
Store an array of Article values only, use `parseArticle` and URL identity on
read/write. Broken or unavailable storage must not crash the page.

Accessible UI agreement: a field labeled `Research question`, a form submit
button `Search`, view buttons `Search` and `Saved` with `aria-pressed`;
cards use `<article>`; card actions have exact visible names `Open original`,
`Save`, `Saved`, `Remove`. The Saved view heading is `Saved articles`.
All text, including provider excerpts, is plain React text.

Ownership: search agent owns the route, `articles.ts`, `exa.ts` and their unit
tests. Interface agent owns page/layout/styles, `src/components`, storage and
storage tests. Verification agent owns `tests/e2e`, `playwright.config.ts`,
`.github/workflows`, and `scripts/check-links.*`. Lead owns package/lockfile,
contracts, fixtures, Vitest config, README and integration. No agent commits
or pushes. No overlapping writes.
