## What this setup provides

- Node.js 24 and npm, managed per user by fnm.
- A project-specific Node version in `.node-version`.
- Reproducible dependency installs using `package-lock.json` and `npm ci`.
- A development SQLite database and read/write checks.
- A Docker Compose command for checking Node and SQLite inside a container.

The Node.js server provides `/api/...` routes for sync, AI assistance, news,
and Scryfall requests. Sync records and AI caches are stored in SQLite.
Open the hosted address below, not `index.html` directly.

## Start the app on this computer

```sh
cd /home/remodj/Projects/Deckhand
fnm use
npm ci
npm run data:sample
npm run dev
```

Open **http://localhost:3000**. Keep the terminal running; Ctrl+C stops it.
`npm run dev` restarts the backend when its source changes. Refresh the browser
after frontend edits. For a process without file watching, use `npm start`.
The health endpoint is http://localhost:3000/api/health.

### Frontend source organization

The old inline application has been separated into readable source files.
`index.html` contains metadata, the app root, and references to the built assets.
Edit the sources below; `public/` contains generated output and is ignored by Git.

```text
index.html                  HTML shell
src/
  app/                      Routing, navigation, history, and startup
  core/                     Shared state, formats, deck storage, card rules
  services/                 Scryfall, local card library, sync, English text helpers
  ui/                       Reusable controls, dialogs, card sheets, icons
  pages/                    Page markup and event handlers, grouped by tab
    home/  menu/  settings/  decks/  decklist/  collection/
    search/  inspiration/  spoilers/  trade/  judge/  draft/  life/
    references/             Format rules and ban lists
  features/                 Release notes, combos, pricing, playtesting, related tools
  platform/                 PWA, desktop input, native bridge, sharing
styles/
  theme.css                 Color tokens and theme palettes
  pages/                    Base styles for pages and tools
  navigation.css            Shared title bar, bottom tabs, menu cards
  overrides/                Current viewport, Judge, Draft/Trade, dialog, Life styling
  desktop.css               Desktop presentation
assets/images/              Source image assets
scripts/frontend-sources.mjs Ordered source list and public assets
scripts/build-frontend.mjs   Frontend build and development watcher
server/services/            Sync, AI judge, deck advice, and news handlers
shared/sync-records.cjs      Sync schema shared by the browser bundle and server
public/                     Generated website, bundles, and source maps
```

For page changes, start with `src/pages/<page>/index.js`. Inspiration is split
into `browse.js`, `deck.js`, `themes.js`, `metagame.js`, and recommendation files.
Life has a landing page in `index.js`, its full-screen setup in `setup.js`, menus
in `menus.js`, counters in `table.js`, and game rules in `model.js`.
Collection's binder and add-card flows and the deck editor's statistics,
matchups, and editing actions have their own neighboring files.

Markup stays next to the page handlers as HTML template literals. The
`/* HTML */` comments let Prettier format those templates. Shared page-card
markup is in `src/ui/menu-cards.js`; common prompts and confirmations are in
`src/ui/dialogs.js`. Data access belongs in `src/services/` rather than in a
new page's markup function.

The build deliberately combines these files into one classic script. Existing
inline handlers and shared `state` retain their scope, and function declarations
keep their original hoisting behavior. This is a source-organization refactor,
not a conversion to isolated ES modules. The order in `frontend-sources.mjs`
preserves top-level initialization; add new files there and avoid casually
reordering existing entries. No production bundler or framework dependency is
required. Only the formatter is a development dependency.

CSS is combined in the same cascade order as before. Base styles come first,
followed by navigation and the current overrides. For recent mobile layout work,
start in `styles/overrides/`; keep reusable colors in `styles/theme.css`.
The source map attached to `assets/app.css` shows the originating stylesheet.

```sh
npm run dev          # Build, start Node/SQLite, watch frontend and backend
npm run build        # Generate public/ without starting the server
npm start            # Build and run without watching
npm run format       # Format frontend sources
npm run format:check # Check formatting without rewriting files
npm test             # Build and run backend/data checks
npm run test:mobile  # Build and run mobile + desktop browser checks
```

The dev server rebuilds `src/`, `styles/`, and source image changes without
restarting SQLite. Refresh the page to see edits. Adding a file to the source
list restarts the backend through Node's watcher. JavaScript and CSS source maps
embed the original sources, so browser DevTools can show the actual source
filenames rather than only the combined assets.

