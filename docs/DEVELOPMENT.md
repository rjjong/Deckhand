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

The build generates `public/index.html` and `public/sw.js` alongside the bundles.
Their content hash includes JS, CSS, the HTML/worker templates and shell assets;
bundle URLs and the shell cache share this build ID. Edit the root templates,
not their generated copies. No manual service-worker version bump is needed.

`src/platform/updates.js` checks for updates at launch, on return to the app,
on reconnect and every five minutes while visible. A different build refreshes
automatically at launch/return unless the user has begun interacting, has an
editor/dialog/game open, or a deck save is pending. An **Update ready — reload**
button remains available; it waits for those activities to finish. Offline
launches use the installed build. Updates delete old Deckhand shell caches,
preserving card images, fonts, localStorage and IndexedDB. Real worker update,
offline, edit-preservation and reload tests are in `tests/browser/pwa-updates.spec.mjs`.

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

### Collection sorting and card details

Collection search reuses Search's `SORT_ICON` and `openCardSortMenu` presentation.
`src/pages/collection/sort.js` offers name, mana value and price in both directions.
Whole-collection and Wants sorting is session state; a real binder stores its choice
in `view.sort`/`view.sortDir` with its existing group selection. Legacy binder views
retain ascending name/mana and descending price defaults. Missing numeric data stays
last in both directions, with name tie-breaking. Sorting uses owned data and local
price/library caches without new upstream requests.

`src/ui/card-collection.js` supplies the shared quantity control and refreshes all
open counters whenever `saveCollection()` runs. Quantities include every printing
of the card. Collection-origin actions prefer the opened stack, preserving its
condition, foil and binder when re-adding at zero. Zero stacks leave the collection
without closing Card Details; object references keep navigation and late printing
responses tied to the correct item as array indices change.

Recommendations and Similar cards share a discovery row. Card Details has no
Combos action. `src/ui/card-tags.js` opens the existing tag editor in a themed modal,
with visual-viewport sizing, scrolling, focus restoration and Back support. Global
tags save independently; deck-specific tag changes still schedule a deck save.

`attachSwipeNav` animates only the `main` viewport. Its outgoing clip excludes the
header, subtitle and navigation, and the chevrons remain inside the hero bounds.

### App versions

Versions use **Major.Minor.Build**, starting at **2.0.0**. `version.json` is the
single source for the displayed version, backup metadata and `/version.json`.
Each `npm run build`, `npm run build:docker` or server deployment reserves one
new build number, even when the source is unchanged: `2.0.0`, `2.0.1`, `2.0.2`.
The first build after choosing a different major or minor starts at zero.

Choose major/minor explicitly:

```sh
npm run version:set -- 2.1   # Next build/deployment is 2.1.0
npm run version:set -- 3.0   # Next build/deployment is 3.0.0
```

Alternatively, edit the first two components of `version.json`'s `version`.
Keep `lastBuiltVersion`: it remembers the last assigned number, detects a change
of series and survives restarts/checkouts when committed with the source.
The build date is assigned automatically in UTC. Concurrent reservations are
serialized; failed build/deployment attempts can leave gaps, but numbers are
never reused within the current series.

