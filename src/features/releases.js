// features / releases

// Release metadata and update notices.
const APP_VERSION = DECKHAND_VERSION;

const CHANGELOG_NOTES = {
  en: [
    'Card-type counts move into deck Stats, where tapping a type filters the deck list',
    'Deck actions group management, history and notes, and sharing, with Bulk edit removed from the menu',
    'Proxy changes in deck card details update ownership without rebuilding the page or losing its scroll position',
    'Collection Value shows rising card prices in green in both light and dark themes',
  ],
};

/* The history. When publishing release notes, move the previous CHANGELOG_NOTES
   to the top of CHANGELOG_HISTORY (with its date), then write the new notes
   above. Version and date come from the build. The start-up note shows every release since the
   player's last visit; Settings -> Version & changelog shows the current major version history. */
const APP_DATE = DECKHAND_RELEASE_DATE;

const CHANGELOG_HISTORY = [
  {
    v: '2.1.7',
    d: '2026-11-12',
    en: [
      'Monarch and initiative indicators appear only in the normal life view, keeping player option buttons in place',
      'Counter pickers align with the right-corner # button and animate from it, respecting reduced-motion preferences',
      'The mana picker places Back to counters at the left of the color row',
    ],
  },
  {
    v: '2.1.6',
    d: '2026-11-12',
    en: [
      'Life player controls use larger buttons and a wider Done button, with the counter picker at the right corner',
      'Player names remain centered independently of commander tax and other counters',
      'Counter and mana strips drag in every player orientation without changing counts or triggering hold resets',
    ],
  },
  {
    v: '2.1.5',
    d: '2026-11-12',
    en: [
      'Player options keep Done centered at the bottom with compact monarch, dungeon and counter controls',
      'Symbol pickers enable commander tax, colored mana, storm, energy and experience counters independently for each player',
      'Tap counters to increase, hold to reset; commander tax increases by two mana and long counter rows scroll horizontally',
      'Mana colors and amounts stay with saved games and account sync; old mana counters become colorless mana',
    ],
  },
  {
    v: '2.1.4',
    d: '2026-11-11',
    en: [
      'Deck card details show a deck quantity with direct plus and minus controls above collection quantities',
      'Saved deck versions use a themed dialog with newest versions first and fixed close controls',
      'Deck Inspiration categories can be expanded or collapsed, remember their state while browsing, and no longer show a land-base button',
    ],
  },
  {
    v: '2.1.3',
    d: '2026-11-11',
    en: [
      'Stacks focus lower in the viewport and allow the final cards to be fully revealed',
      'Deck issues appear inline in red with a warning icon, without a duplicate validity popup',
      'Deck Inspiration replaces the Deck Log tab; games and notes remain available from Deck actions',
      'Swipe navigation slides the deck content, and existing-deck actions no longer offer replacement import',
    ],
  },
  {
    v: '2.1.2',
    d: '2026-11-10',
    en: [
      'Decklist, Stats and Deck Log use full-width tabs with swipe and keyboard navigation that stops at either end',
      'Deck sorting moves beside advanced search filters; display mode sits beside the price, with one issue-review action',
      'Stacks automatically reveal a full card as you scroll and keep proxy, ownership and transform controls inside that card',
    ],
  },
  {
    v: '2.1.1',
    d: '2026-11-10',
    en: [
      'Floating action menus align smaller circular option icons above the circular close button',
      'Collection selected-card actions use the same animated floating menu as the add buttons',
    ],
  },
  {
    v: '2.1.0',
    d: '2026-11-10',
    en: [
      'The complete scanner catalog now lives on the server and automatically checks for new cards every six hours',
      'Phones keep camera processing and Milo1 recognition on-device, sending only the small recognition fingerprint for matching',
      'Verified incremental catalog updates keep the last good version available; scanning resumes automatically after connection problems',
    ],
  },
  {
    v: '2.0.43',
    d: '2026-11-10',
    en: [
      'Light-theme deck, folder and binder artwork uses pale translucent overlays with dark text',
      'Floating add buttons share animated, separate action bubbles and matching deck-editor add controls',
      'AI Judge availability moves to the hammer button with a busy indicator and live cooldown countdown',
      'Unsorted shows only unfiled spare copies, excludes Wants, and keeps Playing copies safe during bulk moves and removals',
      'Narrower page margins give content and search fields more screen space',
    ],
  },
  {
    v: '2.0.42',
    d: '2026-11-10',
    en: [
      'The deck overview always uses tiles and shows every deck in expandable format sections, with custom folders still available',
      'Sort decks by last changed, name or price from the search bar; the choice syncs across devices',
      'Pulling down to refresh the random card gives a short vibration',
      'Device appearance sets the default scheme: Rakdos in dark mode and Azorius in light mode; saved colour choices take priority',
    ],
  },
  {
    v: '2.0.41',
    d: '2026-11-10',
    en: [
      'News scrolls directly with the page, without a surrounding panel; the logo slides away as you read',
      'Scrollbars are hidden throughout the app, with a subtle edge animation at scroll boundaries that respects reduced-motion settings',
      'Taller deck, folder and binder tiles fill their backgrounds with card artwork',
      'Automatic folders no longer show a bottom label; binder symbols float at the bottom right without a background strip',
    ],
  },
  {
    v: '2.0.40',
    d: '2026-11-09',
    en: [
      'Decks, folders and binders share equal-size tiles with full-cover card artwork and readable blurred information overlays',
      'Hold a tile to choose its cover art or restore Automatic; default artwork uses the commander or first card',
      'Cover choices are saved on this device and included in account sync and backups, including automatic folders',
    ],
  },
  {
    v: '2.0.39',
    d: '2026-11-08',
    en: [
      'Removed vibration test buttons from scanner settings and the camera preview; successful scans still give vibration feedback',
    ],
  },
  {
    v: '2.0.38',
    d: '2026-11-08',
    en: [
      'Test vibration in scanner settings sends two noticeable pulses and reports whether the browser accepted the request',
      'The optional camera timing display can test vibration with the camera open and shows the result of scan vibration requests',
      'Vibration diagnostics distinguish unsupported browsers, missing interaction, background pages and rejected requests without claiming the phone motor moved',
    ],
  },
  {
    v: '2.0.37',
    d: '2026-11-08',
    en: [
      'Scanner duplicate filtering uses exact printing IDs, so different sets and artwork are logged separately even with the same card name',
      'Printing confirmation also uses exact IDs instead of grouping printings by Oracle identity',
      'Stronger 70 ms success vibration fires as soon as an accepted scan is ready, without waiting for unrelated card lookups',
    ],
  },
  {
    v: '2.0.36',
    d: '2026-11-08',
    en: [
      'Live corner outlines update independently while card identification runs, using the same accurate card detector',
      'Faster pixel preparation preserves the detector input exactly; recognition reuses corners from the same captured frame',
      'Successfully logged scans give a short vibration; ignored, held and failed scans stay silent',
      'The optional timing display shows corner update speed separately from completed card scans',
    ],
  },
  {
    v: '2.0.35',
    d: '2026-11-08',
    en: [
      'Removed the scanner debounce-time setting and repeat delay; obsolete saved values no longer affect scans',
      'Session duplicate filtering and held-card protection remain available, with sync compatibility for older app versions',
    ],
  },
  {
    v: '2.0.34',
    d: '2026-11-08',
    en: [
      'Faster live scanning uses a 200 ms default interval while retaining two-scan confirmation and the complete card catalog',
      'Scanner benchmarks WebGPU against CPU inference and keeps the faster accurate backend, with CPU fallback',
      'Threaded inference, faster perspective correction and conditional orientation checks reduce recognition work',
      'Show scan framerate also displays processing timings and the active inference backend',
    ],
  },
  {
    v: '2.0.33',
    d: '2026-11-08',
    en: [
      'Fixed cloud sync rejecting the hide binder and folder prices preference, including its default false value',
      'Sync now distinguishes rejected data and cloud storage limits from connection failures while preserving pending local changes',
    ],
  },
  {
    v: '2.0.32',
    d: '2026-11-08',
    en: [
      'Dungeon dialogs use a compact icon-only header with All dungeons on the left and Close on the right; the title, description and Done button are removed',
      'Larger Monarch and Initiative badges keep the same bottom-left position in normal play and player options',
    ],
  },
  {
    v: '2.0.31',
    d: '2026-11-08',
    en: [
      'Settings can clear completed trade history while preserving the current trade and collection',
      'Scan cards is a startup option that opens collection scanning and returns to Collection on Back',
      'Settings shows changelog entries for the current major version',
      'Hide binder and folder prices in Settings while keeping individual card prices visible; the preference syncs across devices',
    ],
  },
  {
    v: '2.0.30',
    d: '2026-11-08',
    en: [
      'AI Judge shows live availability and immediately reports when it is helping another player',
      'New-question budgets default to 10 per account per day, a 30-second cooldown and 100 per day for the server',
      'Saved rulings remain free during cooldowns and daily limits; busy or unavailable requests do not spend allowance',
      'Judge and deck advice share one model slot, with no waiting queue',
    ],
  },
  {
    v: '2.0.29',
    d: '2026-11-08',
    en: [
      'Player options group Monarch, Dungeon and the new counter selector beside Done; Initiative moves into Dungeons',
      'Dungeon progress sits above life, with crown and torch status icons in the bottom-left corner',
      'Track mana, energy, experience, commander casts and storm per player; Commander games show cast count by default',
      'Counter values and visibility are retained in saved games and account sync',
    ],
  },
  {
    v: '2.0.28',
    d: '2026-11-08',
    en: [
      'Clear trade sits beside Confirm trade; the title bar opens Trade history',
      'Tap You to name the other trader, with the name saved in the draft and completed trade',
      'Confirmed trades retain their cards, quantities and agreed prices in a themed history page',
    ],
  },
  {
    v: '2.0.27',
    d: '2026-11-08',
    en: [
      'Long-press Wants cards or use Select all to select several entries',
      'Bulk add sends the selected wanted quantities to one binder and fulfills matching proxies',
      'Bulk removal dismisses selected Wants while preserving deck contents and owned inventory',
    ],
  },
  {
    v: '2.0.26',
    d: '2026-11-07',
    en: [
      'Basic lands, snow-covered basics and Wastes are excluded from Collection, Playing, Wants and their totals',
      'Deck search, imports and deck scans keep basic lands without creating collection entries or wanted proxies',
      'Collection additions, imports and scans skip basic lands; existing records remain preserved in backups',
    ],
  },
  {
    v: '2.0.25',
    d: '2026-11-07',
    en: [
      'Wants + opens a themed binder dialog directly, with a larger image you can tap to change printing',
      'Deck copies without owned inventory are marked as proxies and always appear on Wants',
      'Ownership stays consistent after collection changes, imports, restores and sync without inventing inventory',
    ],
  },
  {
    v: '2.0.24',
    d: '2026-11-07',
    en: [
      'Add to collection uses a centered themed popup for single cards and deck selections',
      'The Card Details Add to deck popup has themed destination buttons and clearer quantity controls',
      'Both popups keep their headings and actions visible while scrolling on smaller screens',
    ],
  },
  {
    v: '2.0.23',
    d: '2026-11-07',
    en: [
      'The deck + menu offers Search cards, Import cards and Scan cards for the current deck',
      'Import cards adds a list or text file while keeping existing cards and commanders',
      'Scanning from a deck keeps that deck selected, with the same physical-copy and proxy choices',
    ],
  },
  {
    v: '2.0.22',
    d: '2026-11-07',
    en: [
      'The automatic Playing folder shows owned copies currently used in your decks',
      'Search and deck scans reuse owned copies and add only missing copies to your collection',
      'Choose proxies in deck pickers, pinned Search or Card Details to put those copies on Wants',
      'Proxy status survives backups and account sync; removing a deck card keeps the physical copy owned',
    ],
  },
  {
    v: '2.0.21',
    d: '2026-11-07',
    en: [
      'Settings contains preferences and backups; Account & sync opens from the main menu',
      'Removed Data sources and manual data refresh/download controls from Settings',
      'Scan cards opens from Collection and binder + menus instead of the main menu',
    ],
  },
  {
    v: '2.0.20',
    d: '2026-11-07',
    en: [
      'Card Details uses the Inspiration label and a vertically centered minus icon',
      'Binder tiles show icons and card totals without cover images',
      'Scan cards is available from a binder’s + menu and adds scans to that binder',
    ],
  },
  {
    v: '2.0.19',
    d: '2026-11-07',
    en: [
      'Tap binder group headings to collapse or expand their cards',
      'Each binder remembers collapsed groups while you browse, sort and filter',
    ],
  },
  {
    v: '2.0.18',
    d: '2026-11-07',
    en: [
      'Binder group headings appear above their cards in every grouping mode',
      'Color grouping separates multicolored cards by exact color combination, with matching mana symbols',
    ],
  },
  {
    v: '2.0.17',
    d: '2026-11-07',
    en: [
      'Collection folders have headings above Binders, Automatic folders and Unsorted cards',
      'Trade is available from the Collection overview and Menu; All cards has collection value and history',
      'Binder settings open full screen from the right through the edit icon or after creating a binder',
      'Removed binder cover selection; selected cards show a numeric count and reset when changing folders',
    ],
  },
  {
    v: '2.0.16',
    d: '2026-11-07',
    en: [
      'Collection search has the same sort control as Search, with name, mana value and price orders',
      'Card Details shows collection quantities with compact plus/minus controls and grouped discovery buttons',
      'Tags open in a themed popup and the Combos button is removed from Card Details',
      'Card swipes keep the header and navigation fixed, with both arrows inside the screen',
    ],
  },
  {
    v: '2.0.15',
    d: '2026-11-07',
    en: [
      'Scanner actions require a selection, with a new Select all button and a gray disabled plus',
      'Cards added to the collection are removed from the scan log with their captured photos',
      'The collection + menu shows a shorter Scan cards label',
    ],
  },
  {
    v: '2.0.14',
    d: '2026-11-07',
    en: [
      'New deck dialogs use themed fields, labeled controls and clearer actions',
      'Decks → + → Scan deck captures a physical deck and adds scans to an existing or new deck',
      'Deck scanning preserves repeated copies and detected printings without changing your collection',
    ],
  },
  {
    v: '2.0.13',
    d: '2026-11-07',
    en: [
      'The scan log scrolls over the camera, releasing it until you return to the top',
      'Hold a scan to select several; add selected or all new scans with the yellow plus, or delete selected log entries',
      'Scans show collection quantities, and captured photos are cleared when the scanner closes',
    ],
  },
  {
    v: '2.0.12',
    d: '2026-11-07',
    en: [
      'Scanner camera no longer lowers its resolution when recognition takes longer',
      'Camera requests follow phone orientation; tap the preview to refocus where supported',
      'The optional scan framerate display also shows the actual camera resolution',
    ],
  },
  {
    v: '2.0.11',
    d: '2026-11-07',
    en: [
      'Sharper camera preview with continuous autofocus where supported',
      'Recognition keeps a small processing budget and reduces capture resolution if scans fall behind',
    ],
  },
  {
    v: '2.0.10',
    d: '2026-11-07',
    en: [
      'Blank Card matches are ignored silently without lookups or notifications',
      'Camera fills the preview without stretching; the alignment hint was removed',
    ],
  },
  {
    v: '2.0.9',
    d: '2026-11-07',
    en: [
      'Card scanning uses the smaller Fastweb-Single 1.39 detector',
      'Detected borders follow cards anywhere in the full camera image, with perspective correction',
      'Brief messages explain when repeat-scan settings ignore a card',
    ],
  },
  {
    v: '2.0.8',
    d: '2026-11-07',
    en: [
      'Scanner settings add ID and corner thresholds and a configurable scan interval',
      'Optionally show the processed scan framerate over the camera preview',
    ],
  },
  {
    v: '2.0.7',
    d: '2026-11-07',
    en: [
      'Scanned card reviews include printing, condition, foil, amount and binder options',
      'Add directly from review; the Experimental notice is beside the scanner credits',
    ],
  },
  {
    v: '2.0.6',
    d: '2026-11-07',
    en: ['Settings now includes the installed version and full changelog'],
  },
  {
    v: '2.0.5',
    d: '2026-11-07',
    en: [
      'Card scanner settings control the repeat-card delay',
      'Optionally ignore card names already scanned in the current camera session',
    ],
  },
  {
    v: '2.0.4',
    d: '2026-11-07',
    en: ['Leaving the scanner slides the screen back to the right'],
  },
  {
    v: '2.0.3',
    d: '2026-11-07',
    en: [
      'Camera scans continuously without a shutter button',
      'Detected cards are logged below the camera, newest first',
      'Tap a logged card to review it or add it to your collection',
    ],
  },
  {
    v: '2.0.2',
    d: '2026-11-07',
    en: [
      'Scan cards opens the camera directly',
      'Recognition warms in the background and stays ready between scans',
      'Recognition data and runtime remain cached across app launches',
    ],
  },
  {
    v: '2.0.1',
    d: '2026-11-07',
    en: [
      'Full-screen camera slides in from the right',
      'CollectorVision identifies one card at a time',
      'Review each experimental scan before adding it to your collection',
    ],
  },
  {
    v: '2.0.0',
    d: '2026-11-07',
    en: [
      'Optional accounts with server sync and email recovery',
      'Local AI judge with streaming answers',
      'Automatic build numbers within each major and minor release',
    ],
  },
  {
    v: '1.50',
    d: '2026-11-01',
    en: [
      'English-only interface',
      'First-start tour removed',
      'Card scanner removed',
      'Search filter: sort rows removed',
    ],
  },
  {
    v: '1.49',
    d: '2026-11-01',
    en: ['Dice: the result stays on screen'],
  },
  {
    v: '1.48',
    d: '2026-11-01',
    en: [
      'Life counter: bigger cards, no margin',
      'Life counter: thicker status pill',
      'History: a run of taps is one line',
      'Win animation for the last player',
    ],
  },
  {
    v: '1.47',
    d: '2026-11-01',
    en: ['Dungeons shown as the real cards', 'Coloured dots: who is in which room'],
  },
  {
    v: '1.46',
    d: '2026-11-01',
    en: [
      'Life counter: Monarch with a crown',
      'Life counter: track every Dungeon',
      'Life counter: AI judge as a popup',
      'Life counter: restore an earlier game',
    ],
  },
  {
    v: '1.45',
    d: '2026-11-01',
    en: [
      'Scryfall tags on/off per deck',
      'Scryfall tags have a gold rim',
      'PC: page names in the top bar',
      'PC: filters open in the middle',
      'PC: gold + at the top left',
      'PC: deck menu opens under Menu',
      'PC: click again to close the zoom',
      'PC: click beside a popup closes it',
    ],
  },
  {
    v: '1.44',
    d: '2026-10-31',
    en: ['PC: search bar full page width', 'PC: deck toolbar fits small windows'],
  },
  {
    v: '1.43',
    d: '2026-10-31',
    en: ['Added cards use your own printing'],
  },
  {
    v: '1.41',
    d: '2026-10-31',
    en: [
      'Price and salt pills look like buttons',
      'Deck and collection totals too',
      'Title bars no longer grow',
    ],
  },
  {
    v: '1.40',
    d: '2026-10-31',
    en: [
      'Add: pick amount, deck or collection',
      'Select: collection & maybe buttons',
      'Jump opens a folded Maybeboard',
      'Smart: you choose to block or not',
      'Show everything on top in filters',
      'Extras tiles rearranged',
    ],
  },
  {
    v: '1.39',
    d: '2026-10-31',
    en: [
      'Playtest: Smart opponents switch',
      'Playtest: drag cards to any zone',
      'Playtest: graveyard beside commander',
      'Playtest: battlefield sorts itself',
      'Playtest: new draws on the left',
      'Swipe: shorter drag, quick flick',
      'Trackpad swipe steps through cards',
      'Price pill looks like a button',
      'Land AI removed',
    ],
  },
  {
    v: '1.38',
    d: '2026-10-31',
    en: [
      'Card view: same buttons everywhere',
      'Tags on every card view',
      'No more rows with one button',
    ],
  },
  {
    v: '1.37',
    d: '2026-10-31',
    en: [
      'Suggest land base in Inspiration',
      'Search card view shows Scryfall tags',
      'Show everything stays at the foot',
    ],
  },
  {
    v: '1.36',
    d: '2026-10-31',
    en: [
      'Green + back on Similar cards',
      'Green + on recommendations too',
      'Gold search button scrolls along',
    ],
  },
  {
    v: '1.35',
    d: '2026-10-31',
    en: [
      'PC: search filter panel full height',
      'Find in deck no longer hits the loupe',
      'Search deck opens without bouncing',
      'Search filters: tidier, no Name row',
      'Set filter sits above Color Identity',
      'i-buttons explain harder filters',
    ],
  },
  {
    v: '1.34',
    d: '2026-10-31',
    en: [
      'Treasure makers count as production',
      'Land search counts every colour',
      'Similar cards: tag weight tuned',
    ],
  },
  {
    v: '1.33',
    d: '2026-10-31',
    en: [
      'Similar lands that do the same job',
      'Budget lands ranked the same way',
      'Search: pick several tags at once',
      'Search filters without help texts',
    ],
  },
  {
    v: '1.32',
    d: '2026-10-31',
    en: [
      'Mana production counts all producers',
      'Ramp that fetches lands counts too',
      'Similar cards: tags weigh more',
      'Budget ranks just like Similar',
      'Budget: focus on one tag per card',
    ],
  },
  {
    v: '1.31',
    d: '2026-10-31',
    en: ['Clearer percentages in Stats'],
  },
  {
    v: '1.30',
    d: '2026-10-31',
    en: ['Plus buttons green, minus red', 'No more IN DECK label on tiles'],
  },
  {
    v: '1.29',
    d: '2026-10-31',
    en: [
      'Life counter fills the screen',
      'Deckhand logo opens the table menu',
      'Leave via the menu: Settings',
      'Bigger life totals',
      'Name under a thin status pill',
      'Clearer table choice for new games',
    ],
  },
  {
    v: '1.28',
    d: '2026-10-31',
    en: [
      'PC: menu bar on top, reads top-down',
      'PC: calmer width, bigger text',
      'PC: click a card to see it big',
      'PC: right-click menu has a ✕',
      'PC: buttons show their names',
      'PC: bigger, wider news',
      'Extras buttons work on PC again',
      'Card menu closes when a page opens',
    ],
  },
  {
    v: '1.27',
    d: '2026-10-31',
    en: [
      'Restore earlier deck versions',
      'Bring back deleted decks',
      'Cuts removed; lands advice stays',
      'PC: news in three columns',
      'PC: card page in the middle',
    ],
  },
  {
    v: '1.26',
    d: '2026-10-31',
    en: [
      'Sync between phone, tablet and PC',
      'Tag lists: search field, clear groups',
      'PC: right-click a card for its menu',
      'PC: Shift-click selects a range',
      'PC: / jumps to search',
      'PC: Ctrl+V a deck list to import',
      'PC: decklist in columns per type',
      'PC: search filters beside results',
    ],
  },
  {
    v: '1.25',
    d: '2026-10-31',
    en: [
      'Similar cards: focus on one tag',
      'Recommendations: focus on a tag',
      'Next card no longer flickers',
      'PC: arrow keys step through cards',
      'PC: tidier Stats, Extras, rows',
    ],
  },
  {
    v: '1.24',
    d: '2026-10-30',
    en: ['PC: hover a card to see it big'],
  },
  {
    v: '1.23',
    d: '2026-10-30',
    en: [
      'PC & tablet: menu bar on the left',
      'PC & tablet: full screen width',
      'PC & tablet: card page side by side',
    ],
  },
  {
    v: '1.22',
    d: '2026-10-28',
    en: ['Partner groups pair only together'],
  },
  {
    v: '1.21',
    d: '2026-10-27',
    en: ['Search field selects all on tap', 'Partner pairings in a popup'],
  },
  { v: '1.20', d: '2026-10-27', en: ['Sharper Similar cards'] },
  {
    v: '1.19',
    d: '2026-10-24',
    en: ['Build decks with spoiler cards', 'Select spoilers with a long press'],
  },
  {
    v: '1.18',
    d: '2026-10-24',
    en: ['A printing pick stays where you made it'],
  },
  {
    v: '1.17',
    d: '2026-10-19',
    en: ['Cuts start with the AI right away', 'AI errors say what went wrong'],
  },
  {
    v: '1.16',
    d: '2026-10-19',
    en: ['AI judge and cuts run on your server', 'AI cuts read your whole deck'],
  },
  {
    v: '1.15',
    d: '2026-10-19',
    en: ['AI cuts answer again', 'AI says why when it can\u2019t answer'],
  },
  {
    v: '1.14',
    d: '2026-10-19',
    en: ['Tap the deck count to open Cuts', 'AI cuts read your leader better'],
  },
  {
    v: '1.13',
    d: '2026-10-18',
    en: ['AI picks cuts for your deck', 'AI advises lands and land count'],
  },
  {
    v: '1.12',
    d: '2026-10-16',
    en: ['Big card: tap above or below to close'],
  },
  {
    v: '1.11',
    d: '2026-10-15',
    en: ['Smooth swiping between cards'],
  },
  {
    v: '1.10',
    d: '2026-10-15',
    en: ['Inspiration search suggests names'],
  },
  {
    v: '1.9',
    d: '2026-10-15',
    en: ['From a deck: tips in its colours'],
  },
  {
    v: '1.8',
    d: '2026-10-15',
    en: [
      'Similar cards: pick several at once',
      'Card picks: select, then Add to\u2026',
      'Card picks are about the card itself',
    ],
  },
  {
    v: '1.7',
    d: '2026-10-15',
    en: ['Inspiration: tap a card for its details', 'Inspiration no longer edits your deck'],
  },
  {
    v: '1.6',
    d: '2026-10-14',
    en: ['Selection tick clear in every scheme', 'Dimir: no more black text on blue'],
  },
  {
    v: '1.5',
    d: '2026-10-14',
    en: [
      'Search hides cards that aren\u2019t legal',
      'In the deck? Tap \u2212 to take it out',
      'Clearer + button on search results',
    ],
  },
  {
    v: '1.4',
    d: '2026-10-13',
    en: ['Themes load reliably, and faster'],
  },
  {
    v: '1.3',
    d: '2026-10-13',
    en: ['Leader page keeps your theme choice'],
  },
  {
    v: '1.2',
    d: '2026-10-13',
    en: ['Inspiration stays put after loading', 'Loading ring clear of the menus'],
  },
  {
    v: '1.1',
    d: '2026-10-13',
    en: [
      'Leader page: theme shown in the title',
      'Theme/Kindred ready while loading',
      'Dimir: black instead of grey',
    ],
  },
  {
    v: '1.0',
    d: '2026-10-09',
    en: ['Deckhand 1.0 \u2014 welcome aboard', 'Send feedback from About Deckhand'],
  },
];

