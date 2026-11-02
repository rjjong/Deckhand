# Deckhand: personal self-hosted fork

Build decks for Commander, Pauper Commander, PreDH, Duel Commander, Standard,
Pauper, Modern, Legacy, and Vintage. Unsupported saved formats fall back to
Commander while keeping their cards, commanders, and folders.

The Node.js server handles sync, AI requests, news, and Scryfall through `/api/`.
Sync data and AI caches stay in SQLite; AI provider keys are optional.

Run the web app locally with Node.js 24 and SQLite:

```sh
fnm install
npm ci
test -f .env || cp .env.example .env
npm run data:sample
npm run dev
```

Open http://localhost:3000. If `.env` already exists, keep it rather than copying
over your settings. The sample downloads only 30 cards, with no images or bulk
database. Local data requests never trigger automatic bulk downloads.

This development PC now uses the complete supported card catalogue and rulings
at `var/data-library`, selected by `DATA_DIR` in the local `.env`. Refresh that
cache with `npm run data:library` (also `npm run data:download`). It contains one
record per distinct supported card, not every printing or all card images.

The mobile shell has five labeled bottom tabs: Decks, Collection, Search,
Inspiration, and Life. The logo opens Menu, with cards for tools and Settings.
Format Rules and Ban Lists open dedicated pages from Menu.
Settings is the last menu card; the life counter is available from Life.
Settings contains Startup page, Data sources, Color scheme, Sync, and Backup.
The interface is English-only and opens without a first-start introduction.
The title returns home. Content scrolls above the bottom tabs and below its
fixed title and toolbars. Decks and Collection have full-width search bars
that scroll with their pages.
Their add buttons share the same size and fixed bottom-right position.
Backup reminders appear in Menu and add an exclamation badge to the menu logo.
Collection has a Trade icon in its title bar, a filtered value beside its search field,
and the same full-screen sliding filters as Search.
Trade has two card lists with Add card actions and no separate page search.
Life opens a game menu with new, resume, and saved-game actions.
Run `npm run test:mobile` for mobile and desktop browser checks.

Frontend source now lives in `src/` and `styles/`. `index.html` is the small
HTML shell; page markup and handlers are grouped by tab in `src/pages/`.
`npm run dev` builds the frontend and watches those folders automatically.
Refresh the browser after editing. `npm run build` produces the deployable
`public/` directory, and `npm run format` keeps the source consistently formatted.
See [the source guide](docs/DEVELOPMENT.md#frontend-source-organization)
for the folder map, page entry points, CSS order, and debugging instructions.

Pages now open at the top. Search, sorting, and filter controls sit below the
title bar; dropdowns read from the top. Scryfall requests use the local
`/api/scryfall/...` adapter, which shares a paced queue and short-lived query
cache across browser tabs. Optional data files are requested only when present.

Device sync and AI caches use SQLite. AI features need optional provider keys
in `.env`. The old feedback form, bundled Android APK, and web push service
have been removed. Install the web app through your browser.

See [the development guide](docs/DEVELOPMENT.md) for LAN testing, Docker,
backups, and deployment to your own machine. Run `npm test` for backend tests.
