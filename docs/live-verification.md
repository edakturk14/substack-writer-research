# Live verification, November 11, 2026

The real local server, with demo mode off, returned HTTP 200 and ten articles
for each required query:

- What made their AI app slow
- How writers find ideas for their newsletter
- Moving to New York from abroad

All 30 returned destinations were opened and returned HTTP 200 at the exact
requested article URL, without redirects. Twenty-nine articles' excerpts were
corroborated against their source text. Some passages cross images or captions,
so whole-string comparison alone is insufficient; those boundaries were checked
against the surrounding original text.

## Remaining source limitation

`https://cyoo.substack.com/p/deciding-what-to-write-about` opens the intended
Carolyn Yoo post, whose current visible heading is “What to write in a
newsletter.” The provider uses its older title, “Deciding what to write about.”
The quoted passage is below the paid-subscriber gate, so its full text could
not be independently verified without an authorized subscription. It is not a
demo fixture. To finish this check, an existing paid subscriber can open the
post and compare the provider passage beginning “Off you go back to the empty
draft.”

Provider titles can also be generic: the apartment-hunting result at
`https://jagatviradia.substack.com/p/finding-an-apartment-in-nyc` was labeled
“Jagat’s Substack,” but its URL and passage both match “Finding an Apartment in
NYC.” The app preserves provider metadata rather than inventing replacement
titles or making additional content requests.

The two demo destinations and their quoted passages also passed source checks.
The README's Exa dashboard link requires sign-in and returned HTTP 429 during
the automated network audit; it was not classified as a broken article URL.

These are point-in-time checks, not a guarantee about future search results,
rankings, edits, paywalls, or article availability.
