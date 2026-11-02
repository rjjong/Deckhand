// services / translations

/* ---- App language preference ----
   The full interface translation is coming as its own staged effort — good
   translations of hundreds of nautical strings deserve care, not a rush job.
   Today the choice is remembered and already governs CARD IMAGES: on any
   card's details page, printings are fetched in the chosen language where
   Magic is actually printed (German, French, Spanish, Italian); languages
   without printed cards (Dutch, Swedish, Danish, Norwegian) see English
   cards, exactly as requested. */

/* ================= Interface translations =================
   Hand-written, not machine-dumped. Two principles:
   1. Exact-match only — a string translates only if it appears verbatim in
      the dictionary, so card names, deck names and anything the user typed
      can never be mangled.
   2. Magic terminology follows each community: official localized type names
      for German, French, Spanish and Italian; English game terms kept for
      Dutch, Swedish, Danish and Norwegian, whose players play with English
      cards — the surrounding interface translates, the game speaks as their
      tables do. */
const I18N = {
  nl: {
    Tools: 'Hulpmiddelen',
    'Card Details': 'Kaartdetails',
    Trend: 'Trend',
    Salt: 'Salt',
    'Salt score': 'Salt-score',
    'Salt score unavailable': 'Salt-score niet beschikbaar',
    'Price trend and history': 'Prijstrend en geschiedenis',
    'The 50 saltiest cards': 'De 50 meest salty kaarten',
    'Partner pairings': 'Partner-combinaties',
    'Show everything': 'Toon alles',
    'Off \u2014 only cards this deck may hold. On \u2014 everything, off-color and not legal included.':
      'Uit \u2014 alleen kaarten die in dit deck mogen. Aan \u2014 alles, ook off-color en niet-legaal.',
    'Off \u2014 only cards legal in the chosen format. On \u2014 everything.':
      'Uit \u2014 alleen kaarten die legaal zijn in het gekozen format. Aan \u2014 alles.',
    'Every match is off-color or not legal here \u2014 turn on \u201cShow everything\u201d under Advanced filters to see them.':
      'Elke treffer is off-color of niet legaal \u2014 zet \u201cToon alles\u201d aan onder Geavanceerde filters om ze te zien.',
    'Remove from deck': 'Uit het deck halen',
    'Couldn\u2019t load the cards right now \u2014 try again in a moment.':
      'De kaarten laden nu even niet \u2014 probeer het zo opnieuw.',
    'No themed play data for this leader.':
      'EDHREC heeft voor deze leader geen gegevens over dit thema.',
    Staples: 'Staples',
    'Mana Staples': 'Mana-staples',
    'Tile view': 'Tegelweergave',
    'List view': 'Lijstweergave',
    'Stack view': 'Stapelweergave',
    'Text view': 'Tekstweergave',
    'How the binders are shown': 'Hoe de mappen getoond worden',
    'Nothing left to recommend here \u2014 every pick is already in your deck.':
      'Niets meer aan te raden \u2014 alles zit al in je deck.',
    'Add to collection\u2026': 'Aan collectie toevoegen\u2026',
    'Add to deck\u2026': 'Aan deck toevoegen\u2026',
    'Move to main deck': 'Verplaats naar main deck',
    'Move to Sideboard': 'Verplaats naar sideboard',
    'Amount (each)': 'Aantal (per kaart)',
    'No binder': 'Geen map',
    Binder: 'Map',
    'Import / Export': 'Importeren / exporteren',
    'Move to folder…': 'Naar map…',
    'Duplicate deck': 'Deck dupliceren',
    'Share deck': 'Deck delen',
    'Delete deck': 'Deck verwijderen',
    'Sort Decklist': 'Decklist sorteren',
    'Type → Mana Value → Name': 'Type → Mana value → Naam',
    'Type → Name': 'Type → Naam',
    'Mana Value → Name': 'Mana value → Naam',
    'Name only': 'Alleen naam',
    'Tags → Mana Value → Name': 'Tags → Mana value → Naam',
    '· current': '· huidig',
    'Replace Deck': 'Deck vervangen',
    'Import Deck': 'Deck importeren',
    'Export Deck': 'Deck exporteren',
    Copy: 'Kopiëren',
    Plain: 'Platte tekst',
    'Estimate from Game Changers and 2-card combos':
      "Schatting op basis van Game Changers en combo's van 2 kaarten",
    'No rulings available for this printing.': 'Geen rulings voor deze versie.',
    'No rulings have been published for this card.': 'Er zijn nog geen rulings voor deze kaart.',
    'Tap another player to count the damage you took from them.':
      'Tik op een andere speler om de damage te tellen die je van hem kreeg.',
    'Build decks with live legality, ban lists and colour identity checked per format':
      'Bouw decks met live legaliteit, banlijsten en color identity, gecontroleerd per format',
    'Track your collection, wants and binders with Cardmarket prices and history':
      'Houd je collectie, gezochte kaarten en mappen bij, met Cardmarket-prijzen en prijsverloop',
    'Find commanders, staples, combos and budget swaps from play data':
      'Vind commanders, staples, combo’s en budgetvervangers op basis van speeldata',
    'Test opening hands, castability and power bracket before you sit down':
      'Test starthanden, castbaarheid en je power bracket voordat je gaat zitten',
    'Count life, log games and share decks — everything offline-ready':
      'Tel life, noteer potjes en deel decks — alles werkt ook offline',
    'Ask the AI judge your rules questions — the official rules come with every answer':
      'Stel je regelvragen aan de AI-judge — bij elk antwoord de officiële regels',
    Close: 'Sluiten',
    'Loading news…': 'Nieuws laden…',
    'Adding straight to': 'Rechtstreeks toevoegen aan',
    'Stop adding to this deck': 'Stop met toevoegen aan dit deck',
    '⛰ Suggest lands': '⛰ Lands voorstellen',
    'Check & Save Changes': 'Controleren en opslaan',
    'Add to': 'Voeg toe aan',
    'Advanced filter ▾': 'Geavanceerd filter ▾',
    'Advanced filter ▴': 'Geavanceerd filter ▴',
    'Who is your commander? (optional)': 'Wie is je commander? (optioneel)',
    Create: 'Aanmaken',
    'Folder name': 'Foldernaam',
    'New subfolder': 'Nieuwe subfolder',
    '⚔ New deck': '⚔ Nieuw deck',
    '🚢 New deck': '🚢 Nieuw deck',
    '📋 Paste in decklist': '📋 Decklijst plakken',
    '📄 Import from file': '📄 Importeren uit bestand',
    'Paste in decklist': 'Decklijst plakken',
    'Create deck': 'Deck aanmaken',
    '⇅ Import / Export collection': '⇅ Collectie importeren / exporteren',
    'Import into:': 'Importeren in:',
    '📄 Choose a CSV file to import': '📄 Kies een CSV-bestand om te importeren',
    'No CSV yet? These free apps scan your paper cards with the camera and export one this importer understands:':
      'Nog geen CSV? Deze gratis apps scannen je papieren kaarten met de camera en maken er een die deze import begrijpt:',
    '📷 ManaBox — scan cards, export CSV': '📷 ManaBox — kaarten scannen, CSV exporteren',
    '🔍 Delver Lens — power scanner (Android)': '🔍 Delver Lens — krachtige scanner (Android)',
    '⬇ Export my collection as CSV': '⬇ Exporteer mijn collectie als CSV',
    'Biggest risers': 'Grootste stijgers',
    'Biggest fallers': 'Grootste dalers',
    'Ban lists': 'Banlijsten',
    'Format rules': 'Formatregels',
    'Custom list, enforced by every Commander deck check. Tap a name for the card.':
      'Eigen lijst — elke Commander-deckcheck houdt zich eraan. Tik op een naam voor de kaart.',
    'Loading…': 'Laden…',
    'Loading the rules…': 'Regels laden…',
    'Ask a question, search words, or jump to a rule (601.2)…':
      'Stel een vraag, zoek op woorden of spring naar een regel (601.2)…',
    'Type to filter…': 'Typ om te filteren…',
    'Card prices': 'Kaartprijzen',
    'Price lookups': 'Prijzen opzoeken',
    'new cards only': 'alleen nieuwe kaarten',
    '🩺 Diagnostics': '🩺 Diagnose',
    "The last theme list that couldn't place every card. Copy this and send it to the developer.":
      'De laatste themalijst die niet elke kaart kon plaatsen. Kopieer dit en stuur het naar de ontwikkelaar.',
    Week: 'Week',
    Month: 'Maand',
    Year: 'Jaar',
    'This week': 'deze week',
    'This month': 'deze maand',
    'This year': 'dit jaar',
    'All time': 'aller tijden',
    Legality: 'Legaliteit',
    'Recommendations in which colors?': 'Aanbevelingen in welke kleuren?',
    'Any colors': 'Alle kleuren',
    'No color restriction': 'Geen kleurbeperking',
    'Filter by folder…': 'Filter op folder…',
    NEWS: 'NIEUWS',
    'Your deck builder for Commander & beyond': 'Jouw deckbuilder voor Commander en meer',
    'e.g. removal, ramp, tutor': 'bijv. removal, ramp, tutor',
    'Scryfall function tags — what a card DOES. Type to filter the list, tap to pick.':
      'Scryfall-functietags — wat een kaart DOET. Typ om de lijst te filteren, tik om te kiezen.',
    'Any format': 'Elk format',
    '(e.g., {2}{G})': '(bijv. {2}{G})',
    Price: 'Prijs',
    'Cardmarket price. The top end is open — leave the right thumb on ∞ for no limit.':
      'Cardmarket-prijs. De bovenkant is open — laat het rechterbolletje op ∞ staan voor geen limiet.',
    Popularity: 'Populariteit',
    '↺ Restart': '↺ Opnieuw',
    '🎲 Dice': '🎲 Dobbelstenen',
    Dice: 'Dobbelstenen',
    '🪙 Coin': '🪙 Munt',
    '🎲 High Roll': '🎲 Hoogste worp',
    '↺ Restart Game': '↺ Potje opnieuw beginnen',
    'Rotate for Pass-and-Play': 'Meedraaien bij doorgeven',
    'Flip cards to face each seat around the table': 'Draai elk paneel naar zijn stoel aan tafel',
    'Auto-Kill': 'Automatisch uitschakelen',
    'Track Poison': 'Poison bijhouden',
    'Salty Defeat Messages': 'Salty verliesberichten',
    'Show a flavor message on defeat': 'Toon een grappig berichtje bij verlies',
    'Tap to set life': 'Tik om life in te stellen',
    'Trade calculator': 'Ruilcalculator',
    'About this app': 'Over deze app',
    'Couldn’t load articles right now — check your connection, or the news function isn’t deployed yet.':
      'Artikelen laden lukt nu niet — controleer je verbinding, of de nieuwsfunctie staat nog niet online.',
    'New Deck': 'Nieuw deck',
    'Spoilers from upcoming sets': 'Spoilers uit komende sets',
    "Tap to see the deck's legality check": 'Tik voor de legaliteitscheck van dit deck',
    'Tap to rename this deck': 'Tik om dit deck te hernoemen',
    'No changes logged yet — new edits will appear here.':
      'Nog geen wijzigingen — nieuwe aanpassingen verschijnen hier.',
    'No changes logged yet — history starts recording from now on.':
      'Nog geen wijzigingen — de geschiedenis wordt vanaf nu bijgehouden.',
    'Pick a card from this deck to see its odds.':
      'Kies een kaart uit dit deck om de kansen te zien.',
    'No colored mana symbols yet.': 'Nog geen gekleurde manasymbolen.',
    'Card in this deck…': 'Kaart in dit deck…',
    'Matchups — sideboard guide': 'Matchups — sideboardgids',
    'One plan per opposing deck: how they win, how you play it, what comes in and what goes out. Games you log against that deck count toward the record.':
      'Eén plan per deck van de tegenstander: hoe zij winnen, hoe jij het speelt, wat erin gaat en wat eruit. Potjes die je tegen dat deck noteert, tellen mee voor de stand.',
    'Most played right now — tap one to start its plan':
      'Nu het meest gespeeld — tik er een aan om het plan te beginnen',
    'New matchup plan': 'Nieuw matchup-plan',
    'Matchup plan': 'Matchup-plan',
    'Their plan': 'Hun plan',
    'Our plan': 'Ons plan',
    Notes: 'Notities',
    Opponent: 'Tegenstander',
    'Their deck': 'Hun deck',
    'Their deck, e.g. Izzet Prowess': 'Hun deck, bijv. Izzet Prowess',
    'Their plan — how they win, the cards to watch for':
      'Hun plan — hoe ze winnen, op welke kaarten je moet letten',
    'Our plan — how to play it: mulligans, what to hold back, when to race':
      'Ons plan — hoe je het speelt: mulligans, wat je achterhoudt, wanneer je racet',
    'Notes — on the play vs on the draw, what they side in, …':
      'Notities — on the play of on the draw, wat zij insiden, …',
    Out: 'Uit',
    Pick: 'Kies',
    'Nothing comes in yet.': 'Er gaat nog niets in.',
    'Nothing goes out yet.': 'Er gaat nog niets uit.',
    'The sideboard is empty — add cards to it first.':
      'De sideboard is leeg — voeg er eerst kaarten aan toe.',
    'The main deck is empty.': 'Het main deck is leeg.',
    'in and out differ': 'in en uit zijn niet gelijk',
    'Save plan': 'Plan opslaan',
    'Name the opposing deck first.': 'Geef eerst het deck van je tegenstander een naam.',
    'Plan saved.': 'Plan opgeslagen.',
    'Delete the plan against': 'Plan verwijderen tegen',
    'matchup plan': 'matchup-plan',
    'matchup plans': 'matchup-plannen',
    Trade: 'Ruilen',
    'Multiplayer life tracker': 'Life counter voor meerdere spelers',
    'Read, search, or ask a rules question': 'Lees, zoek of stel een regelvraag',
    'Deckbuilding and play, per format': 'Deckbouw en spel, per format',
    'Banned cards per format': 'Gebannen kaarten per format',
    'Interface and card images': 'Interface en kaartafbeeldingen',
    "A guild's two colors dress the app": 'De twee kleuren van een guild kleden de app',
    'Decks, collection and settings in one file': 'Decks, collectie en instellingen in één bestand',
    'Home-screen icon, full screen, offline': 'Icoon op je beginscherm, volledig scherm, offline',
    'Sends the app link': 'Stuurt de app-link',
    'Crossover sets — pick what your table plays': 'Crossover-sets — kies wat jullie spelen',
    'Price not listed yet': 'Prijs nog niet bekend',
    'Deck is legal.': 'Deck is legaal.',
    'Deck is legal': 'Deck is legaal',
    'No decks yet. Start a new deck, pick its format and add your cards.':
      'Nog geen decks. Begin een nieuw deck, kies het format en voeg je kaarten toe.',
    'Loading your decks…': 'Je decks laden…',
    'Search all formats': 'Zoek in alle formats',
    and: 'en',
    'more issues…': 'andere problemen…',
    'Color scheme': 'Kleurenschema',
    'Pick a guild — its two colors dress the whole app.':
      'Kies een guild — de twee kleuren ervan kleden de hele app.',
    'MY DECKS': 'MIJN DECKS',
    History: 'Geschiedenis',
    'Combo data arrives with a coming weekly update.':
      'Combodata komt met de volgende wekelijkse update.',
    'No known combos in this deck.': 'Geen bekende combo’s in dit deck.',
    'No cards at': 'Geen kaarten van',
    'or more in this deck': 'of meer in dit deck',
    'it’s already built thrifty.': 'het is al zuinig gebouwd.',
    'No 2, 3 or 4 card combos for this card.': 'Geen 2-, 3- of 4-kaartscombo’s voor deze kaart.',
    'Mine to receive': 'Ik ontvang',
    'Yours to receive': 'Jij ontvangt',
    'Search your wants…': 'Zoek in Gezocht…',
    'No wants match that name.': 'Geen gezochte kaart met die naam.',
    'Paste a list': 'Plak een lijst',
    'One card per line, e.g. 1 Sol Ring': 'Één kaart per regel, bijv. 1 Sol Ring',
    Cancel: 'Annuleren',
    'Rename this deck': 'Hernoem dit deck',
    'Deck name': 'Decknaam',
    'Binder name': 'Mapnaam',
    'Name your new deck': 'Geef je nieuwe deck een naam',
    'Name this binder': 'Geef deze map een naam',
    'Leave blank for your whole collection': 'Laat leeg voor je hele collectie',
    'Delete this game from the log?': 'Dit potje uit het log verwijderen?',
    'Reset all life totals, poison, Commander damage, and medals?':
      'Alle life totals, poison, Commander damage en medailles resetten?',
    Restore: 'Herstellen',
    'Replace all': 'Alles vervangen',
    'Add alongside': 'Naast bestaande toevoegen',
    Exit: 'Afsluiten',
    'Load a .txt file': 'Laad een .txt-bestand',
    'loaded — press Replace Deck when ready.':
      'geladen — druk op Vervang deck wanneer je klaar bent.',
    'Could not read that file.': 'Kon dat bestand niet lezen.',
    'loaded — press Create deck when ready.':
      'geladen — druk op Deck aanmaken wanneer je klaar bent.',
    'Move to binder…': 'Verplaats naar map…',
    'Remove from collection': 'Verwijder uit collectie',
    'Deselect all': 'Alles deselecteren',
    'Select all': 'Alles selecteren',
    'All cards': 'Alle kaarten',
    'Automatic folders': 'Automatische mappen',
    'Every card is tucked into a binder — open All cards below to see the whole collection at once.':
      'Elke kaart zit in een map — open Alle kaarten hieronder om de hele collectie in één keer te zien.',
    'Moved.': 'Verplaatst.',
    Move: 'Verplaatsen',
    'I add': 'Ik leg',
    'Confirm trade': 'Ruil bevestigen',
    'Trade confirmed. Enjoy the new cards.': 'Ruil bevestigd. Veel plezier met de nieuwe kaarten.',
    'Add to my collection': 'Aan mijn collectie toevoegen',
    'Remove from Wants': 'Verwijder uit Gezocht',
    TRADE: 'RUILEN',
    'Add to trade': 'Aan ruil toevoegen',
    'Add card': 'Kaart toevoegen',
    'Search collection…': 'Zoek in collectie…',
    'Search this binder…': 'Zoek in deze map…',
    'Search Scryfall and file it into a binder': 'Zoek op Scryfall en stop hem in een map',
    'A fresh empty binder': 'Een nieuwe, lege map',
    'A collection or binder from Moxfield / Archidekt':
      'Een collectie of map uit Moxfield / Archidekt',
    'You give': 'Jij geeft',
    'You get': 'Jij krijgt',
    'Even trade.': 'Gelijke ruil.',
    'They add': 'Zij leggen',
    'You add': 'Jij legt',
    'to balance the trade': 'bij om de ruil gelijk te maken',
    'Cardmarket trend prices — pick the exact printing when adding a card.':
      'Cardmarket-trendprijzen — kies de exacte versie bij het toevoegen van een kaart.',
    'Some cards have no listed price and count as €0.00.':
      'Sommige kaarten hebben geen bekende prijs en tellen als €0,00.',
    'No cards on this side yet.': 'Nog geen kaarten aan deze kant.',
    'Clear trade': 'Ruil wissen',
    'Clear the whole trade?': 'De hele ruil wissen?',
    'Added to trade.': 'Toegevoegd aan de ruil.',
    'Copied.': 'Gekopieerd.',
    Explore: 'Verkennen',
    'Scryfall recommended': 'Aanbevolen door Scryfall',
    'Your tags': 'Jouw tags',
    'All Scryfall tags': 'Alle Scryfall-tags',
    'Copy diagnostics': 'Diagnose kopiëren',
    New: 'Nieuw',
    Top: 'Top',
    'New Cards': 'Nieuwe kaarten',
    'High Synergy Cards': 'Kaarten met hoge synergie',
    'Top Cards': 'Topkaarten',
    synergy: 'synergie',
    'Clear filters': 'Filters wissen',
    'Show all': 'Toon alles',
    'Jump to section': 'Spring naar sectie',
    'theme recommendations': 'thema-aanbevelingen',
    Creatures: 'Creatures',
    Lands: 'Lands',
    'Mana Artifacts': 'Mana artifacts',
    'Utility Artifacts': 'Utility artifacts',
    'Utility Lands': 'Utility lands',
    'Could not copy — select the text above instead.':
      'Kopiëren mislukt — selecteer de tekst hierboven.',
    'Search any card — every printing of it can join the trade.':
      'Zoek een kaart — elke versie ervan kan de ruil in.',
    'Exit this app?': 'Deze app afsluiten?',
    'Include off-color cards': 'Toon ook off-color kaarten',
    'Off — only cards legal in this deck. On — every format-legal card, off-color included.':
      'Uit — alleen kaarten die legaal zijn in dit deck. Aan — elke format-legale kaart, ook off-color.',
    'Every match is off-color for this deck — tick “Include off-color cards” under Advanced filters to see them.':
      'Elke treffer is off-color voor dit deck — vink “Toon ook off-color kaarten” aan onder Geavanceerde filters om ze te zien.',
    'No legal cards found for that search.': 'Geen legale kaarten gevonden voor die zoekopdracht.',
    'Press back once more to close.': 'Druk nog een keer op terug om af te sluiten.',
    'Date to be announced': 'Datum nog onbekend',
    "EDHREC play data didn't load — showing the app's own synergy picks.":
      'De speeldata van EDHREC is niet geladen — dit zijn de synergiekeuzes van de app zelf.',
    'Try EDHREC again': 'Probeer EDHREC opnieuw',
    'Try again': 'Probeer opnieuw',
    'A newer version is ready — close the app and open it again.':
      'Er staat een nieuwere versie klaar — sluit de app en open hem opnieuw.',
    'No connection — these picks come from the card database on your phone.':
      'Geen verbinding — deze keuzes komen uit de kaartendatabase op je telefoon.',
    "Couldn't reach Scryfall. Check your connection and try again.":
      'Scryfall niet bereikbaar. Controleer je verbinding en probeer het opnieuw.',
    'Charting themed recommendations…': 'Thema-aanbevelingen uitstippelen…',
    'Tap to see what this combo does': 'Tik om te zien wat deze combo doet',
    'No description yet — write one on the Deck Log page.':
      'Nog geen beschrijving — schrijf er een op de Decklog-pagina.',
    'A few lines about this deck — shown on the Decklist page.':
      'Een paar regels over dit deck — te zien op de Decklist-pagina.',
    'Similar cards': 'Vergelijkbare kaarten',
    'Cards that do the same job as': 'Kaarten met dezelfde rol als',
    'most played first.': 'meest gespeeld eerst.',
    'No similar cards found.': 'Geen vergelijkbare kaarten gevonden.',
    'Function unknown — showing its closest kin by type.':
      'Functie onbekend — dit zijn de kaarten die qua type het dichtst in de buurt komen.',
    'cards that do the same job': 'kaarten met dezelfde rol',
    Share: 'Delen',
    'Share image': 'Afbeelding delen',
    'Share link': 'Link delen',
    'Sharing failed.': 'Delen mislukt.',
    'Link copied.': 'Link gekopieerd.',
    'No image to share.': 'Geen afbeelding om te delen.',
    Recommendations: 'Aanbevelingen',
    'Add one': 'Voeg één toe',
    'Remove one': 'Verwijder één',
    'To maybeboard': 'Naar maybeboard',
    'To main deck': 'Naar main deck',
    'Manage copy': 'Beheer exemplaar',
    Save: 'Opslaan',
    'Add to collection': 'Aan collectie toevoegen',
    Tags: 'Tags',
    'Data Sources': 'Databronnen',
    'just now': 'zonet',
    'Most played overall': 'Meest gespeeld in het algemeen',
    'Still checking…': 'Nog aan het controleren…',
    'The set list hasn’t loaded yet, so searches still run online in full.':
      'De setlijst is nog niet geladen, dus zoekopdrachten gaan nog volledig online.',
    'Nothing is newer than your database — searching runs entirely on your phone.':
      'Niets is nieuwer dan je database — zoeken gebeurt volledig op je telefoon.',
    'Newer than your database': 'Nieuwer dan je database',
    built: 'gebouwd',
    'fully offline': 'volledig offline',
    'live (set list unknown)': 'live (setlijst onbekend)',
    'new set live': 'nieuwe set live',
    'new sets live': 'nieuwe sets live',
    'Offline search': 'Offline zoeken',
    'Local card database': 'Lokale kaartendatabase',
    'live, per card': 'live, per kaart',
    '24h per card': '24u per kaart',
    'Refreshed.': 'Ververst.',
    'Scryfall sets & spoilers': 'Scryfall-sets & spoilers',
    'EDHREC themes & Kindred': "EDHREC-thema's & Kindred",
    'Creature types': 'Creature types',
    'Bans & Game Changers': 'Bans & Game Changers',
    'Complete rules': 'Volledige regels',
    'About this ban list': 'Over deze banlijst',
    Prices: 'Prijzen',
    'Search by card name': 'Zoek op kaartnaam',
    'Search a Commander by name…': 'Zoek een Commander op naam…',
    'Search an Commander by name…': 'Zoek een Commander op naam…',
    'How did it end?': 'Hoe eindigde het?',
    'My Stuff': 'Mijn spullen',
    'My Collection': 'Mijn collectie',
    Search: 'Zoeken',
    Import: 'Importeren',
    Export: 'Exporteren',
    Budget: 'Budget',
    'Add Cards': 'Kaarten toevoegen',
    'Search deck': 'Zoek in deck',
    'The list below narrows live as you type.': 'De lijst hieronder versmalt live terwijl je typt.',
    'these filters': 'deze filters',
    'Bulk Edit': 'Bulk bewerken',
    Folders: 'Folders',
    Binders: 'Mappen',
    Wants: 'Gezocht',
    Decks: 'Decks',
    'New binder': 'Nieuwe map',
    '‹ All binders': '‹ Alle mappen',
    '🖼 Choose cover art': '🖼 Kies een omslagafbeelding',
    '✎ Rename': '✎ Hernoemen',
    '🗑 Delete binder': '🗑 Verwijder map',
    'Choose Cover Art': 'Omslagafbeelding kiezen',
    '+ Add to a deck': '+ Aan een deck toevoegen',
    'Played with this': 'Hiermee gespeeld',
    Collection: 'Collectie',
    'ORACLE TEXT': 'ORACLE TEXT',
    'Oracle text': 'Oracle text',
    'Checking price…': 'Prijs ophalen…',
    'No Cardmarket price listed': 'Geen Cardmarket-prijs bekend',
    'Advanced filter': 'Geavanceerd filter',
    'Use filters': 'Filters toepassen',
    'Reset filters': 'Filters wissen',
    'Check for new spoilers': 'Zoek nieuwe spoilers',
    Appearance: 'Weergave',
    Dark: 'Donker',
    Light: 'Licht',
    'Game format': 'Format',
    Language: 'Taal',
    'Life Counter': 'Life Counter',
    'Open the multiplayer life tracker': 'Open de life counter voor meerdere spelers',
    'Sort by': 'Sorteren op',
    'Add to folder': 'Aan map toevoegen',
    Duplicate: 'Dupliceren',
    Delete: 'Verwijderen',
    'Add cards to collection…': 'Kaarten aan collectie toevoegen…',
    'Filter collection…': 'Collectie filteren…',
    'Nothing matches these filters.': 'Niets voldoet aan deze filters.',
    'missing from your decks': 'ontbreekt in je decks',
    'Budget Alternatives': 'Budgetalternatieven',
    'A legendary creature leads your 100-card singleton deck':
      'Een legendary creature leidt je singleton-deck van 100 kaarten',
    'Brew from every set ever printed': 'Bouw met elke set die ooit verscheen',
    'Politics, alliances and comebacks at a four-player table':
      'Politiek, allianties en comebacks aan een tafel met vier spelers',
    'Your Commander returns from the command zone, again and again':
      'Je Commander keert keer op keer terug uit de command zone',
    'Official banned list, always current': 'Officiële banlijst, altijd actueel',
    'Fast four-player games with real strategic depth':
      'Snelle potten met vier spelers en echte strategische diepgang',
    "Magic's own universes only — story over power creep":
      'Alleen Magics eigen universums — verhaal boven power creep',
    '— thin bar: cards producing that color': '— dunne balk: kaarten die die kleur produceren',
    'Mana Production': 'Mana-productie',
    '— cards that can produce each color': '— kaarten die elke kleur kunnen produceren',
    '⟳ Check for new spoilers': '⟳ Zoek nieuwe spoilers',
    'Card Name': 'Kaartnaam',
    'Any words in the name': 'Woorden uit de naam',
    'Set / Expansion': 'Set / Expansie',
    'Any Set': 'Elke set',
    'Oracle Text': 'Oracle text',
    'Any text, e.g. draw a card': 'Elke tekst, bijv. draw a card',
    'For exact phrases, put quotes (") around your search query.':
      'Zet aanhalingstekens (") om je zoekterm om op een exacte zin te zoeken.',
    'Card Type': 'Kaarttype',
    'e.g. Dragon, Equipment': 'bijv. Dragon, Equipment',
    'Color Identity': 'Color identity',
    'Must have all selected': 'Moet alle gekozen kleuren hebben',
    'At most these colors': 'Hooguit deze kleuren',
    'Mana Value': 'Mana value',
    'Mana Cost': 'Mana cost',
    Power: 'Power',
    Toughness: 'Toughness',
    Loyalty: 'Loyalty',
    Rarity: 'Rarity',
    Keyword: 'Keyword',
    'e.g. flying, lifelink': 'bijv. flying, lifelink',
    'Flavor Text': 'Flavor text',
    'e.g. dragon': 'bijv. dragon',
    Artist: 'Artiest',
    'e.g. Rebecca Guay': 'bijv. Rebecca Guay',
    'Sort Order': 'Sorteervolgorde',
    'Sort Direction': 'Sorteerrichting',
    Ascending: 'Oplopend',
    Descending: 'Aflopend',
    Any: 'Elke',
    Name: 'Naam',
    '🔍 Use filters': '🔍 Filters toepassen',
    Monocolored: 'Eenkleurig',
    '2 colors': '2 kleuren',
    '3 colors': '3 kleuren',
    '4 & 5 colors': '4 & 5 kleuren',
    'Mana Curve': 'Mana curve',
    '— tap a bar to see those cards': '— tik op een balk om die kaarten te zien',
    'Color Distribution': 'Kleurverdeling',
    'Most Expensive Cards': 'Duurste kaarten',
    'Cardmarket trend price, cheapest printing of each card.':
      'Cardmarket-trendprijs, goedkoopste versie van elke kaart.',
    'Pricing…': 'Prijzen ophalen…',
    'Budget alternatives': 'Budgetalternatieven',
    'Recent Changes': 'Recente wijzigingen',
    'View full history →': 'Bekijk de volledige geschiedenis →',
    Undo: 'Ongedaan maken',
    Add: 'Voeg toe',
    Remove: 'Verwijder',
    Edit: 'Bewerken',
    Preview: 'Voorbeeld',
    '# headers, **bold**, *italics*, - lists': '# koppen, **vet**, *cursief*, - lijsten',
    'MY STUFF': 'MIJN SPULLEN',
    SEARCH: 'ZOEKEN',
    INSPIRATION: 'INSPIRATIE',
    EXTRAS: "EXTRA'S",
    'MY COLLECTION': 'MIJN COLLECTIE',
    empty: 'leeg',
    "Magic's grandest multiplayer battlefield": 'Magics grootste multiplayer-slagveld',
    'Choose your': 'Kies je',
    '— a legendary creature whose color identity defines your deck — then assemble a 100-card singleton army from':
      '— een legendary creature waarvan de color identity je deck bepaalt — en stel dan een singleton-leger van 100 kaarten samen uit',
    'every set ever printed': 'elke set ooit gedrukt',
    ". Cast your Commander from the command zone again and again as the table's politics unfold.":
      '. Cast je Commander keer op keer vanuit de command zone, terwijl de politiek aan tafel zich ontvouwt.',
    'A four-player free-for-all. Official legality and a live banned list, always current.':
      'Een free-for-all voor vier spelers. Officiële legaliteit en een live banlijst, altijd actueel.',
    'Read the rules →': 'Lees de regels →',
    'Your Commander awaits.': 'Je Commander wacht.',
    'Take Command': 'Neem het commando',
    'Explore Commanders & deck inspiration': 'Ontdek Commanders & deck-inspiratie',
    'Commander is a': 'Commander is een',
    'four-player': 'vierspelers',
    "format — an immersive challenge where the legends of Magic's":
      'format — een meeslepende uitdaging waarin de legendes van Magics',
    'own universes': 'eigen universums',
    'no expensive lands': 'geen dure lands',
    'Faster games, strategic depth, and far less prone to':
      'Snellere potten, strategische diepgang en veel minder vatbaar voor',
    'power creep': 'power creep',
    '— steeped in the story of Magic itself.': '— doordrenkt van het verhaal van Magic zelf.',
    'Read the full rules →': 'Lees alle regels →',
    'Your Commander awaits.': 'Je Commander wacht.',
    'White production': 'Witte productie',
    'Blue production': 'Blauwe productie',
    'Black production': 'Zwarte productie',
    'Red production': 'Rode productie',
    'Green production': 'Groene productie',
    'Colorless production': 'Kleurloze productie',
    'Generic production': 'Generieke productie',
    'Deck Log': 'Decklog',
    'Play Log': 'Speellog',
    '⊕ Log a game': '⊕ Noteer een potje',
    'Log a game': 'Noteer een potje',
    Result: 'Resultaat',
    Won: 'Gewonnen',
    Lost: 'Verloren',
    'Ended by': 'Beslist door',
    'Pod size': 'Aantal spelers',
    Turns: 'Beurten',
    Mulligans: 'Mulligans',
    Mana: 'Mana',
    Smooth: 'Soepel',
    Screwed: 'Screwed',
    Flooded: 'Flooded',
    'Dead turns': 'Dode beurten',
    'MVP card': 'MVP-kaart',
    'Weakest card': 'Zwakste kaart',
    'Save game': 'Potje opslaan',
    Games: 'Potjes',
    'Avg turns': 'Gem. beurten',
    'Avg dead turns': 'Gem. dode beurten',
    'Mana trouble': 'Mana-problemen',
    'Top performers': 'Toppers',
    'Cut candidates': 'Schrapkandidaten',
    'Primer — strategy notes': 'Primer — strategienotities',
    Winrate: 'Winrate',
    'No games logged yet.': 'Nog geen potjes genoteerd.',
    "No games logged yet — every logged game sharpens the picture: winrate, dead turns, which cards earn their slot and which don't.":
      'Nog geen potjes genoteerd — elk genoteerd potje scherpt het beeld aan: winrate, dode beurten, welke kaarten hun plek verdienen en welke niet.',
    'Notes — what decided this game?': 'Notities — wat besliste dit potje?',
    'Victory logged. ⚔': 'Overwinning genoteerd. ⚔',
    'Logged — every loss is data.': 'Genoteerd — elk verlies is data.',
    Combat: 'Combat',
    'Commander damage': 'Commander damage',
    Combo: 'Combo',
    Combos: "Combo's",
    'More combos': "Meer combo's",
    More: 'Meer',
    'Filter combos by card…': "Filter combo's op kaart…",
    'No combos match that name.': "Geen combo's met die naam.",
    'Download card database now': 'Download de kaartendatabase nu',
    'Downloading card database…': 'Kaartendatabase downloaden…',
    'Database already current': 'Database is al actueel',
    'Database ready': 'Database klaar',
    'Download failed': 'Download mislukt',
    'Already downloading…': 'Al aan het downloaden…',
    'This browser cannot unpack the database file.':
      'Deze browser kan het databasebestand niet uitpakken.',
    'Database file not published on the server.': 'Databasebestand niet gepubliceerd op de server.',
    'Couldn’t reach the server.': 'Kon de server niet bereiken.',
    Poison: 'Poison',
    Mill: 'Mill',
    Attrition: 'Uitputting',
    Concession: 'Opgave',
    Other: 'Anders',
    'Weigh Anchor': 'Anker lichten',
    'Explore Commanders & deck inspiration': 'Ontdek Commanders & deck-inspiratie',
    cards: 'kaarten',
    'starting life': 'life bij de start',
    'multiplayer classic': 'multiplayer klassieker',
    'faster games': 'snellere potten',
    'commander damage': 'commander damage',
    'Commander damage': 'Commander damage',
    'wins outright': 'wint direct',
    singleton: 'singleton',
    'Advanced filters': 'Geavanceerde filters',
    'Search by name, or open Advanced filters for colors, mana value, type, and Oracle text.':
      'Zoek op naam, of open Geavanceerde filters voor kleuren, mana value, type en Oracle-tekst.',
    'Random Card': 'Willekeurige kaart',
    '↻ New card': '↻ Nieuwe kaart',
    '↻ Random Card': '↻ Willekeurige kaart',
    '🔮 New cards have been spoiled': '🔮 Nieuwe kaarten zijn gespoild',
    'Comprehensive Rules': 'Comprehensive Rules',
    'The complete official Magic rules — read, search, or ask a question and get the exact rule quoted back':
      'De volledige officiële Magic-regels — lees, zoek, of stel een vraag en krijg de exacte regel terug geciteerd',
    'Find Your Commander': 'Vind je Commander',
    'Chart Your Course': 'Bepaal je koers',
    "Pick colors and a theme to find Commanders for that style. Tap an Commander's":
      'Kies kleuren en een thema om Commanders voor die stijl te vinden. Tik op de',
    'card art': 'kaartafbeelding',
    'to see its recommended cards and build a deck around it.':
      'om de aanbevolen kaarten te zien en er een deck omheen te bouwen.',
    "Pick colors and a theme to find Commanders for that style. Tap a Commander's":
      'Kies kleuren en een thema om Commanders voor die stijl te vinden. Tik op de kaartafbeelding van een Commander',
    'Theme — none': 'Thema — geen',
    'Kindred — none': 'Kindred — geen',
    Colors: 'Kleuren',
    'Choose a combination…': 'Kies een combinatie…',
    'Colors — any combination': 'Kleuren — elke combinatie',
    'Backup & Restore': 'Back-up & herstel',
    'Everything in one file — decks, collection, settings. Your ticket to a new address or a new device.':
      'Alles in één bestand — decks, collectie, instellingen. Je ticket naar een nieuw adres of een nieuw toestel.',
    '⬇ Back Up': '⬇ Back-up maken',
    '⬆ Restore': '⬆ Herstellen',
    'Format Rules': 'Formatregels',
    'Deckbuilding & play rules for Commander': 'Deckbouw- & speelregels voor Commander',
    'Deckbuilding & play rules for Commander': 'Deckbouw- & speelregels voor Commander',
    'Banned List': 'Banlijst',
    '📲 Install as an app': '📲 Installeer als app',
    'Home-screen icon, full screen, works offline':
      'Icoon op je beginscherm, volledig scherm, werkt offline',
    'Share this app with a friend': 'Deel deze app met een vriend',
    'Sends the app link with a short intro': 'Stuurt de app-link met een korte intro',
    'Commander — or switch the whole app to regular Commander. Decks of the other format wait in their own folder.':
      'Commander — of zet de hele app om naar gewone Commander. Decks van het andere format wachten in hun eigen folder.',
    'Life Totals': 'Life totals',
    'New Game': 'Nieuw potje',
    '↺ New Game': '↺ Nieuw potje',
    'How many players are at the table?': 'Hoeveel spelers zitten er aan tafel?',
    'Pick the table layout — every panel turns to face its seat.':
      'Kies de tafelindeling — elk paneel draait naar zijn stoel.',
    'Start & Spin for First Player': 'Start en draai wie begint',
    '🎡 Spin for First Player': '🎡 Draai wie begint',
    '🎲 Roll d6': '🎲 Gooi een d6',
    '🎲 Roll d20': '🎲 Gooi een d20',
    Settings: 'Instellingen',
    '✓ Done': '✓ Klaar',
    'No events yet.': 'Nog geen gebeurtenissen.',
    'New binder name': 'Naam van de nieuwe map',
    'Rename binder': 'Hernoem map',
    'Cover card name': 'Naam van de omslagkaart',
    'Add a copy': 'Voeg er één toe',
    'Move to Maybeboard': 'Verplaats naar maybeboard',
    'Move to Main': 'Naar main deck',
    'Change printing': 'Andere versie kiezen',
    'Use your own image…': 'Gebruik je eigen afbeelding…',
    "Camera or any image file — it becomes this card's picture here. Picking a real printing below puts things back.":
      'Camera of een afbeeldingsbestand — het wordt hier het plaatje van deze kaart. Een echte versie hieronder kiezen zet alles terug.',
    'Custom image set for this card.': 'Eigen afbeelding ingesteld voor deze kaart.',
    'Could not read that image.': 'Kon die afbeelding niet lezen.',
    'Image too large even after shrinking.': 'Afbeelding te groot, zelfs na verkleinen.',
    'Not enough storage space for this image.': 'Niet genoeg opslagruimte voor deze afbeelding.',
    'Remove from deck': 'Verwijder uit deck',
    Rulings: 'Rulings',
    'Add to Deck': 'Aan deck toevoegen',
    'Add to…': 'Toevoegen aan…',
    'Set as Commander': 'Stel in als Commander',
    'Set as Commander': 'Stel in als Commander',
    Favorites: 'Favorieten',
    '★ Favorites': '★ Favorieten',
    'Rename folder': 'Hernoem folder',
    'Delete folder': 'Verwijder folder',
    'New folder': 'Nieuwe folder',
    'New deck': 'Nieuw deck',
    'Pick Commander first': 'Kies eerst een Commander',
    'Filter by folder or Commander…': 'Filter op folder of Commander…',
    'Filter by folder or Commander…': 'Filter op folder of Commander…',
    'Card name…': 'Kaartnaam…',
    'Find in deck…': 'Zoek in deck…',
    'No cards match': 'Geen kaarten voor',
    'Color breakdown': 'Kleuroverzicht',
    Details: 'Details',
    'Most played with this Commander, sorted on popularity.':
      'Meest gespeeld met deze Commander, gesorteerd op populariteit.',
    'Most played with this Commander, sorted on popularity.':
      'Meest gespeeld met deze Commander, gesorteerd op populariteit.',
    'tap cards to select': 'tik op kaarten om te selecteren',
    Inspiration: 'Inspiratie',
    Extras: "Extra's",
    'Any color': 'Elke kleur',
    'All sets': 'Alle sets',
    'All types': 'Alle typen',
    White: 'Wit',
    Blue: 'Blauw',
    Black: 'Zwart',
    Red: 'Rood',
    Green: 'Groen',
    Colorless: 'Kleurloos',
    Multicolor: 'Meerkleurig',
    'Language saved.': 'Taal opgeslagen.',
    'Card images and the interface follow your language where possible.':
      'Kaartafbeeldingen en de interface volgen waar mogelijk je taal.',
    'Your collection is empty. Search above, or use "Add to collection" on any card in the app.':
      'Je collectie is leeg. Zoek hierboven of gebruik "Aan collectie toevoegen" bij een kaart in de app.',
    Sideboard: 'Sideboard',
    Format: 'Format',
    'Main deck': 'Main deck',
    'Every archetype': 'Elk archetype',
    Aggro: 'Aggro',
    Tempo: 'Tempo',
    Midrange: 'Midrange',
    Control: 'Control',
    Ramp: 'Ramp',
    'Find a deck by name or card': 'Zoek een deck op naam of kaart',
    'The metagame for this format arrives with the weekly update.':
      'De meta van dit format komt met de wekelijkse update.',
    decks: 'decks',
    'most played at the bottom': 'meest gespeeld onderaan',
    'No meta decks match.': 'Geen meta-decks gevonden.',
    'Copy to my decks': 'Kopieer naar mijn decks',
    Source: 'Bron',
    'Not found': 'Niet gevonden',
    metagame: 'meta',
    'Copied from the metagame': 'Gekopieerd uit de meta',
    'cards copied': 'kaarten gekopieerd',
    'not found': 'niet gevonden',
    'Meta decks closest to': 'Meta-decks die het meest lijken op',
    'cards in common': 'kaarten gedeeld',
    'No cards yet. Add them from Search, copy a meta deck from Inspiration, or paste a list with Bulk Edit / Import.':
      'Nog geen kaarten. Voeg ze toe via Zoeken, kopieer een meta-deck uit Inspiratie of plak een lijst via Bulk bewerken / Importeren.',
    'Tap a name for the card.': 'Tik op een naam voor de kaart.',
    Banned: 'Banned',
    'Nothing banned beyond ante, Conspiracy and sticker cards.':
      'Niets gebannen behalve ante-, Conspiracy- en stickerkaarten.',
    'Restricted — 1 copy': 'Restricted — 1 exemplaar',
  },
};