`npm start`, `npm run dev`, automatic frontend watching and tests reuse the
assigned version. `npm run build -- --reuse-version` regenerates artifacts
without advancing it. Docker's internal build uses this option too: reserve the
version in the checkout with `npm run build:docker` instead of invoking
`docker compose build` or `docker compose up --build` directly. A deployment
reserves once before packaging, and its image build/startup reuse that version.
If Docker needs sudo, use `npm run build:docker -- --sudo`; only Docker runs as
root, so the version file remains owned by your development user.
Keep the updated `version.json` in your commits so another checkout continues
the counter. The content hash still controls service-worker cache updates.

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
offline. Menu has an Install app card above Settings. It opens the browser's
install prompt when available, or themed manual instructions (including Safari
on iPhone/iPad). HTTP LAN addresses show an HTTPS requirement instead. The card
is hidden when running as an installed web app or in the native Android app.

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
app sharing buttons have been removed. Tapping any main
page title returns home. The five labeled bottom tabs are Decks,
Collection, Search, Inspiration, and Life. Life opens a menu with new-game,
resume, and restore actions. A deck's title bar has its name and a Deck actions
button; renaming lives in that menu. Device/browser Back continues to navigate
the existing history.
Deck names are limited to 99 characters in create, import, and rename fields,
and normalized on load/save, including copies and synced decks.
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
overview places commander/partner cards on the left, with format, Commander bracket
estimate, issue review, and description on the right. Constructed decks omit the
commander area and bracket. Game logging stays in Deck Log. The Cards toolbar
contains deck count and value, the Tiles/Stacks/List dropdown, and sorting; price
opens the deck's price page and Review expands the legality details.
Deck Prices uses themed summary cards, budget fields, and card rows in
`styles/overrides/deck-prices.css`. Its single content viewport opens at the top,
with totals and budgets before the price filter and card list. Cards read from
most to least expensive, below the shared title bar and above bottom navigation.
The game-log form reuses the themed transfer-dialog header and controls, with
a scrolling body and pinned Save action. Its styles live in
`styles/overrides/game-log.css`; dropdowns read from the top, and form values
survive local redraws. The castability summary vertically centers its text
beside the percentage.
Stats mana-curve bars and color-distribution controls return to Decklist with
their criteria applied through Advanced Filters. Mana-value filters retain the
curve's land exclusions and 6+ bucket; color matching distinguishes identity,
cost symbols, and mana production. These choices remain editable in the filter
panel. A chart selection replaces earlier search/filter criteria so the list
shows the selected group. Stats has no combo section. Recent Changes and full
history use the same light button borders.
Promoting a card from the main deck or maybeboard refreshes the whole editor
after its details close, keeping commander artwork, partners, counts, and the
overview in sync while preserving the active search.
The yellow Add cards button opens Search pinned to the active deck.
Deck actions places a Rename icon beside the deck title and groups inspiration,
bulk editing, format, folders, sharing, versions, copies, and deletion. Separate
Import deck and Export deck buttons open their respective dialogs directly. Card-type
links jump directly to their deck groups. Filters and bulk editing fill
the screen with their own headers and scrolling content, covering the pinned
controls and Add button. Bulk Edit has a themed text editor and a pinned yellow
Check & save action, styled in `styles/overrides/bulk-editor.css`. The deck's
search, tabs, and Add button are hidden while full-screen tools are open.
The editor and navigation remain inert until the panel
closes; closing restores keyboard focus. These controls live in
`src/pages/decklist/controls.js`; deck styling lives in `styles/overrides/decklist.css`.
Collection filters use the shared full-screen panel that slides in from the
right, with reset/back controls and a floating search button. Collection's
Trade action is a title-bar icon. The collection total is omitted from the search
bar; collection valuation and historical data remain available in the data model.
`src/ui/search-fields.js` enhances page, popup, tag, combo, and dropdown search
fields in place, retaining their input state and handlers. Their shared field
styles are in `styles/overrides/search-fields.css`. Pinned search surfaces use
the same viewport-aligned background fade as their pages, with the field surface
and outline painted above that fade.
Search viewports reserve equal scrollbar space on both sides to center their
fields and results. Page search icons use the same left padding as deck search.
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
share one server queue across tabs and devices, with at least 500ms between
request starts. Duplicate GETs and identical POSTs coalesce. Searches and
autocomplete results are cached for 30 minutes; card details, collection POSTs,
sets and catalogues for 24 hours. Random cards bypass the response cache.
The bounded response cache (100 entries / 20 MiB), request counters and cooldown
are stored in SQLite and survive restarts. Downloaded card/rulings files also
remain on disk.

The server allows at most 600 upstream requests per UTC hour and 3,000 per UTC
day. Cache hits do not consume this budget and remain available during pauses.
On 403, 429 or an HTML/Cloudflare challenge, upstream requests stop: the default
pause is 15 minutes and grows after repeated refusals. Numeric and HTTP-date
Retry-After values are respected, with a minimum pause of one minute. Network,
server and invalid-response failures also pause upstream traffic. Redirects are
not followed, and card lookups reject destinations outside the configured API.

The browser shares the API cooldown through localStorage, including across
reloads, and stops queued GETs and POSTs. Price refreshes keep cached prices
after refusals without scheduling automatic retries. Collection repricing runs
at most once every 24 hours.

