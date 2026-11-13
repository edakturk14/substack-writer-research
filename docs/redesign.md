# Sky search redesign

The search page uses a continuous sky background, Instrument Serif heading,
DM Sans body and result titles, and IBM Plex Mono labels. The header contains
Search and About links, without a brand or logo.

The white search panel accepts the same natural-language questions as before.
Three starter prompts fill and focus the field without submitting a search.
The idle page has no illustrated empty-state block. No postcards, Save buttons,
Saved view, or article storage remain.

Results stay in one readable column. Titles use DM Sans semibold, with source,
author, date, paid status, and engagement below. Each card links to the original.
Search/API behavior, excerpt limits, sorting, pagination, and the development
cache workaround remain unchanged. Missing publication names fall back to the
validated source hostname.

The About page retains its search comparison. Live results and About explain
Exa's meaning-based ranking; keyword-match percentages are no longer shown.

## Repeatable comparison

`tests/e2e/visual.spec.ts` captures the same query, fixed demo articles, and full
page at 1440×1000 and 390×844. The demo banner deliberately remains visible:
these are fixed examples, not live query-matched results.

Browser coverage includes button/Enter submission, loading and error recovery,
original-link navigation (intercepted, not a source availability check),
sorting/pagination, keyboard focus, starter prompts, About navigation, and
overflow with long metadata at 320px. Tests also verify that saving controls
and the illustrated empty state are absent. Reduced-motion styles disable
entrance and loading animations.