Both normal server startup and the Docker image build generate the frontend.
The server exposes an explicit allowlist of public assets; backend source,
`.env`, database files, and arbitrary paths remain inaccessible. The Node.js
server supplies its dynamic `runtime-config.js`, API routes, and SQLite storage.

The browser can still display its cached offline shell when this server stops.
That does not keep `/api/...` running: `ERR_CONNECTION_REFUSED` at localhost
means the local server needs to be started again. Use `npm run dev` in this
checkout and keep that terminal running. The app shows a Server offline
indicator, pauses API requests, and checks `/api/health` every twelve seconds
until the server returns. Service-worker update failures are handled while
offline. Installation is available through the browser's own controls; the app
has no custom install button and does not intercept the native install prompt.

Only download the sample once, or when deliberately refreshing it. It requests
30 named cards in one Scryfall call, with a 512 KiB response limit. It writes
about 4.3 KB of compressed card data plus small manifests to `var/data-sample`.
It downloads no images, complete bulk databases, prices, or scanner fingerprints.
`data:sample` always writes to `var/data-sample`, even when the server uses
a different library directory.
The server never downloads missing data automatically. Images and live card
searches still use the original online APIs as you use the app.

The sample is deliberately incomplete: local recommendations, scanner data,
metagame data, and offline coverage are limited. It is marked `sample: true`;
it cannot replace the full Commander ban list or claim to contain all rulings.
Normal online rules lookups remain available. Full offline coverage is not
part of the small sample setup.

### Full card library on this development PC

The local `.env` now selects `DATA_DIR=./var/data-library`. It contains the
complete supported Oracle card catalogue (one printing per distinct card) and
official rulings: 33,822 cards and 79,706 rulings at the first download, about
9.6 MiB of compressed files. Card images still load as needed. Digital-only
and unsupported non-playable layouts are excluded by the app's existing trimmer.

```sh
npm run data:library
```

`npm run data:download` is an alias for this full-library command. Both download
the official source files, trim them, and stage the result before publishing.
No full source dump is retained on disk. The browser can ingest the served
cache into IndexedDB through its existing data-source refresh behavior.
Additional function tags, combo catalogues, and scanner fingerprints are not
included in this card/rulings cache. Restart the server after changing DATA_DIR.

To switch back to the sample, set `DATA_DIR=./var/data-sample` in `.env`.

### Mobile navigation

The logo at the top left opens Menu. Its cards provide the life tracker, draft
tools, the AI judge, format rules, and ban lists, with Settings last. The life
tracker is also available from the Life tab in the bottom navigation.
The interface is English-only; previous Dutch preferences fall back to English.
First startup opens the chosen page directly without a guided introduction.
Settings contains Startup page, Data sources, Color scheme, Sync, and Backup. Related controls
expand below their card. Notification options, feedback, What's new, About,
app installation, and app sharing buttons have been removed. Tapping any main
page title returns home. The five labeled bottom tabs are Decks,
Collection, Search, Inspiration, and Life. Life opens a menu with new-game,
resume, and restore actions. A deck's title bar has its name and a Deck actions
button; renaming lives in that menu. Device/browser Back continues to navigate
the existing history.
The bottom navigation is 60px tall, with 50px tab targets and additional space
for the device's bottom safe area. Search toolbars sit directly below the
measured title bar, including when its height changes.

Main pages, overlays, card details, and filter screens use `appTitlebarHtml()`
and `.app-titlebar`. `styles/overrides/headers.css` owns their shared 64px height
(plus the top safe area), spacing, title font, theme ink, and full-width 1px darker
bottom border, without a shadow. There are no page-specific borderless or shorter
title bars. `overlayCapHtml()` supplies the menu logo and home action for tool
pages; subtitles sit below the header. Titles fit inside a separate text span to
keep button height from incorrectly shrinking the lettering.