Deckhand does not scrape Cardmarket: prices come from Scryfall or the local card
library. Cardmarket links open only after an explicit click, with ten seconds
between opens to limit bursts of new pages. These are application safeguards,
not a published Cardmarket allowance or a guarantee against blocks. Other apps,
open Cardmarket pages and devices sharing your internet address can still
generate traffic. An existing block must expire or be resolved with the site;
repeatedly reloading the blocked page can extend a rate-limit block.

Unreleased-set probes, full tile-art prewarming, and random-card startup
prefetching are disabled for self-hosted sessions. Random cards use the local
library when it is loaded. An explicit data-source refresh can still check sets.
Scryfall search 404s meaning no matches become a normal empty results list at
the local adapter; genuine missing named cards remain 404s.

Runtime configuration advertises available local data files. Missing prices,
tags, combos, and metagame datasets are skipped rather than fetched on startup.
No placeholder data is generated to pretend these optional datasets exist.

AI features require the local Ollama service; an unavailable model produces a
clear message while the relevant rules remain visible. The old feedback form, bundled Android APK, and web push
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
Use the HTTPS deployment for public access; keep the development server on your LAN.
For private access away from home, use Tailscale Serve or your own VPN.
Phone camera scanning, service workers, and PWA installation need HTTPS;
plain LAN HTTP is suitable only for testing ordinary app features. Localhost
is treated as a secure origin on this computer.

Browser data is tied to the address: localhost, a LAN IP, and a future HTTPS
domain are different origins. Use the app's backup/restore tools or link your
test devices by signing into the same account. This server stores synced data in SQLite;
browser-only decks are not automatically copied to the server until sync is on.

## Local AI Judge and deck advice

Both AI features use Ollama on your server. There are no remote AI providers, keys, automatic model fallbacks, or paid requests.

The pinned default is `qwen3:4b-instruct-2507-q4_K_M`, a 2.5 GB text model chosen to leave room on a 4 GB GPU.
The runtime uses a 4096-token context, one inference at a time, a queue of at most three waiting requests and a ten-second queue wait limit.
The Judge streams readable progress over SSE while Ollama emits NDJSON tokens.
The browser keeps the explanation visible when the final ruling and validated
rule citations arrive. JSON cache hits and early errors remain compatible.
Leaving or clearing the Judge aborts the request and releases its model slot;
partial or failed responses are never cached as completed answers.
Inference has a 75-second deadline; a busy server returns a clear message rather than starting more concurrent models.
The smaller model has less reasoning capacity than large hosted models. Judge answers remain grounded in tagged Oracle texts and selected rules; unsupported citations are removed and mark an answer uncertain.

For Docker:

```sh
npm run build:docker
docker compose up -d --no-build
docker compose exec ollama ollama pull qwen3:4b-instruct-2507-q4_K_M
```

