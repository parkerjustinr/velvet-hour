# Working in this repo

One-page event site. Plain HTML, CSS, vanilla JS. No framework, no build step. Deploys to GitHub Pages from `main`, root.

## Where things live
- `data/event.json` - all content. Change copy here, not in the markup.
  - `sections` sets order and on/off for every section. Nav and footer follow it.
  - `tracks` drive schedule colors (track-1, track-2, track-3 in CSS, in the order listed).
  - Schedule sessions carry `tiers`, which the ticket matrix and calendar downloads use.
  - Ticket rows with `from` (`day:<id>`, `track:<id>`, `session:<id>`) build their preview (several refs allowed, comma separated: `session:a,session:b`) from the schedule. Rows without `from` show `detail`.
  - Sessions whose `end` is earlier than `start` end the next morning (afterparties).
  - `tickets.perDayLabel` sets the computed price-per-day row label.
  - `[PLACEHOLDER]` in any string shows a visible Placeholder tag.
- `styles.css` - design tokens at the top of `:root`. Change tokens first, then section styles.
- `app.js` - one renderer per section in the `R` object. To add a section: add a renderer `R.<id>`, then add `{ "id": "<id>", "label": "...", "on": true }` to `sections`.
- `#hero-moment` in `index.html` is reserved for the one big hero element.
- jam-winner/ is a frozen snapshot of the judged version. Never edit anything inside it.

## Built-in features (keep them working)
- Featured speaker plus grid. Every lineup card, and every performer name or face in the run of show, opens the artist popup. The popup lists set times that switch the day tab and land on the slot.
- Schedule day tabs (arrow keys work), track colors, "show my time" toggle (Intl API), per-day .ics download.
- Run of show rows are one line: a toggle button (time, title) with aria-expanded, performer face buttons, location tag. The toggle (or a click on the row) shows the names and the description; closed by default, no animation.
- Ticket breakdown matrix: pick a column to choose a ticket, hover or focus a row for a side preview on desktop, tap a row to open it inline on phones. No sideways scroll on phones. Cost-per-day row is computed. Single-night tiers are the columns; a pass covering several nights (Both nights) is one full-width row under the matrix with its own button, and picking it syncs the form and CTA like a column.
- Demo registration with validation and a confirmation state. Nothing is sent anywhere. Your ticket is tier plus night (synced with the matrix), up to 5 guests each with their own ticket, a live order summary priced from data/event.json, and a confirmation listing every ticket.
- Invite builder (demo, nothing is sent): "Invite a friend" (Tickets, Register, confirmation) and "Add to an invite" after a Dance Cam snapshot open invite mode; "Send [Name] their ticket" on the confirmation opens gift mode for that guest. Email preview, then a sent state. The Dance Cam photo stays in memory only. Copy lives in `invite` in data/event.json.
- Skip link, visible focus, Motion toggle.
- Motion is on by default regardless of OS setting. Visitors turn it off with the Motion toggle.

## Motion
Tiers:
- Tier 1, plays for everyone: plays once, under 5 seconds.
- Tier 2, two versions: full by default, softer version with reduced motion.
- Tier 3, toggle: sustained motion, on for everyone, controlled by the Motion toggle.

How it works today: the OS reduce-motion setting is ignored. Motion: Off (html.motion-off) stills every effect below, Tier 1 included, and shows all content. No flash is full-screen and nothing flashes more than 3 times a second.

Effects (FLAG = does not fit its tier as written; left as is):
- Hero dance floor (chase, pointer and finger lighting, scroll drive): Tier 3.
- Name marquee: Tier 3. Also pauses on hover and has its own Pause button.
- Dance Cam effects (Mirror Ball drift, Floor Lights pulse, Broadcast grain) and the demo photo bounce: Tier 3.
- Dance Cam LIVE tally light (on and off every 1.2 s): Tier 3.
- Record spin and sound bars while a clip plays: Tier 3.
- Scroll-ins (headline words sharpen in, photo wipe, cards and rows stagger), once each, under 1 s: Tier 1. FLAG: also stopped by Motion: Off, so not "for everyone".
- Scene-change light sweep, once per section, 1.1 s: Tier 1. FLAG: also stopped by Motion: Off.
- Confetti on registration, once, about 2 s: Tier 1. FLAG: skipped with Motion: Off.
- Phone sheet slide-up (artist popup, invite builder), 380 ms: Tier 1. FLAG: also stopped by Motion: Off.
- Small transitions (View artist tag fade, tonearm swing, button arrow nudge, color fades, session highlight after a jump, smooth scrolling to in-page links), under 0.5 s: Tier 1. FLAG: also stopped by Motion: Off.
- Button label roll on hover or focus, 320 ms: Tier 1. FLAG: Motion: Off keeps a softer version (color change only), which is the Tier 2 pattern, but it follows the toggle, not reduced motion.
- Run of show expand: no animation.
- Tier 2: no effect has a separate reduced-motion version today. FLAG: the tier is empty by design since the OS setting is ignored.

## Rules
- No em dashes anywhere, in code comments or copy. Use a hyphen.
- Left-align text. No eyebrow labels over headings. No decorative numbering. No gradients. No drop shadows at rest.
- Every color means one thing (a track, a state, the selected ticket). Keep at least one big field of color per screen.
- Check 360, 390, 768 and 1280 px wide: no sideways scroll, no clipped headings.
- Commit and push after every finished change.