Search's filter icon opens advanced search full screen from the right.
Spoilers uses the same icon at the top right of its title bar, opening its
own filters with the same full-screen slide, reset, and floating apply action.
Name, set, type, colors, and rarity filters remain available.
Its fields scroll beneath a centered title and borderless back/reset icons.
A round yellow search button stays fixed at the bottom right; the final fields
can scroll clear of it. Property info buttons are omitted. Back returns to
Search and retains the filters; Reset clears them.
Format Rules and Ban Lists open dedicated pages from Menu.
All main pages, including Menu and Settings, scroll within a content viewport
ending above the bottom tabs. Search, sort, set-selection, and deck controls
stay below the title bar; the viewport starts beneath the lowest visible
control bar. Decks and Collection have full-width search bars within their
scrolling content. Decks has its list/tile view toggle beside the search input;
Collection keeps the binder view toggle inside its advanced filters.
Deck pages keep their tabs and deck search pinned below the title. The scrolling
overview contains card counts, legality details, and deck value with a price-page
link. Tiles, Stacks, List, and sorting controls sit above the card sections;
the yellow Add cards button opens Search pinned to the active deck.
Deck actions groups inspiration, bulk editing, section jumps, renaming, format,
folders, sharing, versions, copies, and deletion. Filters and bulk editing fill
the screen with their own headers and scrolling content. These controls live in
`src/pages/decklist/controls.js`; deck styling lives in `styles/overrides/decklist.css`.
Collection filters use the shared full-screen panel that slides in from the
right, with reset/back controls and a floating search button. Collection's
Trade action is a title-bar icon; its value stays beside the search input and
follows the active filters, quantities, and binder scope. The Collection Value
page keeps filtered snapshots separate from the whole collection's history.
Backup reminders live in Menu and put an exclamation badge on the logo until
the reminder is snoozed or a backup is saved.
The document stays still. Opening controls and refreshing lists preserve the
content position.
The smaller reset glyph balances the back chevron. Spoilers is a borderless
action in the Search title bar. Name suggestions open below their input and
fit above the navigation or on-screen keyboard.
When the random card is visible at the top of Search, pull down and release
to draw another card. Its refresh button sits below the image and also works
on desktop. Short or sideways gestures and cancelled pulls do not refresh.
Packages has been removed from Settings, Inspiration, Search, card actions,
and synchronization. Legacy local data is left untouched.

```sh
npm run test:mobile
```

Browser screenshots from these tests are saved under `var/previews`.

### Scrolling and Scryfall traffic

Pages open at the top. Search and sort controls are below the title bar;
advanced search opens its own full-screen panel, dropdowns open below their
controls, and lists read in their normal order.

The browser uses `/api/scryfall/...`. All Scryfall GETs and collection POSTs
share one server queue, with at least 250ms between request starts. Duplicate
GETs coalesce; successful searches are cached for ten minutes, catalogues for
24 hours, in a bounded memory cache. These query caches reset on restart.
The downloaded card/rulings files remain on disk across restarts.

On 429, the queue stops sending upstream requests for at least sixty seconds,
or longer if Scryfall's Retry-After header requires it. The browser stops
retrying its queued jobs during that cooldown. This cannot prevent rate limits
caused by other applications sharing the same internet address.

Unreleased-set probes, full tile-art prewarming, and random-card startup
prefetching are disabled for self-hosted sessions. Random cards use the local
library when it is loaded. An explicit data-source refresh can still check sets.
Scryfall search 404s meaning no matches become a normal empty results list at
the local adapter; genuine missing named cards remain 404s.

Runtime configuration advertises available local data files. Missing prices,
tags, combos, and metagame datasets are skipped rather than fetched on startup.
No placeholder data is generated to pretend these optional datasets exist.

AI features require your own optional keys in `.env`; missing keys produce an
unavailable response. The old feedback form, bundled Android APK, and web push
service have been removed. Phone installation uses the web app.

## Reach it from another device

By default the server listens only on this computer. For deliberate access
from your home network, put these settings in `.env`, then restart Node:

```dotenv
HOST=0.0.0.0
PORT=3000
```

Use `http://YOUR-COMPUTER-LAN-IP:3000` on your phone. Allow TCP port 3000 on
your local firewall if required. The computer must remain awake while testing.
Do not forward this test server's port on your router: it has no login system.
For private access away from home, use Tailscale Serve or your own VPN.
Phone camera scanning, service workers, and PWA installation need HTTPS;
plain LAN HTTP is suitable only for testing ordinary app features. Localhost
is treated as a secure origin on this computer.

Browser data is tied to the address: localhost, a LAN IP, and a future HTTPS
domain are different origins. Use the app's backup/restore tools or link your
test devices using its sync code. This server stores linked sync data in SQLite;
browser-only decks are not automatically copied to the server until sync is on.

## Ask AI Judge with Groq Free

Ask AI Judge calls Groq from the Node.js server. It does not run an AI model
on your own hardware and does not use Gemini or Cerebras as fallback providers.
Deck advice retains its separate provider configuration.

1. Create a Groq account at <https://console.groq.com> and keep it on the **Free**
   plan. Create an API key at <https://console.groq.com/keys>.
