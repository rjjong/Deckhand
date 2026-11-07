# Deckhand: personal self-hosted fork

Build decks for Commander, Pauper Commander, PreDH, Duel Commander, Standard,
Pauper, Modern, Legacy, and Vintage. Unsupported saved formats fall back to
Commander while keeping their cards, commanders, and folders.

The Node.js server handles sync, AI requests, news, and Scryfall through `/api/`.
Sync data and local AI caches stay in SQLite.

Ask AI Judge and deck advice use a **local Ollama model only**: `qwen3:4b-instruct-2507-q4_K_M` (about 2.5 GB).
Docker Compose includes a private Ollama service with cloud features disabled. No AI API keys are used.
See [local AI setup](docs/DEVELOPMENT.md#local-ai-judge-and-deck-advice) and [GPU setup](docs/SERVER.md#local-ai-and-gpu-acceleration).

The **experimental card scanner** is under **Collection → + → Scan cards** and in the main menu.
It detects up to eight separated cards per photo or camera capture using self-hosted OpenCV.js and Tesseract.js.
Photos and OCR stay in your browser. Review names before adding; exact printing, language and foil are not identified.

In **Settings → Account & sync**, create an optional email/password account,
verify your email, and sign in on each device. Decks, collections, settings and
saved games sync to this server's SQLite database. Passwords use salted scrypt
hashes; they are never stored in a recoverable form. Email recovery uses expiring,
single-use links. Each account has its own local/offline workspace. Without an
account, the app stays usable and warns that local decks and collections need backups.
Existing sync codes can be imported once into an account. See
[account email setup](docs/SERVER.md#accounts-and-recovery-email).

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
Main pages, full-screen tools, and filters share one themed title-bar style.
Their add buttons share the same size and fixed bottom-right position.
Open decks keep commander cards on the left of their format, bracket estimate,
issue review, and description. Card count and value sit in the Cards toolbar,
alongside a Tiles/Stacks/List dropdown and sorting. Search stays pinned, with the
same themed field and background fade used across the app. Filters and bulk
editing open full screen; Deck actions groups the other tools.
Stats charts open the deck list with editable mana-value or color filters applied.
Backup reminders appear in Menu and add an exclamation badge to the menu logo.
Collection has a Trade icon in its title bar and the same full-screen sliding
filters as Search. Its search bar contains no collection-value total.
Collection's Add card opens Search. Each card's Add menu lists collection after the deck choices.
Trade has two card lists with Add card actions and no separate page search.
Each traded card has a Cardmarket link for its printing, with name search as a fallback for older entries.
Confirm trade and the price difference stay in a bordered bar below the title as the cards scroll.
Life opens a game menu with new, resume, and saved-game actions.
Run `npm run test:mobile` for mobile and desktop browser checks.

Frontend source now lives in `src/` and `styles/`. `index.html` is the small
HTML shell; page markup and handlers are grouped by tab in `src/pages/`.
`npm run dev` builds the frontend and watches those folders automatically.
Refresh the browser after editing. `npm run build` produces the deployable
`public/` directory, and `npm run format` keeps the source consistently formatted.

App versions use **Major.Minor.Build**. Builds and deployments automatically
advance the build number; choose major/minor with `npm run version:set -- 2.1`.
Use `npm run build:docker` for Docker builds. See
[versioning instructions](docs/DEVELOPMENT.md#app-versions).
See [the source guide](docs/DEVELOPMENT.md#frontend-source-organization)
for the folder map, page entry points, CSS order, and debugging instructions.

Pages now open at the top. Search, sorting, and filter controls sit below the
title bar; dropdowns read from the top. Scryfall requests use the local
`/api/scryfall/...` adapter, with a shared paced queue, SQLite response cache,
hourly/daily request budgets and persistent cooldowns after blocks or rate limits.
Cardmarket pages open only on request; repeated link opens are spaced apart.
See [request safeguards](docs/DEVELOPMENT.md#scrolling-and-scryfall-traffic).
Optional data files are requested only when present.

Device sync and AI caches use SQLite. AI features run through local Ollama. The old feedback form, bundled Android APK, and web push service
have been removed. Install the web app through your browser.

See [the development guide](docs/DEVELOPMENT.md) for LAN testing, Docker,
backups, and deployment to your own machine. Run `npm test` for backend tests.

The Ubuntu home server setup, deployment command, and backup procedures are in
[the server guide](docs/SERVER.md).
