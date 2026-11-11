# Writer's research desk

## Audit and approach

Applied the relevant audit, copy, typography, layout, and accessibility guidance
from [Taste Skill](https://github.com/Leonxlnx/taste-skill/tree/main/skills/taste-skill).
Its current marketing-site scaffolding and static-export requirements do not fit
this working Next.js research app. No marketing hero, decorative effects, external
fonts, or skill gate scripts were added.

Before: taglines, a large hero, boxed search, numbered onboarding, and two-column
result cards pushed the research task down the page.

After: a compact workspace header, **Search Substack posts**, a labeled search
field, and one reading column. Warm paper, dark ink, serif titles, 16px excerpts,
and thin row dividers replace nested cards. Source, author, and date stay together;
Save sits beside the title on desktop and beside the source link on mobile.
Empty, loading, and error states use direct instructions.

Search/API behavior, original destinations, saved storage, excerpt limits,
sorting, pagination, and the development cache workaround remain unchanged.
Missing publication names fall back to the validated source hostname.

## Repeatable comparison

`tests/e2e/visual.spec.ts` captures the same query, fixed demo articles, empty saved
list, and full page at 1440×1000 and 390×844. The demo banner deliberately remains
visible: these are fixed examples, not live query-matched results.

The Verify workflow uploads `research-desk-screenshots` on each run. Baseline
capture commit: `9ed0ae1` (UI identical to `e6a424d`). The screenshot test is
unchanged by the redesign. Local desktop browser isolation and viewport emulation
are unavailable, so screenshots and browser tests run in CI rather than taking
over the user's active browser.

Browser coverage includes search by button/Enter, save/reload/remove, exact
original-link navigation (intercepted, not a live source availability check),
sorting/pagination, keyboard focus, single-column layout, search placement,
44px Save controls, and overflow with long metadata at 320px.