2. Edit the server's ignored `.env` file locally:

   ```dotenv
   GROQ_API_KEY=your_key_here
   GROQ_MODEL=openai/gpt-oss-120b
   JUDGE_DAILY=20
   JUDGE_GLOBAL=800
   ```

3. Restart `npm run dev` or `npm start`. With Docker, run
   `docker compose up -d --build` to recreate the container with the configuration.
4. Open **Menu → Ask AI Judge**. Tag relevant cards with `@` so their card text
   and rulings accompany the question.

There is no API parameter that forces free billing. The account must remain
on Groq's Free plan; adding this key to a paid account would use that account's
billing. Never put the key in browser code, synced settings, or a chat message.
The server keeps it in its environment, and Compose passes it into the container.

`openai/gpt-oss-120b` is the default; `GROQ_MODEL` selects one model, with no
automatic model or provider fallback. GPT-OSS requests use strict structured
output and a bounded completion. A conservative character budget limits context
size, preserving whole selected excerpts; Groq's token limits remain authoritative.
If the supplied context cannot fit, the app asks for a smaller question and
still shows the local rules. The question and selected card/rules text are sent
to Groq for processing.

The server respects Groq's `Retry-After` after a 429 response. The cooldown is
stored in SQLite and survives a restart. During the pause, cached answers remain
available, while uncached questions show their relevant rules. Setup and API-key
problems also show the rules with a useful status message.

The app's default allowance is 20 AI attempts per device per UTC day and 800
across the server. These are app limits, not a promise of Groq capacity; Groq
also limits requests and tokens. Failed upstream attempts count against the app
allowance, while cached answers do not. The cache identity includes the model,
prompt, and supplied card/rules text, so changed source text gets a new answer.
Rule numbers absent from the sent excerpts are removed and make an answer
unverified; these answers are not cached as confident rulings.