const I18N_RX = {
  nl: [
    [/^Format of “(.*)”$/g, 'Format van “$1”'],
    [/^(\d+)mo ago$/g, '$1 mnd geleden'],
    [/^(\d+) cards? owned$/g, '$1 kaarten in bezit'],
    [/What's new — v/g, 'Wat is nieuw — v'],
    [/^Avg MV /g, 'Gem. MV '],
    [/^(\d+)d ago · undone$/g, '$1d geleden · ongedaan'],
    [/^(\d+)d ago$/g, '$1d geleden'],
    [/^(\d+)h ago$/g, '$1u geleden'],
    [/^(\d+)m ago$/g, '$1m geleden'],
    [/^just now$/g, 'zojuist'],
    [/^Bulk edit: (\d+) added, (\d+) removed$/g, 'Bulk bewerken: $1 toegevoegd, $2 verwijderd'],
    [/^Deck total: /g, 'Decktotaal: '],
    [/(\d+) decks? · waiting for the flag to change/g, '$1 decks · wachten op de vlagwissel'],
    [/(Commanders|Commanders) — any colors/g, '$1 — alle kleuren'],
    [/Commanders — any colors/g, 'Commanders — alle kleuren'],
    [
      /^(\d+) cards — the official Commander list, live from Scryfall$/g,
      '$1 kaarten — de officiële Commander-lijst, live van Scryfall',
    ],
    [/^(\d+) cards — tap a name to see it/g, '$1 kaarten — tik op een naam om hem te zien'],
    [/^Player (\d+)$/g, 'Speler $1'],
    [/\bMain (\d+)\//g, 'Deck $1/'],
    [/(\d+) cards\b/g, '$1 kaarten'],
    [/(\d+) card\b/g, '$1 kaart'],
  ],
};

// Labels lost their colored emoji in 1.10: each emoji-led phrase in the
// table also answers to the bare phrase -- plus the few menu labels that
// never had a Dutch line of their own.
(function () {
  const add = {
    'Move to…': 'Verplaatsen naar…',
    Rename: 'Hernoemen',
    '⚔ Set format…': '⚔ Format kiezen…',
    'View card': 'Kaart bekijken',
    'Add to collection…': 'Aan collectie toevoegen…',
  };
  Object.keys(add).forEach((k) => {
    if (I18N.nl && I18N.nl[k] == null) I18N.nl[k] = add[k];
  });
  Object.keys(I18N).forEach((lang) => {
    const d = I18N[lang];
    Object.keys(d).forEach((k) => {
      const m = k.match(/^(\S+)\s+([\s\S]+)$/);
      if (!m || !/[\u{1F000}-\u{1FAFF}]/u.test(m[1])) return;
      if (d[m[2]] == null) d[m[2]] = String(d[k]).replace(/^\S+\s+/, '');
    });
  });
})();

function trS(t) {
  // For strings built in JS (dialog titles, buttons, toasts) that the DOM
  // translator can't reach — translate at the call site instead.
  const d = I18N[appLang()];
  return (d && d[t]) || t;
}

function trText(t, lang) {
  const d = I18N[lang];
  if (!d) return null;
  const key = t.trim();
  if (key && d[key] != null) return t.replace(key, d[key]);
  let out = t,
    hit = false;
  (I18N_RX[lang] || []).forEach(([re, sub]) => {
    if (re.test(out)) {
      out = out.replace(re, sub);
      hit = true;
    }
    re.lastIndex = 0;
  });
  return hit ? out : null;
}

function translateTree(root) {
  const lang = appLang();
  if (lang === 'en' || !I18N[lang] || !root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const p = n.parentNode && n.parentNode.nodeName;
    if (p === 'SCRIPT' || p === 'STYLE' || p === 'INPUT' || p === 'TEXTAREA') continue;
    // 1.33: text written by someone else (the judge's answer) stays as written
    if (n.parentElement && n.parentElement.closest('[data-notr]')) continue;
    const nv = trText(n.nodeValue, lang);
    if (nv != null && nv !== n.nodeValue) n.nodeValue = nv;
  }
  (root.querySelectorAll ? root.querySelectorAll('[placeholder],[title]') : []).forEach((el) => {
    ['placeholder', 'title'].forEach((attr) => {
      const v = el.getAttribute(attr);
      if (!v) return;
      const nv = trText(v, lang);
      if (nv != null && nv !== v) el.setAttribute(attr, nv);
    });
  });
}

let _i18nPending = false,
  _i18nActive = false;

const _i18nObserver = new MutationObserver(() => {
  if (!_i18nActive || _i18nPending) return;
  _i18nPending = true;
  requestAnimationFrame(() => {
    _i18nPending = false;
    try {
      translateTree(document.body);
    } catch (e) {}
  });
});

// The machinery sleeps until a language is chosen: English users pay zero
// translation work — no observer, no tree walks — ever. nodeValue edits don't
// retrigger the observer (childList only), so there's no feedback loop.
function enableI18n() {
  if (_i18nActive || appLang() === 'en') return;
  _i18nActive = true;
  _i18nObserver.observe(document.body, { childList: true, subtree: true });
  translateTree(document.body);
}

function disableI18n() {
  if (!_i18nActive) return;
  _i18nActive = false;
  _i18nObserver.disconnect();
}

// Activate immediately at boot when a language is saved — the observer is in
// place before the first render, so the app wakes up in yesterday's language.
if (appLang() !== 'en') {
  try {
    enableI18n();
  } catch (e) {}
}

try {
  tellNativeLang(appLang());
} catch (e) {}

/* Notifications come from the Android app only. The browser version (Chrome,
   the installed web app) quietly drops any push subscription it still holds
   -- on the phone and on the server -- a few seconds after start. */
function retireWebPush() {
  if (window.DeckhandNotify) return;
  try {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready
      .then((reg) => (reg && reg.pushManager ? reg.pushManager.getSubscription() : null))
      .then(async (sub) => {
        if (!sub) return;
        try {
          await fetch('/.netlify/functions/push-subscribe', {
            method: 'DELETE',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
        } catch (e) {}
        try {
          await sub.unsubscribe();
        } catch (e) {}
        try {
          localStorage.setItem(LS_PREFIX + 'pushOn', '0');
        } catch (e) {}
      })
      .catch(() => {});
  } catch (e) {}
}

setTimeout(retireWebPush, 4000);

const APP_LANGS = [
  { code: 'nl', label: 'Nederlands', cards: false },
  { code: 'en', label: 'English', cards: true },
];

function appLang() {
  try {
    return localStorage.getItem(LS_PREFIX + 'lang') || 'en';
  } catch (e) {
    return 'en';
  }
}

function setAppLang(code) {
  try {
    localStorage.setItem(LS_PREFIX + 'lang', code);
  } catch (e) {}
  tellNativeLang(code);
}

/* The Android app writes its own notifications; it must know the language
   before the first one, not only after Extras has been opened. */
function tellNativeLang(code) {
  try {
    const n = window.DeckhandNotify;
    if (n && typeof n.setLang === 'function') n.setLang(code || appLang());
  } catch (e) {}
}

const CARD_LANGS = new Set(['de', 'fr', 'es', 'it']);

async function localizedCardData(card) {
  // Resolve this card's localized PRINTING, if one exists: its image and its
  // printed Oracle text as it appears on the physical card. Cached per
  // session, background lane, silent English fallback. Rulings are not part
  // of this — Scryfall publishes rulings in English only, so they stay
  // English by necessity, which also matches how judges cite them.
  const lang = appLang();
  if (!CARD_LANGS.has(lang) || !card || !card.name) return null;
  state._langImgCache = state._langImgCache || {};
  const key = lang + '|' + card.name;
  if (key in state._langImgCache) return state._langImgCache[key];
  let out = null;
  try {
    const q = `!"${card.name}" lang:${lang}`;
    const res = await sfFetch(
      `${SF_BASE}/cards/search?unique=prints&q=${encodeURIComponent(q)}`,
      0,
      true,
    );
    if (res.ok) {
      const data = await res.json();
      const p = (data.data || [])[0];
      if (p) {
        const imgs =
          p.image_uris || (p.card_faces && p.card_faces[0] && p.card_faces[0].image_uris) || {};
        const rawFaces = p.card_faces && p.card_faces.length ? p.card_faces : [p];
        out = {
          img: imgs.large || imgs.normal || null,
          faces: rawFaces.map((f) => ({
            name: f.printed_name || null,
            type: f.printed_type_line || null,
            text: f.printed_text || null,
          })),
        };
        if (!out.img && !out.faces.some((f) => f.text)) out = null;
      }
    }
  } catch (e) {}
  state._langImgCache[key] = out;
  return out;
}

function applyLocalizedSheetImage(card, imgId) {
  if (!CARD_LANGS.has(appLang())) return;
  // Identity anchors: the exact DOM nodes as they exist right now. Every
  // sheet render replaces these nodes (same ids, new elements), so a slow
  // localized lookup for an earlier card fails the identity check below and
  // is dropped — it can never paint its art or text onto a newer card.
  const imgAnchor = document.getElementById(imgId);
  const oracleAnchor = document.getElementById('sheetOracle');
  localizedCardData(card).then((loc) => {
    if (!loc) return;
    if (loc.img) {
      const el = document.getElementById(imgId);
      if (el && el === imgAnchor && el.alt !== undefined && el.dataset.dfcBack !== '1')
        el.src = loc.img;
    }
    // Printed Oracle text replaces the English text ONLY when this card was
    // actually printed in the chosen language with text to show.
    const box = document.getElementById('sheetOracle');
    if (box && box === oracleAnchor && loc.faces && loc.faces.some((f) => f.text)) {
      const enFaces = card.card_faces && card.card_faces.length ? card.card_faces : [card];
      box.querySelectorAll('.oracle-face').forEach((faceEl, i) => {
        const lf = loc.faces[i],
          ef = enFaces[i] || {};
        if (!lf) return;
        const nameEl = faceEl.querySelector('.oracle-name');
        const typeEl = faceEl.querySelector('.oracle-type');
        const textEl = faceEl.querySelector('.oracle-text');
        if (lf.name && nameEl) nameEl.textContent = lf.name;
        if (lf.type && typeEl) {
          const pt =
            ef.power !== undefined && ef.power !== null
              ? `${ef.power}/${ef.toughness}`
              : ef.loyalty !== undefined && ef.loyalty !== null
                ? `Loyalty ${ef.loyalty}`
                : '';
          typeEl.textContent = lf.type + (pt ? ` · ${pt}` : '');
        }
        if (lf.text && textEl) textEl.innerHTML = escapeHtml(lf.text).replace(/\n/g, '<br>');
      });
    }
  });
}
