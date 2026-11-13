# Writer Research

Find what has already been written about an idea, read an original passage, and
save articles for your next draft. One responsive page, with Search and Saved
views. No generated summaries, accounts, database, or recommendations.

Sort search results by **Relevance**, **Newest first**, or **Oldest first**.
Cards show a plain-text excerpt of at most 300 characters. Search and Saved show
five articles per page, with Previous/Next controls when needed. Sorting and
paging use the already-fetched results, not additional Exa requests. Relevance
restores provider order; undated articles stay last in either date order.
Saved has its own Saved order/date sorting. A new search or sort starts at page 1.

## Run on your Mac

Use **Node.js 24 LTS** (tested with **24.22.2**, pinned in `.nvmrc`) and its bundled
npm. With Node installed, or with `nvm` available:

```bash
git clone https://github.com/edakturk14/substack-writer-research.git
cd substack-writer-research
nvm install
nvm use
npm ci
cp .env.example .env.local
```

If you installed Node 24 without nvm, skip the two `nvm` commands.

### Try the demo, no API key needed

```bash
DEMO_MODE=1 npm run dev
```

Open `http://localhost:3000`. Try:

> Find Substack posts where someone measured what made their AI app slow.

The visible **Demo mode** label means every valid query returns the same two
fixed example articles, not query-matched search results. Their public links
and quoted passages were checked against the original pages on November 11,
2026. Save an article, switch to Saved, and reload to try persistence.

### Live search with Exa

Set `EXA_API_KEY` in `.env.local` to your own key. Obtain it from the
[Exa dashboard](https://dashboard.exa.ai/api-keys). Set `DEMO_MODE=0` (the default).
Stop any demo server, then run:

```bash
npm run dev
```

The key stays on the server. `.env.local` is ignored by Git. Never use a
`NEXT_PUBLIC_` variable for the key or commit it.
Each submitted live search makes one
[Exa Search API](https://exa.ai/docs/reference/search) request using `type: "lite"`,
up to 10 results, Substack domain filters, and highlights. There are no
automatic retries or silent demo fallbacks. Live searches send the question
to Exa; saved articles never leave your browser through this app.

## Build and verify

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

`npm run check` runs lint, type checks, unit tests, build, and browser tests
in that order (install Chromium first). Browser tests use demo/mocked responses,
fresh browser contexts, desktop and 390px mobile layouts, and no Exa key.
On Linux, use `npx playwright install --with-deps chromium`.

Run these browser commands in a standalone Terminal or CI. Factory Desktop's
embedded pane does not support Playwright's isolated contexts or viewport
emulation; use its visible browser for smoke checks instead. The suite fails
clearly there rather than reusing personal browser state.

Check fixture and README link syntax with `node scripts/check-links.mjs`.
For a live source/title/excerpt audit, run
`node scripts/check-links.mjs --network`. It reports redirects, failures, and
unchecked URLs rather than silently treating them as verified. The Exa dashboard
requires sign-in and may rate-limit automated checks; open it manually to get
your key.

Run the production build:

```bash
npm run build
npm start
```

Or run it without a key using `DEMO_MODE=1 npm start`. Demo mode is read at
server runtime, not baked into the build. Development and production servers
bind to the Mac's loopback interface by default.

### Development reload troubleshooting

Next.js 16.4 has a reported Turbopack persistent-cache restart loop
(`vercel/next.js#100267`). This project disables only the development filesystem
cache as the upstream-documented workaround. Production build caching remains
enabled. If upgrading an already-running checkout, restart `npm run dev` after
pulling the configuration change; there is no need to delete saved browser data
or change your Exa key.

## Coverage and storage

- Search accepts trimmed natural-language questions of 1–300 characters.
- Only HTTPS article URLs on `substack.com` and its publication subdomains
  are accepted. `/p/slug` paths and root-host `/@handle/p/slug` paths are supported.
  Slugs must use ASCII letters, numbers, hyphens, or underscores; nested
  subdomains and encoded slugs are excluded. Custom
  publication domains, Notes, profiles, archives, home pages, and comment-only
  pages are excluded. Cards show **$ Paid** when a publication's public post
  metadata confirms paid access. When the lookup is unavailable, access is unverified.
- Cards show likes and comments when Substack supplies them. Aggregate reaction
  totals are labeled **reactions**. They do not affect ordering.
  **Relevance** uses Exa's returned order.
- Results retain provider order after URL validation and deduplication. Links
  point to the validated original provider URL, never an inferred destination.
  Highlights are provider passages rendered as plain text, not summaries.
- Saved articles use `localStorage` in the current browser and origin, keyed
  by article URL identity (ignoring query, fragment, and trailing slash for
  duplicate detection, while preserving the original link). They persist across reloads but do not sync across
  devices, browsers, ports, or `localhost` versus `127.0.0.1`. Clearing site
  data removes them. Only card fields are stored, not queries or API keys.
- Invalid stored records are filtered. If storage is blocked or full, the
  interface reports it rather than promising persistence.

This is a personal, local-first tool. Before exposing it publicly, add access
control and rate limiting to protect your Exa quota. It has no authentication.

## Verification notes

The fixture-based GitHub Actions workflow runs on pushes and pull requests.
See [Actions](https://github.com/edakturk14/substack-writer-research/actions).

The lint dependency tree pins `minimatch` 11.0.1 under `typescript-estree` to
apply the upstream fix for GHSA-g3hv-75wg-m249. This override does not affect the
runtime app; remove it when typescript-eslint adopts a patched version.

Live verification requires an Exa key. With demo mode off, search:

1. “What made their AI app slow”
2. “How writers find ideas for their newsletter”
3. “Moving to New York from abroad”

Open every returned article and confirm its destination and excerpt. Record
redirects, errors, or pages that cannot be checked. The fixture suite does not
claim to verify live provider relevance or article availability.