Check current model availability and quotas in the
[Groq model documentation](https://console.groq.com/docs/models) and
[Groq rate-limit documentation](https://console.groq.com/docs/rate-limits).
Provider behavior is tested with mocked Groq responses in `tests/judge.test.mjs`
and `tests/api-services.test.mjs`; browser failure handling is in
`tests/browser/judge.spec.mjs`. Automated browser tests use no real AI keys.

## Device sync

Open **Settings → Sync → Create sync code** on the first device. On another
device using this same server, choose **I already have a code** and enter it.
The server generates a 24-character code; it stores a SHA-256 hash, never the
code itself. There are no username/password fields, user accounts, or external
sync services. Anyone with the code can access that sync space.

`DATABASE_PATH` contains `sync_links` (hashed codes and revisions) and
`sync_records` (individual changes). They share the application's persistent
SQLite database and existing Docker volume. A transaction commits every sync
batch, with deletion tombstones and a stable revision cursor for paged reads.
Existing sync documents in the old SQLite `blobs` table are migrated on access;
their codes and original documents are preserved.

Sync records cover each deck, collection printing/condition/binder entry, binder,
folder, preference, and saved game. Independent records merge. When the same
record changes on two devices, the newer change timestamp wins; a tied timestamp
keeps the server's current value. Joining prefers server records with matching
identities and uploads local-only records. Deck versions retain local decks
before remote replacement or deletion.

Sync runs after startup, shortly after edits, on reconnect/foreground, and via a
small revision check every 30 seconds while visible. Offline or failed uploads
retain their pending markers. Unlinking cancels in-flight work and leaves local
data intact. Settings include color scheme, startup page, and view preferences.
Saved games sync as snapshots; receiving one does not change an active table.
The Life page still displays the latest ten saves, without deleting older server
records merely because they age out of that local view. Card-library downloads,
image/price caches, the link itself, and device brightness are excluded.

The same-origin `POST /api/sync` endpoint accepts `create`, `probe`, and `sync`
operations. An unknown code returns 404 rather than creating a space. The shared
record schema is in `shared/sync-records.cjs`; SQL operations are in
`server/sync-storage.mjs`, and the client is in `src/services/sync.js`.
`tests/sync.test.mjs` and `tests/browser/sync.spec.mjs` cover SQLite restart,
migration, code isolation, two-device merging, deletions, offline edits,
pagination, startup, concurrent edits, and unlinking.

## Node.js and npm

fnm is installed at `/home/remodj/.local/share/fnm/fnm`. Interactive Fish and
Bash terminals load it automatically. Open a new terminal, then run:

```sh
cd /home/remodj/Projects/Deckhand
fnm use
node --version
npm --version
npm ci
npm run env:check
```

Node should report `v24.22.2`. On a second computer, install fnm and run
`fnm install` inside this folder to install the version from `.node-version`.
Do not use `sudo npm install`.

Reference: https://github.com/Schniz/fnm#shell-setup

## SQLite

SQLite stores data in a file; it does not need a daemon, database account,
password, or separate Docker container. The `sqlite3` command is already
installed on this machine. Node has its own embedded SQLite library, which
can have a different version from the system command. These development
scripts use Node's `node:sqlite`; Node 24 may print an ExperimentalWarning.
The server uses the same embedded SQLite library for its storage adapter.

The local `.env` has been created with empty API keys. For another checkout,
copy `.env.example` to `.env` first. Both secrets and database files are ignored
by Git.

```sh
npm run db:init
npm run db:check
sqlite3 var/deckhand.dev.sqlite
```

At the SQLite prompt, try:

```sql
.databases
.tables
PRAGMA integrity_check;
.quit
```

The development file is `var/deckhand.dev.sqlite`. On startup, the server adds
a `blobs` table for sync documents and AI caches. Running `db:init` again does
not delete an existing database. Keep development data separate from future
production data. SQLite persists between server restarts.

## Docker Engine and Compose

Docker installation was not completed: administrator authentication requires
your password in your own terminal. Do not send the password in chat.

On CachyOS, install the packages using pacman. If a system update is pending,
complete the normal full update first; avoid refreshing package indexes with
`pacman -Sy` and then selectively installing packages.

```sh
sudo pacman -S --needed docker docker-compose docker-buildx
sudo systemctl enable --now docker.service
sudo docker run --rm hello-world
docker compose version
```

`enable --now` starts Docker now and at subsequent boots. You can keep using
`sudo docker` initially. If you prefer Docker without sudo, optionally run:

```sh
sudo usermod -aG docker remodj
```

Then log out of the desktop completely and log back in. Opening another
terminal is not enough to refresh group membership. Membership in the Docker
group grants root-level access; this is a convenience choice, not a requirement.

Reference: https://docs.docker.com/engine/install/linux-postinstall/

After `npm ci`, check the Node/SQLite environment in Docker:

```sh
cd /home/remodj/Projects/Deckhand
sudo docker compose -f compose.dev.yaml run --rm toolbox
```

This downloads the Node image and runs the same in-memory SQLite check as
`npm run env:check`. It exits when done and does not host the website or create
a persistent database. The checkout is mounted read-only. Use the host's
`npm run db:init` command to create your development database.

After joining the Docker group and logging back in, omit `sudo` from these
Docker commands.

## Everyday workflow

Use Node directly for the normal edit/run loop; Docker verifies the container
environment and will later package the app for your home server.

```sh
cd /home/remodj/Projects/Deckhand
git status
npm run env:check
npm run db:check
```

Run `npm test` to verify persistence, conditional writes, concurrent sync,
deletion tombstones, pagination, bounded sample downloads, and HTTP routes.

## Run the app in Docker, here or on the future machine

After Docker is installed:

```sh
cd /home/remodj/Projects/Deckhand
sudo docker compose build
sudo docker compose run --rm deckhand npm run data:sample
sudo docker compose up -d
sudo docker compose logs -f deckhand
```

Open http://localhost:3000. Ctrl+C exits log viewing without stopping the app.
Use `sudo docker compose down` to stop it. Rebuild with
`sudo docker compose up -d --build` after changing code. Stop the native Node
server first if it is already using port 3000.

The app runs as the unprivileged `node` user. The `deckhand-data` named volume
holds its database and sample files. It is separate from native Node's `var/`
folder and survives ordinary container rebuilds and `compose down`.
`compose down -v` would delete that volume; do not use it to deploy updates.

Compose publishes only on localhost by default. Set `BIND_ADDRESS=0.0.0.0` in
`.env` for intentional LAN access to the Docker deployment; `HOST` is always
`0.0.0.0` inside the container so the published port works.

On the future machine, clone this fork with these changes, create `.env`
from `.env.example`, and run the same Compose commands. No Node or SQLite
installation on that host is necessary. Set up private HTTPS access and
backups before making it your everyday instance. Export any browser-only
decks before moving to the new address, then restore them there.

For a consistent native SQLite backup while the server runs:

```sh
sqlite3 var/deckhand.dev.sqlite ".backup 'var/deckhand-backup.sqlite'"
```

Back up the resulting snapshot, not just the live main database file while
WAL writes are active. The server database does not include unsynced browser
data. Docker image execution still needs verification after Docker is installed
on this computer; the native Node HTTP and SQLite tests have passed.
