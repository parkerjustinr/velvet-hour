# Working in this repo

One-page event site. Plain HTML, CSS, vanilla JS. No framework, no build step. Deploys to GitHub Pages from `main`, root.

## Where things live
- `data/event.json` - all content. Change copy here, not in the markup.
  - `sections` sets order and on/off for every section. Nav and footer follow it.
  - `tracks` drive schedule colors (track-1, track-2, track-3 in CSS, in the order listed).
  - Schedule sessions carry `tiers`, which the ticket matrix and calendar downloads use.
  - Ticket rows with `from` (`day:<id>`, `track:<id>`, `session:<id>`) build their preview from the schedule. Rows without `from` show `detail`.
  - `[PLACEHOLDER]` in any string shows a visible Placeholder tag.
- `styles.css` - design tokens at the top of `:root`. Change tokens first, then section styles.
- `app.js` - one renderer per section in the `R` object. To add a section: add a renderer `R.<id>`, then add `{ "id": "<id>", "label": "...", "on": true }` to `sections`.
- `#hero-moment` in `index.html` is reserved for the one big hero element.

## Built-in features (keep them working)
- Featured speaker plus grid. Speakers link to their sessions and sessions link back, switching the day tab if needed.
- Schedule day tabs (arrow keys work), track colors, "show my time" toggle (Intl API), per-day .ics download.
- Ticket breakdown matrix: pick a column to choose a ticket, hover or focus a row for a side preview on desktop, tap a row to open it inline on phones. No sideways scroll on phones. Cost-per-day row is computed.
- Demo registration with validation and a confirmation state. Nothing is sent anywhere.
- Skip link, visible focus, reduced-motion support.

## Rules
- No em dashes anywhere, in code comments or copy. Use a hyphen.
- Left-align text. No eyebrow labels over headings. No decorative numbering. No gradients. No drop shadows at rest.
- Every color means one thing (a track, a state, the selected ticket). Keep at least one big field of color per screen.
- Check 360, 390, 768 and 1280 px wide: no sideways scroll, no clipped headings.
- Commit and push after every finished change.
