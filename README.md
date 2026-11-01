# Deckhand: personal self-hosted fork

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
Settings is the last menu card; the life counter is available from Life.
Settings contains Language, Data sources, Color scheme, Sync, and Backup.
The title returns home. Every page scrolls below its fixed title and any
search, sort, or filter bars, ending above the bottom tabs.
Life opens a game menu with new, resume, and saved-game actions.
Run `npm run test:mobile` for mobile and desktop browser checks.

Pages now open at the top. Search, sorting, and filter controls sit below the
title bar; dropdowns read from the top. Scryfall requests use the local
`/api/scryfall/...` adapter, which shares a paced queue and short-lived query
cache across browser tabs. Optional data files are requested only when present.

Device sync and AI caches use SQLite. AI features need optional provider keys
in `.env`. Feedback, upstream APK distribution, and push alerts are disabled.

See [the development guide](docs/DEVELOPMENT.md) for LAN testing, Docker,
backups, and deployment to your own machine. Run `npm test` for backend tests.