For native development, install [Ollama](https://docs.ollama.com), pull the same model, and put these in `.env`:

```dotenv
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3:4b-instruct-2507-q4_K_M
OLLAMA_TIMEOUT_MS=75000
JUDGE_DAILY=20
JUDGE_GLOBAL=800
```

Compose sets its own private `http://ollama:11434` address and publishes no Ollama port. `OLLAMA_NO_CLOUD=1` disables Ollama cloud features.
Only loopback, supported Docker hostnames and private IPv4 addresses are accepted; cloud model names are rejected.
Ollama's model volume persists between releases and is deliberately excluded from app-data backups because it can be downloaded again.
SQLite caches incorporate the selected local model, current card text, rules and prompt. Old hosted-model answers are not reused.

See [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs), [hardware support](https://docs.ollama.com/gpu), and [server GPU setup](SERVER.md#local-ai-and-gpu-acceleration).

## Experimental single-card scanner

Open **Collection → + → Scan cards** or **Menu → Scan cards** to enter the camera
directly. The camera slides in from the right as a separate full-screen
view, covering the underlying page and navigation. Recognition runs continuously
while this view is visible, with a newest-first detection log below the preview.
There is no shutter button. Hold one card steady with all corners visible.

Two matching frames confirm an identity. The same held card is logged once;
moving it out of view for about 1.2 seconds allows another copy to be scanned.
Changing to a different card can be confirmed immediately without a blank frame.
Printings sharing an Oracle identity are treated as one held card to avoid
duplicate entries from prediction jitter. Only confirming frames request image
thumbnails, reducing bitmap transfers and memory pressure on mobile browsers.

**Settings → Card scanner** adds an optional debounce time (0–60 seconds) and
**Ignore previously scanned cards**. Debounce compares normalized card names,
including different printings, against the last accepted scan of that name.
Ignored detections do not extend the cooldown. The session option logs each name
once until the camera closes; reviewing/adding a card keeps the session intact.
Both default to off, preserving the held-card suppression described above.
Settings are saved in `settings:app`, included in backups and account sync, and
read when opening the camera. Older preferences use these defaults. Name checks
run after resolving card details, in detection order even if lookups finish out
of order; known identities are filtered before another row or lookup is created.

Recognition settings in the same section include **ID threshold** (0–1, default
0.60), **Corner threshold** (0–1, default 0.02) and **Scan interval** (100–10,000 ms,
default 650 ms). Higher thresholds require stronger identity/detector confidence;
valid card geometry is always required. Both thresholds are applied before stable
confirmation and retained for card-detail lookups, including ID thresholds below
the old fixed 0.60 cutoff. Each queued worker request uses CollectorVision's
existing config message to set its corner threshold. This preserves the warmed
models and avoids leaking a previous session's threshold into later requests.
The interval is the minimum start-to-start time; inference remains serialized
and slower devices can take longer. **Show scan framerate** is off by default.
It overlays completed scans per second, averaged over the last six completions,
including interval/inference time. It resets on pause, review and reopening.
All scanner preferences are normalized, backed up and account-synced.

Each entry is inserted when detected, so slow card details never reorder the
log. Detail lookups are shared by printing within this scanning session. Failed
details show a tap-to-retry entry rather than retrying on every camera frame.
The log is local to this open scanning session. Logging does not add collection
items. Tap an entry to review it, adjust printing, condition, foil, amount and
binder directly, then use the pinned **Add to collection** button. Review shares
the collection add form and save/merge logic with the regular collection sheet.
Alternate printings load in the background while the detected printing remains
usable. Automatic binder choices and new-binder prompts open above review.
Adding or closing with the top-right X returns to the retained live log; no
second collection-add sheet is opened. The Experimental badge sits beside
the review credits. Inference pauses while review covers the camera and resumes
when returning to the live view.

[CollectorVision](https://github.com/HanClinto/CollectorVision) replaces contour
detection and OCR. Its Fastweb-Single 1.39 detector finds the corners, its worker dewarps
the image, and its Milo embedder searches a packed reference catalog, checking
both orientations. Inference uses ONNX Runtime Web in a worker with WASM and
one thread when cross-origin isolation is unavailable. It does not use the
server's GPU or compete with the AI judge. The preview uses `object-fit: cover`
to fill the available space without stretching. Frames are cropped to the same
visible region before recognition. Capture metadata retains the source dimensions
and crop offsets, mapping detected corners back through the current preview crop.
The outline stays aligned when the camera view resizes and
clears on missing/invalid corners, pause and close. Cards can be smaller, off-center
or tilted: the existing homography and bilinear sampling straighten the detected
four corners before embedding, without requiring a fixed alignment rectangle.

Repeat settings report `session` or `debounce` when a name is ignored, including
different printings resolved asynchronously. A small camera notice identifies
the name and reason for 2.5 seconds. Held repeats notify once per presentation,
then rearm when a card is removed or another card is presented. Default held-card
suppression alone does not claim that a user setting ignored the card.

Blank Card is excluded by its known printing IDs, shared Oracle ID
`d3e7bc24-c2b0-4be3-b9d9-8a8d23b93bc7`, or resolved name. Known predictions never
produce a log row, lookup, outline or repeat-setting notice. A name fallback silently removes
an unexpected future printing if its metadata resolves to Blank Card. The
camera's alignment hint is removed; ordinary repeat notices remain available.

Capture prefers 1920×1080 (1080×1920 on portrait screens) at up to 30 video FPS,
with `resizeMode: { ideal: 'none' }` to prefer native camera frames. Unsupported
constraints use the browser's best available stream. If both negotiated dimensions
are smaller than the 1080p target, one optional adjustment requests that target in
the orientation actually supplied by the track, within its exposed capabilities.
A working stream is never deliberately reduced because recognition is slow.
Continuous autofocus is requested when exposed, falling back to single-shot focus
on cameras that support only that mode. Tapping the preview reapplies focus with a
point of interest when the browser supports it, mapping the visible cover crop
back to source coordinates; keyboard activation uses the center. Camera changes
are serialized, preserve unrelated constraints and never block recognition. Closing
or pausing prevents queued changes. Unsupported adjustments leave scanning available.
The optional FPS overlay includes actual `videoWidth` and `videoHeight`, updated
on video resize rather than presenting the requested resolution as achieved.

Live analysis normalizes the source to a 1280-long-edge,
720-short-edge budget before applying the visible crop. A 1080p preview therefore
does not increase analysis dimensions, while the detector's 384×384 and embedder's
448×448 input sizes stay fixed. One capture canvas is reused between frames.
The scan loop never queues overlapping inference. There is no resolution downgrade
based on inference time: exceeding the selected interval does not establish that
camera capture caused the delay. Browser tests use emulated camera tracks and cannot
verify a physical phone's optical focus, lens selection or preview detail.

`viewport.js` gives the camera and log one scroll area below the title bar. The
actions remain sticky. Once the preview is covered, the camera tracks stop and
in-flight results are ignored; scrolling back automatically opens a fresh stream
using the same loaded engine. A background/page-hide pause still requires Resume.

`selection.js` implements a 480 ms hold, with cancellation on pointer movement,
cancel or leave. Space selects with a keyboard; taps toggle while selection is
active. `log.js` owns selected rows, asynchronous metadata and session-only photos.
The + action adds only selected ready rows through
`collection.js`: one NM/nonfoil copy per detection, no binder, merging matching
collection stacks and saving once. Individual review retains its richer controls.
Select all snapshots visible rows without automatically selecting later detections.
The + action is gray and disabled when no eligible rows are selected, and the log
also enforces selection so bypassing the disabled control cannot add everything.
Both collection add paths remove the saved rows and their photo sources from the
log. Removed rows retain only their metadata for repeat history. Delete removes log entries,
including their photos, and never changes collection data. Deleted accepted scans
still participate in session repeat history so suppressed duplicates do not reappear.
Ownership quantities sum card names across printings, finishes and binders; wants
are excluded. Counts refresh after metadata, review, add and delete operations.

The Decks FAB opens `openCardScanner({ mode: 'deck' })`. In this mode the camera,
selection and photo lifecycle are shared, but repeat delay/session suppression are
disabled in the session snapshot so a physical deck can contain repeated names.
Saved preferences are not modified and held-card suppression still applies.
`log.prepareAdd()` captures a batch with a validity check and a one-use commit;
cancelling a destination or new-deck dialog leaves every scan pending. Committing
marks only the transferred rows, preventing another bulk add from duplicating them.
Collection commits remove those rows; deck commits keep their destination labels.

`decks.js` provides a themed, keyboard-accessible destination picker above the
camera/review. New decks reuse `openModal('newdeck')` through an `onCreate` callback;
the normal New Deck flow still opens its editor. Scanner-created decks use the
factory's `open: false, persist: false` options and save once after receiving cards.
Each scan is copied with `pin: true` to retain its printing. A matching commander
or partner occupies its existing command slot once per destination/session; further
physical copies remain in the main deck. The importer preserves all other copies,
including those the deck editor may flag as illegal, rather than silently dropping
parts of the physical deck. No collection writes or remote requests are needed.
Single-card review uses the same deck destination in deck mode. Cancelling/back
restores the parent dialog and focus; closing the scanner also closes its picker
and any owned new-deck dialog.

Closing aborts the log, clears image sources and entries, zeros the capture canvas,
and queues `clearFrames` behind any in-flight inference and ahead of future frames.
Aborted results skip thumbnail creation. The worker zeros retained frame, dewarp,
detector and embedder image buffers while retaining model sessions and the catalog.
Camera photos are never written to browser storage, uploaded, or added to collection
records. Cached reference card images and model assets are separate from camera photos.

The pinned worker, license and local changes are under
`assets/scanner/collectorvision/`. `scripts/prepare-scanner-assets.mjs` downloads
the upstream prepared bundle once, verifies its SHA-256, extracts only known
files, and caches them under ignored `assets/scanner/generated/`. Frontend and
Docker builds prepare these assets automatically. Deployments include the
public model/catalog assets so the server can build without downloading them
again. Large generated files are not committed to Git. To update the snapshot,
update the bundle pin in `scripts/scanner-assets.mjs`, the vendor source and
provenance together, then rerun the real recognition tests.

Fastweb-Single 1.39 is downloaded separately from pinned Hugging Face revision
`2ef37ff78ee80ad4c3558e4a15341e447ff8a1be`, verified as 3,185,226 bytes with SHA-256
`05d2b90b928a5a3bf0f49aa90aa86211b2103d9c347c238fd18b4f544b3cb8ca`.
Its 384×384 ImageNet RGB input and named `corners`, `presence`, `sharpness` outputs
use the existing worker contract; sharpness remains the confidence gate because
this model's compatibility presence output is constant. The committed manifest
selects its versioned model URL. A detector-specific manifest query bypasses old
Cornelius manifests while preserving the unchanged Milo model, catalog and runtime
caches. New builds select Fastweb-Single instead of Cornelius. The build hash
includes detector metadata and the shipped manifest.

After the first page loads, `src/features/scanner/session.js` warms one shared
worker in idle time. It loads the models/catalog and runs both inference graphs
with empty tensors before reporting readiness. This never opens the camera or
requests permission. Opening/closing the scanner reuses that worker for the app
session. Closing a view cancels its wait/scan, leaving initialization and other
views intact; inference requests are serialized and canceled results discarded.
Failures stay quiet during startup and can be retried when opening the camera
or reconnecting. A full page exit releases the worker; backgrounding stops the
camera while keeping recognition ready.

Models, WASM and reference data are served by Deckhand (about 70 MB on first
initialization). Model/catalog buffers are cached in IndexedDB. The service
worker caches the manifest and ONNX runtime under a scanner-bundle-specific
cache name. App updates retain this cache; a changed scanner bundle replaces
it. The small scanner worker source is also part of the offline app shell.
Photos stay on-device. A successful match can request its Scryfall card details
through the existing paced proxy; no photo is uploaded and scanning does not
require the separate local Oracle library. Camera tracks stop on back, close,
navigation, backgrounding and late permission replies. Camera permission is
requested only when the user enters scanning. There is no photo picker.

The catalog is the prepared `milo1-scryfall-mtg-2026-07-09` snapshot with 109,711
reference entries. Newer cards may be absent. Recognition remains visibly
**Experimental**: confirm the card and printing, and choose foil/condition when
adding. Sleeves, glare, unusual frames and partly hidden cards can reduce accuracy.
License, source provenance and notices are linked from the scanner.

`tests/browser/scanner.spec.mjs` exercises real model inference on a photographed
Scrying Glass, upside-down recognition, blank rejection, full-screen camera
live detection/log order, duplicate suppression and re-arming, delayed/failed
card details, session name filtering across printings, review/collection insertion, background warm-up without camera
permission, shared-engine reuse, offline cache reuse, camera denial and cleanup. Tests
use the bundled upstream sample and stub only card details/camera hardware;
they do not call external recognition services.
`tests/browser/scanner-settings.spec.mjs` checks preference controls, mobile fit,
reload persistence and defaults for older saved settings. Node tests cover
cooldown boundaries, name normalization and typed setting sync/restore.

## Accounts and device sync

Accounts are optional. **Settings → Account & sync** supports signup, email
verification, login, logout, password recovery and one-time imports of old sync
codes. Guests see a warning in Decks, Collection and Menu: data is stored only on
this device and can be lost without backups. All other app features work locally.

`server/accounts-storage.mjs` creates account, session, action-token, rate-limit
and legacy-claim tables beside the existing sync tables in SQLite. Emails are
normalized to lowercase. Passwords use Node's scrypt (N=131072, r=8, p=1), random
salts and constant-time comparison, with one active hash and a bounded queue.
Only session/reset-token hashes are stored. Cookies are HttpOnly, SameSite=Lax,
and Secure with a `__Host-` name when `PUBLIC_URL` is HTTPS. Credentials never
enter localStorage, exports or frontend configuration. Login requires verified
email. Password reset links expire after 30 minutes, verification after 24 hours;
reset consumption revokes all sessions and outstanding links. Recovery returns
the same response for existing and unknown addresses. Authentication and email
requests have persistent rate limits, including a global email budget.

The same-origin `/api/account` endpoint provides GET session/status and POST
register/login/logout/forgot/resend/verify/reset/migrate operations. Mutating
session operations require a CSRF token from the session response. Cross-origin
requests are rejected, and non-JSON requests cannot submit credentials. Email
links carry their tokens in fragments, which are removed immediately on entry;
links also work when opening in an already running tab. Resend sends verification
and reset emails; see `PUBLIC_URL`, `EMAIL_FROM` and `RESEND_API_KEY` in `.env.example`.
Email must be configured before signup can create accounts. Email-service keys
remain only in the ignored private environment file, never in SQLite or the
browser bundle. Account screens are in `src/pages/settings/account.js`; identity
and workspace logic is in `src/services/accounts.js`.

The public `POST /api/sync` endpoint requires an authenticated, verified session
and CSRF token. Only probe/sync operations are accepted. The server selects the
account's sync space; submitted codes or account IDs cannot select another user.
Old code-only requests return 401. Existing legacy data remains in SQLite and can
be claimed once by a signed-in account presenting its previous code. Records are
copied transactionally; the original data remains intact. The first sign-in can
copy guest decks and collection into a private workspace. A previous guest link
is migrated automatically when that option is selected, retaining pending edits
and deletion markers. Another account cannot claim the same legacy space.

Each signed-in user has a separate `deckhand_user:<id>:` localStorage namespace
and `deckhand-decks-<id>` IndexedDB database. Guest storage keeps its original
names. Signing out returns to that guest workspace; signing back in restores the
account workspace. Other tabs reload when the active account changes, while
in-flight requests are cancelled. Backups use the portable original key layout
and exclude session/sync credentials. Card libraries and cached images are shared.

Sync records cover each deck, collection printing/condition/binder entry, binder,
folder, preference and saved game. Independent records merge. For matching
identities the newer change timestamp wins, with the server winning ties. On the
first join, matching server records take precedence; local-only records are added.
SQLite transactions retain deletion tombstones and stable paginated revision cursors.
Sync runs after startup, edits, reconnect/foreground and a visible 30-second tick.
Failed/offline uploads retain their markers. Receiving saved games does not change
an active table; displaying only ten recent games does not delete older server saves.

`tests/accounts.test.mjs` checks password storage, recovery, CSRF, session revocation,
SQLite persistence, account isolation and migration. Browser accounts/sync tests use
real cookie sessions and an in-memory email sink, never actual outgoing emails.

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

For the configured Ubuntu server at `192.168.3.50`, use the
[server guide](SERVER.md). It deploys the current working tree, preserves shared
data and configuration, and configures daily backups. The commands below
describe a separate local Docker instance with its own sample data.

After Docker is installed:

```sh
cd /home/remodj/Projects/Deckhand
npm run build:docker -- --sudo
sudo docker compose run --rm deckhand npm run data:sample
sudo docker compose up -d --no-build
sudo docker compose logs -f deckhand
```

Open http://localhost:3000. Ctrl+C exits log viewing without stopping the app.
Use `sudo docker compose down` to stop it. Rebuild with
`npm run build:docker -- --sudo` followed by
`sudo docker compose up -d --no-build` after changing code. Stop the native Node
server first if it is already using port 3000.

The app runs as the unprivileged `node` user. The `deckhand-data` named volume
holds its database and sample files. It is separate from native Node's `var/`
folder and survives ordinary container rebuilds and `compose down`.
`compose down -v` would delete that volume; do not use it to deploy updates.

Compose publishes only on localhost by default. Set `BIND_ADDRESS=0.0.0.0` in
`.env` for intentional LAN access to the Docker deployment; `HOST` is always
`0.0.0.0` inside the container so the published port works.

No Node or SQLite installation on the Docker host is necessary. Export any
browser-only decks before moving to another address, then restore them there
or sign in to the same account on both addresses served by this server.

For a consistent native SQLite backup while the server runs:

```sh
sqlite3 var/deckhand.dev.sqlite ".backup 'var/deckhand-backup.sqlite'"
```

Back up the resulting snapshot, not just the live main database file while
WAL writes are active. The server database does not include unsynced browser
data. The Ubuntu server uses the same online-backup mechanism for scheduled
and pre-update snapshots. Local Docker installation on this development PC
is independent of the server's Docker installation.