/* The Android app's own news, per APK version: shown in the update sheet
   before installing, and again at the first start after the install (people
   tap Install without reading). */
const APK_NOTES = {
  '1.0': {
    en: [
      'Scanner uses your phone\u2019s camera',
      'Reads cards faster and sharper',
      'True colours and a lamp',
    ],
  },
};

function changelogAll() {
  return [{ v: APP_VERSION, d: APP_DATE, en: CHANGELOG_NOTES.en }].concat(CHANGELOG_HISTORY);
}

// Every release newer than the one the player last saw (all we know, when
// that was still the old 2.51.x numbering).
function changelogSince(seen) {
  const all = changelogAll();
  if (!seen) return all.slice(0, 1);
  const s0 = +String(seen).split('.')[0] || 0,
    c0 = +APP_VERSION.split('.')[0] || 0;
  if (s0 > c0) return all;
  return all.filter((e) => apkVerCmp(e.v, seen) > 0);
}

function changelogDate(d) {
  try {
    return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch (e) {
    return d;
  }
}

// The releases as a list: open (start-up note) or each folded (Settings).
function changelogListHtml(entries, folded) {
  return entries
    .map((e) => {
      const notes = (e.en || []).map((n) => `<li>${escapeHtml(n)}</li>`).join('');
      const head = `<b>v${escapeHtml(e.v)}</b><span class="cl-date">${escapeHtml(changelogDate(e.d))}</span>`;
      return folded
        ? `<div class="cl-entry"><button type="button" class="cl-head" data-clv="${escapeHtml(e.v)}" aria-expanded="false" aria-controls="cl-notes-${escapeHtml(e.v)}">${head}<span class="fold-ico" aria-hidden="true">\u25BE</span></button><ul id="cl-notes-${escapeHtml(e.v)}" class="cl-notes" hidden>${notes}</ul></div>`
        : `<div class="cl-entry"><div class="cl-head">${head}</div><ul class="cl-notes">${notes}</ul></div>`;
    })
    .join('');
}

// The past month, for Extras (at least the newest release).
function changelogMonth() {
  const all = changelogAll(),
    lim = Date.now() - 31 * 864e5;
  const m = all.filter((e) => {
    const t = Date.parse(e.d + 'T12:00:00');
    return isFinite(t) && t >= lim;
  });
  return m.length ? m : all.slice(0, 1);
}

/* One start-up note at a time: a note that finds another on screen waits
   its turn and shows when that one closes. */
const _noticeQ = [];

function noticeBusy() {
  return !!document.querySelector('#changelogScrim, #formatChangeScrim');
}

function noticeLater(fn) {
  if (_noticeQ.indexOf(fn) < 0) _noticeQ.push(fn);
}

function noticeNext() {
  setTimeout(() => {
    if (noticeBusy()) return;
    const f = _noticeQ.shift();
    if (f) {
      try {
        f();
      } catch (e) {}
    }
  }, 300);
}

/* Set when the app was opened by tapping the update push (…/?go=changelog):
   then the newest changelog shows again, even if it was seen before. Any
   other start still shows it only once. */
let _forceChangelog = false;

function maybeShowChangelog() {
  try {
    if (document.getElementById('changelogScrim')) return; // already on screen
    if (noticeBusy()) {
      noticeLater(maybeShowChangelog);
      return;
    }
    const force = _forceChangelog;
    _forceChangelog = false;
    const seen = localStorage.getItem(LS_PREFIX + 'seenVersion');
    // 1.41: the Android app -- a newer APK than last time gets its own part
    const apkCur = apkInstalled();
    let apkSeen = null;
    try {
      apkSeen = localStorage.getItem(LS_PREFIX + 'apkSeen');
    } catch (e) {}
    if (apkCur && !apkSeen) {
      try {
        localStorage.setItem(LS_PREFIX + 'apkSeen', apkCur);
      } catch (e) {}
      apkSeen = apkCur;
    }
    const apkNew = !!(apkCur && apkSeen && apkCmp(apkCur, apkSeen) > 0);
    if (!seen && !force) {
      localStorage.setItem(LS_PREFIX + 'seenVersion', APP_VERSION);
      return;
    } // First launch records the current version without opening a popup.
    // the fresh start: a device that last saw a higher number (the old line
    // up to 1.41, or 2.51.x) takes 1.0 as its new starting point, quietly
    let seen2 = seen;
    if (seen && apkVerCmp(seen, APP_VERSION) > 0) {
      try {
        localStorage.setItem(LS_PREFIX + 'seenVersion', APP_VERSION);
      } catch (e) {}
      seen2 = APP_VERSION;
    }
    // everything since the last visit, however many releases that is
    const entries =
      seen2 === APP_VERSION ? (force ? changelogAll().slice(0, 1) : []) : changelogSince(seen2);
    if (!entries.length && !apkNew) return;

    const apkPart = apkNew
      ? (() => {
          const n = APK_NOTES[apkCur];
          const lis = n
            ? n.en.map((x) => `<li>${escapeHtml(x)}</li>`).join('')
            : `<li>${'The Android app was updated.'}</li>`;
          return `<div class="cl-entry cl-apk"><div class="cl-head">${inlIco('phone', 15)}<b>${'Android app'} ${escapeHtml(apkCur)}</b></div><ul class="cl-notes">${lis}</ul></div>`;
        })()
      : '';
    const title =
      'What\u2019s new' +
      (entries.length + (apkNew ? 1 : 0) > 1
        ? ` \u2014 ${entries.length + (apkNew ? 1 : 0)} updates`
        : entries.length
          ? ` \u2014 v${entries[0].v}`
          : '');
    // The same plain sheet as the About popup: rises from the foot, closes
    // with its button, a tap beside it, or the back button. The list scrolls.
    const el = document.createElement('div');
    el.className = 'modal-backdrop';
    el.id = 'changelogScrim';
    el.innerHTML = /* HTML */ `<div class="modal-sheet">
      <h3>${title}</h3>
      <div class="cl-scroll" data-notr>${apkPart}${changelogListHtml(entries, false)}</div>
      <button class="ghost-btn" id="changelogOk" style="width:100%;margin-top:12px;">
        ${'Close'}
      </button>
    </div>`;
    document.body.appendChild(el);
    // Seen only once dismissed — if anything reloads the page mid-read, the
    // note simply greets the user again instead of vanishing half-shown.
    const close = () => {
      try {
        localStorage.setItem(LS_PREFIX + 'seenVersion', APP_VERSION);
        if (apkCur) localStorage.setItem(LS_PREFIX + 'apkSeen', apkCur);
      } catch (e) {}
      el.remove();
      noticeNext();
    };
    const done = () => {
      close();
      const st = state.overlayStack;
      if (st.length && st[st.length - 1].id === 'changelog') st.pop();
    };
    document.getElementById('changelogOk').addEventListener('click', done);
    el.addEventListener('click', (e) => {
      if (e.target === el) done();
    });
    pushOverlay('changelog', close);
  } catch (e) {}
}
