# Deckhand: personal self-hosted fork

Build decks for Commander, Pauper Commander, PreDH, Duel Commander, Standard,
Pauper, Modern, Legacy, and Vintage.

Collection search includes sorting by name, mana value and price in either direction;
binder choices keep their grouping. Card Details shows the owned quantity with compact
+/− controls, grouped Recommendations/Similar cards actions, and a themed Tags popup.
The title and navigation stay fixed while swiping between cards.

The Node.js server handles sync, AI requests, news, and Scryfall through `/api/`.
Sync data and local AI caches stay in SQLite.

Ask AI Judge and deck advice use a **local Ollama model only**: `qwen3:4b-instruct-2507-q4_K_M` (about 2.5 GB).
Docker Compose includes a private Ollama service with cloud features disabled. No AI API keys are used.
See [local AI setup](docs/DEVELOPMENT.md#local-ai-judge-and-deck-advice) and [GPU setup](docs/SERVER.md#local-ai-and-gpu-acceleration).

The **experimental card scanner** is under **Collection → + → Scan cards** and in the main menu.
It scans one card at a time with [CollectorVision](https://github.com/HanClinto/CollectorVision)
and its [Fastweb-Single 1.39 detector](https://huggingface.co/HanClinto/ccgdetector-fastweb-single).
Scan cards opens the full-screen camera directly and recognizes cards continuously.
The camera fills its preview with an aspect-preserving crop. Detected corners draw
a live outline and drive perspective correction; there is no fixed alignment frame.
Capture prefers native 1080p in the phone's orientation at up to 30 FPS,
with continuous autofocus and tap-to-focus where supported.
Recognition stays within a 720p-sized processing budget and reuses its capture buffer.
Slower recognition never reduces the preview resolution. The optional framerate
display includes the actual camera dimensions supplied by the browser.
Detected cards appear below the preview with the newest at the top. Tap a logged card to review/add it.
Scroll the log over the preview to release the camera; returning to the top opens it again.
Hold a logged card to select it, then tap more cards to select several. The pinned
Select all selects the current log; later scans remain unselected. The yellow +
is gray and disabled without a selection. It adds selected scans as one Near Mint,
nonfoil copy per scan without a binder, removing those scans and their photos from
the log. Adding through individual review also removes that scan. Delete removes
selected log entries only. Each scan shows the quantity already in your collection
across all printings.
The review page includes printing, condition, foil, amount and binder options.
Add directly from review, or use its top-right X to return to live scanning.

**Decks → + → Scan deck** uses the same camera for a physical deck. Its yellow +
offers existing decks or a themed new-deck dialog with format and optional commander.
It adds selected scans (use Select all for the whole log), keeping every repeated copy and the
detected printing. Deck scanning allows repeated names regardless of collection
scanner preferences; a held card still needs to leave view before another copy
can be detected. A matching commander or partner is accounted for once in its
existing command slot. Other scans append to the main deck, with the deck editor
available for legality review. Collection contents are unchanged in this mode.

In **Settings → Card scanner**, adjust the ID match threshold, corner threshold,
scan interval (200 ms by default) and optional framerate/timing display.
Recognition selects WebGPU only when its startup accuracy and speed check beats
CPU inference, with a CPU fallback. The complete card catalog is retained.
Optionally ignore exact printings already scanned during the current camera session.
Different sets and artwork remain separate, even with the same name. Settings apply
when the camera opens and sync with your account.
Brief messages explain when the session setting ignores a card.
Blank Card predictions from a covered camera are ignored silently.
Photos stay in your browser. Models and reference data are served by Deckhand, with no OCR or external recognition service.
Closing the scanner clears logged photos, capture canvases and worker image buffers;
the recognition models and reference catalog stay cached.
Recognition initializes in the background after startup and stays ready while the app is open.
On capable devices, corner outlines update independently while cards are identified.
Successful scans give a short vibration when supported by the phone and browser.
Its roughly 70 MB of data is cached across launches. Recognition is experimental; confirm printing, foil and condition yourself.

In **Menu → Account & sync**, create an optional email/password account,
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
Settings contains Startup page, Card scanner, Color scheme, and Backup.
Account & sync is available in Menu. Data sources update automatically without
user-facing refresh/download controls. Scan cards is in the Collection and binder + menus.
The bottom **Version & changelog** card shows the installed version, release date
and full release history, newest first.
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
Collection's overview groups Binders, Automatic folders and Unsorted cards under
their headings. Trade appears in the overview's title bar and in Menu. All cards
has a collection value/history action; individual binders have an edit action
that opens themed settings full screen from the right. Binder settings are also
shown after naming a new binder. Binder tiles show icons and totals without cover
images. Each binder's + menu offers Scan cards, adding selected scans to that
binder. Selection shows its quantity, including 1, and clears on
folder navigation. Collection uses the same full-screen sliding filters as Search.
Its search bar contains no collection-value total.
Collection's Add card opens Search. Each card's Add menu lists collection after the deck choices.
The automatic **Playing** folder shows owned copies currently used by decks,
including commanders and constructed sideboards. Search and deck scans reuse
owned copies and add only missing copies to the collection. Choose **Use proxies**
when adding, or change a copy in Card Details, to put it on **Wants** instead.
Playing updates when cards leave a deck; those physical cards remain owned.
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
