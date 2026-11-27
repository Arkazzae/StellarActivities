/**
 * The opponent ladder: eight parodies of video-game types, from the level-1 slime to the final boss,
 * each with a nominal rating, a way of choosing among Stockfish's lines (see src/ai/persona.ts) and
 * something to say. Stockfish itself closes the list with the player's own settings.
 *
 * They parody kinds of game characters (the slime, the NPC, the speedrunner, the mimic, the merchant,
 * the tank, the combo master, the final boss), never a particular character from a game.
 * Ratings are targets, not measured results: each rung searches shallower and chooses more loosely
 * than the one above it (softmax over Stockfish's lines, temperature in centipawns), but no rung has
 * been rated against a calibrated opponent yet.
 */

import { getLocale } from "@/i18n";
import type { PersonaStyle } from "@/ai/persona";
import type { BotDefinition, ChatMessages } from "./types";
import { CHAOS_CHARACTERS, type ChaosCharacterId } from "./chaos-characters";

/** The ladder's eight, and the five who play Chaos Chess (src/ai/bots/chaos-characters.ts). */
export type CharacterId = "glut" | "zenek" | "turbo" | "mimik" | "bazyl" | "bronka" | "bogdan" | "mordax" | ChaosCharacterId;

/** 32-bit-style pixel-art portraits drawn by Codex from the brief in ARTWORK.md (full-bleed WebP). */
export const PORTRAIT_FORMAT: "svg" | "webp" = "webp";

export const botAvatarUrl = (id: CharacterId | "stockfish") => `avatars/bots/${id}.${PORTRAIT_FORMAT}`;

/** Everything a character says outside the game chat, in one language. */
export interface CharacterText {
  /** A few words under the name. */
  short: string;
  description: string;
  /** Said on the bot screen when picked. */
  greetings: [string, string, string];
  /** "Glut won" after the game, in the move list. */
  won: string;
  /** Title of the game-over card when the character wins. */
  over: string;
  quips: { win: [string, string]; loss: [string, string]; draw: [string, string] };
}

export interface Character {
  id: CharacterId;
  name: string;
  /** Nominal rating shown on the card; also paces how often it hesitates on the clock. */
  rating: number;
  tint: string;
  thinkDelay: number;
  style: PersonaStyle;
  text: { en: CharacterText; pl: CharacterText };
  chat: { en: ChatMessages; pl: ChatMessages };
}

const NO_TASTE = { captureBonus: 0, checkBonus: 0, queenBonus: 0, queenUntilPly: 0, pawnBonus: 0 };

export const CHARACTERS: Character[] = [
  {
    id: "glut",
    name: "Glut",
    rating: 250,
    tint: "#8cc63f",
    thinkDelay: 1400,
    // The level-1 slime: any legal move almost half the time, otherwise swallows whatever it can reach.
    style: { depth: 2, moveTimeMs: 250, lines: 12, temperature: 350, randomMove: 0.45, captureBonus: 260, checkBonus: 40, queenBonus: 0, queenUntilPly: 0, pawnBonus: 0 },
    text: {
      en: {
        short: "Level 1 slime",
        description: "The first enemy of every adventure, and very proud of it. Bounces at whatever is closest, swallows pieces whole and forgets where it put them.",
        greetings: ["Blorp! A hero! My first hero!", "I am the strongest slime in this field. The only one, too.", "*wobbles menacingly*"],
        won: "Glut won",
        over: "Glut Won!",
        quips: {
          win: ["Glut drops 3 XP and a slightly sticky pawn.", "Every hero starts by beating a slime. Welcome."],
          loss: ["Defeated by a level-1 slime. The tutorial will remember this.", "Glut is bouncing with joy. Literally."],
          draw: ["A draw with a slime. Half the XP each.", "Glut thinks a draw is a kind of snack."],
        },
      },
      pl: {
        short: "Glut z poziomu 1",
        description: "Pierwszy przeciwnik w każdej przygodzie i bardzo z tego dumny. Skacze na to, co najbliżej, połyka figury w całości i zapomina, gdzie je zostawił.",
        greetings: ["Blup! Bohater! Mój pierwszy bohater!", "Jestem najsilniejszym glutem na tej łące. I jedynym.", "*groźnie się trzęsie*"],
        won: "Glut wygrał",
        over: "Glut wygrał!",
        quips: {
          win: ["Z Gluta wypadło 3 XP i lekko klejący pion.", "Każdy bohater zaczyna od pokonania gluta. Witaj."],
          loss: ["Przegrana z glutem z poziomu 1. Samouczek ci tego nie zapomni.", "Glut podskakuje z radości. Dosłownie."],
          draw: ["Remis z glutem. Doświadczenie po połowie.", "Glut myśli, że remis to rodzaj przekąski."],
        },
      },
    },
    chat: {
      en: {
        start: ["Blorp! Prepare to be... slightly sticky!", "I've been waiting in this field all day!", "Hero spotted! Commence wobbling!"],
        capture: ["*gulp*", "Mine now. Inside me.", "Nom. Crunchy.", ""],
        blunder: ["You dropped that! For Glut?", "Loot! Free loot!", "Blorp?! I can eat that?"],
        trouble: ["Glut is... getting smaller.", "Wait, wait, I'm only level one!", "*nervous jiggling*"],
        brilliantMove: ["Whoa. Was that a critical hit?", "Glut did not see that coming. Glut sees nothing coming."],
        win: ["GLUT WINS! Glut levels up!", "A slime defeated a hero! Write it in the legends!"],
        loss: ["*splorch* ...respawning soon.", "Good game! Glut will be back by the signpost."],
        idle: ["*bounce* *bounce*", "Is it my turn? In my heart it's always my turn.", "There's a pawn in me and it tickles.", ""],
        mirror: ["Two slimes! We could merge!", "Glut versus Glut. Glut will surely win."],
        mirrorEnd: ["One Glut ate the other Glut. Now there is more Glut.", "Again! Glut was born for this."],
      },
      pl: {
        start: ["Blup! Przygotuj się na... lekkie klejenie!", "Czekałem na tej łące cały dzień!", "Bohater w zasięgu! Zaczynam się trząść!"],
        capture: ["*gul*", "Teraz moje. W środku.", "Mniam. Chrupiące.", ""],
        blunder: ["Upuściłeś to! Dla Gluta?", "Łup! Darmowy łup!", "Blup?! Mogę to zjeść?"],
        trouble: ["Glut się... zmniejsza.", "Czekaj, czekaj, mam dopiero pierwszy poziom!", "*nerwowo się trzęsie*"],
        brilliantMove: ["Łooo. To był cios krytyczny?", "Glut tego nie przewidział. Glut niczego nie przewiduje."],
        win: ["GLUT WYGRAŁ! Glut wbija poziom!", "Glut pokonał bohatera! Zapiszcie to w legendach!"],
        loss: ["*plask* ...zaraz się odrodzę.", "Dobra gra! Glut wróci przy drogowskazie."],
        idle: ["*hop* *hop*", "Moja kolej? W sercu zawsze jest moja kolej.", "Mam w sobie piona i łaskocze.", ""],
        mirror: ["Dwa gluty! Możemy się połączyć!", "Glut kontra Glut. Glut na pewno wygra."],
        mirrorEnd: ["Jeden Glut zjadł drugiego. Teraz jest więcej Gluta.", "Jeszcze raz! Glut się do tego urodził."],
      },
    },
  },
  {
    id: "zenek",
    name: "Zenek",
    rating: 450,
    tint: "#d9b44a",
    thinkDelay: 2600,
    // The villager NPC: thinks slowly, loves pushing pawns, still drops pieces now and then.
    style: { depth: 3, moveTimeMs: 300, lines: 10, temperature: 240, randomMove: 0.28, captureBonus: 90, checkBonus: 20, queenBonus: 0, queenUntilPly: 0, pawnBonus: 70 },
    text: {
      en: {
        short: "The NPC who never leaves the well",
        description: "Has stood by the same well since the game came out, and has one quest for you: find his chicken. Pushes pawns, thinks slowly and repeats himself.",
        greetings: ["Hello, traveller! My chicken ran off towards h8.", "Hello, traveller! My chicken ran off towards h8.", "Fine weather for a quest, isn't it?"],
        won: "Zenek won",
        over: "Zenek Won",
        quips: {
          win: ["Quest complete! Your reward: Zenek's eternal gratitude.", "Zenek will say \"Hello, traveller!\" until the next game."],
          loss: ["Beaten by an NPC. He doesn't even have a walking animation.", "Zenek returns to the well. Nothing has changed."],
          draw: ["A draw. Zenek's dialogue ends here.", "Zenek nods. He nods at everything."],
        },
      },
      pl: {
        short: "NPC, który nie odchodzi od studni",
        description: "Stoi przy tej samej studni od premiery gry i ma dla ciebie jedno zadanie: znaleźć jego kurę. Pcha piony, myśli powoli i powtarza się.",
        greetings: ["Witaj, wędrowcze! Moja kura uciekła w stronę h8.", "Witaj, wędrowcze! Moja kura uciekła w stronę h8.", "Piękna pogoda na przygodę, prawda?"],
        won: "Zenek wygrał",
        over: "Zenek wygrał",
        quips: {
          win: ["Zadanie wykonane! Nagroda: dozgonna wdzięczność Zenka.", "Zenek będzie mówił „Witaj, wędrowcze!” aż do następnej partii."],
          loss: ["Przegrana z NPC. On nawet nie ma animacji chodzenia.", "Zenek wraca do studni. Nic się nie zmieniło."],
          draw: ["Remis. Tu kończą się dialogi Zenka.", "Zenek kiwa głową. Kiwa na wszystko."],
        },
      },
    },
    chat: {
      en: {
        start: ["Hello, traveller!", "Have you seen my chicken?", "I used to stand right here, by the well. I still do."],
        capture: ["Oh! A quest item!", "I'll put that in my inventory.", "That goes in the barn.", ""],
        blunder: ["Hello, traveller! You left that piece.", "Is that a reward for me?", "Mighty generous of you, traveller."],
        trouble: ["I'm just a simple villager!", "Guards! Guards? There are no guards.", "This wasn't in my dialogue."],
        brilliantMove: ["Gosh! A real hero!", "They'll sing about that one in the tavern."],
        win: ["Quest complete! Hello, traveller!", "I won? Nobody scripted that."],
        loss: ["Well done, traveller. Now, about my chicken...", "Hello, traveller! Another game?"],
        idle: ["Hello, traveller!", "Nice day. Same as yesterday.", "*stands by the well*", ""],
        mirror: ["Hello, traveller! Hello, traveller!", "Two of us, one well."],
        mirrorEnd: ["One of us finished the quest.", "Hello, traveller! Again?"],
      },
      pl: {
        start: ["Witaj, wędrowcze!", "Nie widziałeś mojej kury?", "Kiedyś stałem tu, przy studni. Nadal stoję."],
        capture: ["O! Przedmiot fabularny!", "Schowam do ekwipunku.", "To pójdzie do stodoły.", ""],
        blunder: ["Witaj, wędrowcze! Zostawiłeś figurę.", "To nagroda dla mnie?", "Hojny z ciebie wędrowiec."],
        trouble: ["Jestem tylko prostym wieśniakiem!", "Straż! Straż? Nie ma straży.", "Tego nie było w moich dialogach."],
        brilliantMove: ["O rety! Prawdziwy bohater!", "W karczmie będą o tym śpiewać."],
        win: ["Zadanie wykonane! Witaj, wędrowcze!", "Wygrałem? Nikt tego nie zaskryptował."],
        loss: ["Dobra robota, wędrowcze. A co do mojej kury...", "Witaj, wędrowcze! Jeszcze jedna?"],
        idle: ["Witaj, wędrowcze!", "Ładny dzień. Taki sam jak wczoraj.", "*stoi przy studni*", ""],
        mirror: ["Witaj, wędrowcze! Witaj, wędrowcze!", "Nas dwóch, studnia jedna."],
        mirrorEnd: ["Któryś z nas wykonał zadanie.", "Witaj, wędrowcze! Jeszcze raz?"],
      },
    },
  },
  {
    id: "turbo",
    name: "Turbo",
    rating: 700,
    tint: "#22c7d6",
    thinkDelay: 250,
    // The speedrunner: instant moves, the queen out early on a mating route, checks look irresistible.
    style: { depth: 4, moveTimeMs: 400, lines: 8, temperature: 140, randomMove: 0.14, captureBonus: 110, checkBonus: 70, queenBonus: 190, queenUntilPly: 20, pawnBonus: 0 },
    text: {
      en: {
        short: "Speedrunner, any% or reset",
        description: "Plays every game like a world-record attempt: instant moves, the queen out early and a mate in as few moves as possible. If the route breaks, she wants a reset.",
        greetings: ["Timer's running. Let's go.", "My personal best against you is twelve moves. Today: ten.", "No time to talk, every frame counts."],
        won: "Turbo won",
        over: "Turbo Won!",
        quips: {
          win: ["Run dead. Turbo is already asking for a reset.", "You broke her route. She will not forget it."],
          loss: ["Turbo set a new personal best. On you.", "That was fast. That was the point."],
          draw: ["A draw. No record, no reset, just sadness.", "Turbo calls that a soft lock."],
        },
      },
      pl: {
        short: "Speedrunnerka, any% albo reset",
        description: "Każdą partię gra jak próbę rekordu świata: ruchy natychmiast, hetman wcześnie na planszy i mat jak najszybciej. Kiedy trasa się sypie, chce resetu.",
        greetings: ["Stoper ruszył. Lecimy.", "Mój rekord na tobie to dwanaście ruchów. Dziś: dziesięć.", "Nie ma czasu gadać, liczy się każda klatka."],
        won: "Turbo wygrała",
        over: "Turbo wygrała!",
        quips: {
          win: ["Run spalony. Turbo już prosi o reset.", "Rozwaliłeś jej trasę. Nie zapomni ci tego."],
          loss: ["Turbo pobiła rekord życiowy. Na tobie.", "Szybko poszło. I o to chodziło."],
          draw: ["Remis. Ani rekordu, ani resetu, tylko smutek.", "Turbo nazywa to softlockiem."],
        },
      },
    },
    chat: {
      en: {
        start: ["Timer started. GO GO GO.", "Route planned: queen out, mate fast.", "Any%, let's go."],
        capture: ["Skip!", "Clipped right through that.", "Saved two seconds.", ""],
        blunder: ["Ooh, that's a time save for me.", "Frame-perfect blunder. Thanks.", "That piece was on my route."],
        trouble: ["The route is broken.", "Okay, this run is dead. Can we reset?", "The RNG hates me today."],
        brilliantMove: ["Wait, is that a new strat?", "Clip that. Seriously."],
        win: ["NEW PB! Stop the timer!", "Under twenty moves, baby."],
        loss: ["Reset. Again. Now.", "GG. I'm grinding this matchup."],
        idle: ["Tick, tick, tick.", "Every second you think costs me a record.", "*sips energy drink*", ""],
        mirror: ["Racing my own ghost. Classic.", "Same route, two runners."],
        mirrorEnd: ["Ghost beaten. Or I was the ghost.", "Reset and go again."],
      },
      pl: {
        start: ["Stoper odpalony. JAZDA.", "Trasa gotowa: hetman wychodzi, szybki mat.", "Any%, lecimy."],
        capture: ["Skip!", "Przeleciałam przez to.", "Dwie sekundy zaoszczędzone.", ""],
        blunder: ["O, to mi skraca trasę.", "Błąd co do klatki. Dzięki.", "Ta figura była na mojej trasie."],
        trouble: ["Trasa się posypała.", "Dobra, ten run jest spalony. Resetujemy?", "RNG mnie dziś nienawidzi."],
        brilliantMove: ["Czekaj, to nowa strategia?", "Klipuj to. Serio."],
        win: ["NOWY REKORD! Stop stoper!", "Poniżej dwudziestu ruchów, kochani."],
        loss: ["Reset. Jeszcze raz. Teraz.", "GG. Będę grindować ten matchup."],
        idle: ["Tik, tik, tik.", "Każda sekunda twojego myślenia kosztuje mnie rekord.", "*łyk energetyka*", ""],
        mirror: ["Wyścig z własnym duchem. Klasyka.", "Ta sama trasa, dwie biegaczki."],
        mirrorEnd: ["Duch pokonany. Albo to ja byłam duchem.", "Reset i jeszcze raz."],
      },
    },
  },
  {
    id: "mimik",
    name: "Mimik",
    rating: 1000,
    tint: "#c9962e",
    thinkDelay: 1100,
    // The mimic: lies in wait, loves a sudden check, sometimes misses the reply.
    style: { depth: 4, moveTimeMs: 500, lines: 7, temperature: 110, randomMove: 0.07, captureBonus: 40, checkBonus: 90, queenBonus: 0, queenUntilPly: 0, pawnBonus: 0 },
    text: {
      en: {
        short: "Looks like loot. Isn't.",
        description: "A perfectly ordinary treasure chest. Leaves a shiny piece within reach, waits, and bites. Loves a sudden check.",
        greetings: ["I'm just a chest. Open me.", "Totally normal chest here. Nothing to see. Come closer.", "*creak*"],
        won: "Mimik won",
        over: "Mimik Won",
        quips: {
          win: ["You didn't open the chest. Wise.", "Mimik is pretending to be furniture again."],
          loss: ["You took the bait. Everybody takes the bait.", "Never trust a chest in a dungeon."],
          draw: ["A draw. Mimik is still hungry.", "Mimik closes its lid and sulks."],
        },
      },
      pl: {
        short: "Wygląda jak łup. Nie jest.",
        description: "Zupełnie zwyczajna skrzynia ze skarbem. Zostawia błyszczącą figurę w zasięgu, czeka i gryzie. Uwielbia nagłe szachy.",
        greetings: ["Jestem tylko skrzynią. Otwórz mnie.", "Całkiem normalna skrzynia. Nic tu nie ma. Podejdź bliżej.", "*skrzyp*"],
        won: "Mimik wygrał",
        over: "Mimik wygrał",
        quips: {
          win: ["Nie otworzyłeś skrzyni. Mądrze.", "Mimik znowu udaje mebel."],
          loss: ["Połknąłeś przynętę. Wszyscy ją połykają.", "Nigdy nie ufaj skrzyni w lochu."],
          draw: ["Remis. Mimik dalej jest głodny.", "Mimik zamyka wieko i się dąsa."],
        },
      },
    },
    chat: {
      en: {
        start: ["*creak* Open me...", "Shiny things inside. Promise.", "Just a chest. Definitely a chest."],
        capture: ["CHOMP.", "Snap!", "*satisfied lid noises*", ""],
        blunder: ["Ooh, you came closer.", "Leaving that lying around? Like me?", "Free loot, you say?"],
        trouble: ["Ow, splinters.", "Hey, don't kick the chest!", "I'm... I'm just furniture. Ignore me."],
        brilliantMove: ["You saw through the trap? Rude.", "Nobody has ever checked me for teeth before."],
        win: ["Got you. Everyone opens the chest eventually.", "*munch* Delicious hero."],
        loss: ["Fine. Take the loot. It's mostly teeth.", "The next adventurer will be easier."],
        idle: ["*creak*", "Treasure... inside... come and look...", "Do you smell gold? I smell gold.", ""],
        mirror: ["Two chests. Which one bites?", "Trap versus trap."],
        mirrorEnd: ["One chest bit first.", "We're both still hungry. Again."],
      },
      pl: {
        start: ["*skrzyp* Otwórz mnie...", "W środku same błyskotki. Słowo.", "Zwykła skrzynia. Na pewno skrzynia."],
        capture: ["CHAP.", "Kłap!", "*zadowolone skrzypienie wieka*", ""],
        blunder: ["O, podszedłeś bliżej.", "Tak to zostawiasz na wierzchu? Jak mnie?", "Darmowy łup, mówisz?"],
        trouble: ["Au, drzazgi.", "Ej, nie kop skrzyni!", "Ja... ja jestem tylko meblem. Nie patrz."],
        brilliantMove: ["Przejrzałeś pułapkę? Niegrzecznie.", "Nikt mi jeszcze nie zajrzał w zęby."],
        win: ["Mam cię. Każdy w końcu otwiera skrzynię.", "*mlask* Pyszny bohater."],
        loss: ["No dobra. Bierz łup. To głównie zęby.", "Następny poszukiwacz będzie łatwiejszy."],
        idle: ["*skrzyp*", "Skarb... w środku... zajrzyj...", "Czujesz złoto? Ja czuję złoto.", ""],
        mirror: ["Dwie skrzynie. Która gryzie?", "Pułapka na pułapkę."],
        mirrorEnd: ["Jedna skrzynia ugryzła pierwsza.", "Obie dalej jesteśmy głodne. Jeszcze raz."],
      },
    },
  },
  {
    id: "bazyl",
    name: "Bazyl",
    rating: 1300,
    tint: "#e07b39",
    thinkDelay: 900,
    // The travelling merchant: likes material and trades whenever he can, occasionally overreaches.
    style: { depth: 5, moveTimeMs: 600, lines: 6, temperature: 80, randomMove: 0.04, captureBonus: 80, checkBonus: 20, queenBonus: 0, queenUntilPly: 0, pawnBonus: 0 },
    text: {
      en: {
        short: "Travelling merchant, everything must go",
        description: "Turns up at every crossroads with a backpack taller than himself. Sees every capture as a bargain and trades pieces until the board looks like a clearance sale.",
        greetings: ["Welcome, welcome! Today's special: a slightly used bishop.", "I buy pieces, I sell pieces. Mostly I swap them.", "Fair prices, friend. Fair-ish."],
        won: "Bazyl won",
        over: "Bazyl Won",
        quips: {
          win: ["Bazyl calls it a loss leader.", "He's already selling a replay of this game."],
          loss: ["Bazyl made a profit. On you.", "Every trade went his way. Check the receipt."],
          draw: ["A draw. Bazyl calls it a fair deal.", "An even trade. Bazyl hates even trades."],
        },
      },
      pl: {
        short: "Wędrowny handlarz, wszystko na sprzedaż",
        description: "Pojawia się na każdym rozstaju z plecakiem wyższym od siebie. Każde bicie to dla niego okazja, więc wymienia figury, aż plansza wygląda jak wyprzedaż.",
        greetings: ["Witam, witam! Dziś w promocji lekko używany goniec.", "Kupuję figury, sprzedaję figury. Głównie wymieniam.", "Uczciwe ceny, przyjacielu. Prawie uczciwe."],
        won: "Bazyl wygrał",
        over: "Bazyl wygrał",
        quips: {
          win: ["Bazyl mówi, że to promocja na start.", "Już sprzedaje powtórkę tej partii."],
          loss: ["Bazyl wyszedł na plus. Na tobie.", "Każda wymiana wyszła na jego korzyść. Sprawdź paragon."],
          draw: ["Remis. Bazyl mówi, że to uczciwy interes.", "Wymiana jeden do jednego. Bazyl tego nie znosi."],
        },
      },
    },
    chat: {
      en: {
        start: ["Let's do business!", "Everything's for sale. Even this pawn.", "The first trade is always the best one."],
        capture: ["Sold!", "Into the backpack.", "A fine addition to my stock.", ""],
        blunder: ["Giving that away? I'll take it, no charge.", "A free sample! Thank you!", "A bargain like that doesn't come twice."],
        trouble: ["My margins are getting thin.", "This is daylight robbery!", "Let's renegotiate."],
        brilliantMove: ["Now that's a deal I didn't see coming.", "You'd make a fine merchant."],
        win: ["Pleasure doing business!", "All sold out. Come again!"],
        loss: ["Fine, fine. Store credit next time.", "You drive a hard bargain, friend."],
        idle: ["Potions? Scrolls? A lightly used rook?", "*counts coins*", "Take your time, browsing is free.", ""],
        mirror: ["Me selling to me. Finally, a fair customer.", "Two merchants, one market."],
        mirrorEnd: ["One of me made a profit.", "Business is business. Again?"],
      },
      pl: {
        start: ["Zróbmy interes!", "Wszystko na sprzedaż. Nawet ten pion.", "Pierwsza wymiana jest zawsze najlepsza."],
        capture: ["Sprzedane!", "Do plecaka.", "Piękny nabytek do kolekcji.", ""],
        blunder: ["Oddajesz to? Biorę, bez opłat.", "Darmowa próbka! Dziękuję!", "Taka okazja nie trafia się dwa razy."],
        trouble: ["Marża mi się kurczy.", "To rozbój w biały dzień!", "Renegocjujmy."],
        brilliantMove: ["O, takiego interesu się nie spodziewałem.", "Byłby z ciebie dobry kupiec."],
        win: ["Miło robić z tobą interesy!", "Wszystko wyprzedane. Zapraszam ponownie!"],
        loss: ["Dobrze, dobrze. Następnym razem bon na zakupy.", "Twardo negocjujesz, przyjacielu."],
        idle: ["Mikstury? Zwoje? Lekko używana wieża?", "*liczy monety*", "Nie spiesz się, oglądanie jest za darmo.", ""],
        mirror: ["Sprzedaję sam sobie. Wreszcie uczciwy klient.", "Dwóch kupców, jeden targ."],
        mirrorEnd: ["Któryś ze mnie wyszedł na plus.", "Interes to interes. Jeszcze raz?"],
      },
    },
  },
  {
    id: "bronka",
    name: "Bronka",
    rating: 1600,
    tint: "#5b7fa8",
    thinkDelay: 1500,
    // The tank: sound, patient moves and a wall of pawns, an inaccuracy now and then.
    style: { depth: 6, moveTimeMs: 900, lines: 5, temperature: 55, randomMove: 0.02, captureBonus: 0, checkBonus: 0, queenBonus: 0, queenUntilPly: 0, pawnBonus: 20 },
    text: {
      en: {
        short: "The tank. Nothing gets past.",
        description: "Stands at the front with a tower shield and holds the line while others panic. Solid moves, pawn walls and no hurry: she is waiting for you to run out of ideas.",
        greetings: ["Stay behind me. Oh, you're the enemy. Then stay in front.", "I've got the aggro. Hit me.", "There's a rook on my shield. Think about that."],
        won: "Bronka won",
        over: "Bronka Won",
        quips: {
          win: ["You broke the tank. The whole raid is cheering.", "Bronka nods. A respectful nod."],
          loss: ["You hit the shield until you ran out of moves.", "Tanks don't win fast. They just win."],
          draw: ["A draw. Bronka held the line, and so did you.", "Nobody got through. Bronka calls that a good day."],
        },
      },
      pl: {
        short: "Tank. Nikt nie przejdzie.",
        description: "Stoi z przodu z wielką tarczą i trzyma linię, kiedy inni panikują. Solidne ruchy, mur pionów i zero pośpiechu: czeka, aż skończą ci się pomysły.",
        greetings: ["Stań za mną. A, jesteś wrogiem. To stań przede mną.", "Mam aggro. Bij.", "Na mojej tarczy jest wieża. Pomyśl o tym."],
        won: "Bronka wygrała",
        over: "Bronka wygrała",
        quips: {
          win: ["Przebiłeś tanka. Cały rajd bije brawo.", "Bronka kiwa głową. Z szacunkiem."],
          loss: ["Biłeś w tarczę, aż skończyły ci się ruchy.", "Tanki nie wygrywają szybko. Po prostu wygrywają."],
          draw: ["Remis. Bronka utrzymała linię, ty też.", "Nikt nie przeszedł. Bronka mówi, że to dobry dzień."],
        },
      },
    },
    chat: {
      en: {
        start: ["Shield up.", "I'll hold the line.", "Come at me. Everyone does."],
        capture: ["Blocked and countered.", "Shield bash.", "Next.", ""],
        blunder: ["You left a gap in your armour.", "Overextended. I'll take it.", "That's what happens when you charge alone."],
        trouble: ["Shield's cracking. Still standing.", "I need a healer.", "Holding... holding..."],
        brilliantMove: ["Good hit. Felt that one.", "You found a way past the shield. Respect."],
        win: ["The line held.", "Last one standing. As planned."],
        loss: ["Shield down. Good fight.", "You got through. Not many do."],
        idle: ["*adjusts shield*", "No rush. I'm not going anywhere.", "Patience is armour too.", ""],
        mirror: ["Two tanks. This will take a while.", "Shield against shield."],
        mirrorEnd: ["One shield cracked first.", "Good drill. Again."],
      },
      pl: {
        start: ["Tarcza w górę.", "Utrzymam linię.", "Dawaj. Wszyscy próbują."],
        capture: ["Blok i kontra.", "Cios tarczą.", "Następny.", ""],
        blunder: ["Masz dziurę w pancerzu.", "Za daleko wyszedłeś. Biorę.", "Tak się kończy szarża w pojedynkę."],
        trouble: ["Tarcza pęka. Dalej stoję.", "Potrzebuję healera.", "Trzymam... trzymam..."],
        brilliantMove: ["Dobre trafienie. Poczułam.", "Znalazłeś drogę za tarczę. Szacunek."],
        win: ["Linia utrzymana.", "Zostałam ostatnia. Zgodnie z planem."],
        loss: ["Tarcza opuszczona. Dobra walka.", "Przeszedłeś. Mało komu się udaje."],
        idle: ["*poprawia tarczę*", "Bez pośpiechu. Nigdzie się nie wybieram.", "Cierpliwość to też pancerz.", ""],
        mirror: ["Dwa tanki. To potrwa.", "Tarcza na tarczę."],
        mirrorEnd: ["Jedna tarcza pękła pierwsza.", "Dobry trening. Jeszcze raz."],
      },
    },
  },
  {
    id: "bogdan",
    name: "Bogdan",
    rating: 1900,
    tint: "#e0533a",
    thinkDelay: 700,
    // The combo master: usually one of the best lines, with a strong taste for checks and captures in a row.
    style: { depth: 8, moveTimeMs: 1200, lines: 4, temperature: 35, randomMove: 0.01, captureBonus: 20, checkBonus: 45, queenBonus: 0, queenUntilPly: 0, pawnBonus: 0 },
    text: {
      en: {
        short: "Combo master, never drops an input",
        description: "A fighting-game veteran who sees chess as one long combo: check, check, capture, mate. Sharp, forcing and very loud about it.",
        greetings: ["Ready? Fight!", "I've got a forty-hit combo with your name on it.", "Block this. You can't."],
        won: "Bogdan won",
        over: "Bogdan Won!",
        quips: {
          win: ["You broke the combo. He is replaying it frame by frame.", "Perfect defence. Bogdan demands a rematch, best of three."],
          loss: ["Combo x12. You never got to move.", "That was one long combo, and you were in it."],
          draw: ["A draw. Time over, equal health.", "Double KO. Bogdan is furious."],
        },
      },
      pl: {
        short: "Mistrz combosów, nie gubi ani jednego wejścia",
        description: "Weteran bijatyk, dla którego szachy to jedno długie combo: szach, szach, bicie, mat. Ostry, forsowny i bardzo głośno o tym mówi.",
        greetings: ["Gotowy? Walka!", "Mam dla ciebie combo na czterdzieści ciosów.", "Zablokuj to. Nie dasz rady."],
        won: "Bogdan wygrał",
        over: "Bogdan wygrał!",
        quips: {
          win: ["Przerwałeś combo. Ogląda to teraz klatka po klatce.", "Idealna obrona. Bogdan żąda rewanżu, do dwóch wygranych."],
          loss: ["Combo x12. Nawet nie zdążyłeś się ruszyć.", "To było jedno długie combo, a ty byłeś w środku."],
          draw: ["Remis. Czas minął, życia po równo.", "Podwójny nokaut. Bogdan jest wściekły."],
        },
      },
    },
    chat: {
      en: {
        start: ["Round one. Fight!", "Stretching... done. Let's go.", "Hope you know how to block."],
        capture: ["Hit!", "Combo x2!", "Counter hit!", ""],
        blunder: ["You dropped your guard!", "Punish!", "Whiff. My turn."],
        trouble: ["Low health. Comeback mode.", "Okay, okay, I'm in the corner.", "I need to land one clean hit."],
        brilliantMove: ["Reversal! Nice read.", "You parried that? Whoa."],
        win: ["K.O.!", "Flawless... well, almost flawless."],
        loss: ["GG. Run it back.", "You read me like a frame-data chart."],
        idle: ["*shadowboxing*", "Your move. I'm charging my super.", "Waiting for an opening...", ""],
        mirror: ["Mirror match! Same moves, who's faster?", "Me versus me. Finally a worthy opponent."],
        mirrorEnd: ["One of me landed the combo.", "Best of three!"],
      },
      pl: {
        start: ["Runda pierwsza. Walka!", "Rozciąganie... gotowe. Lecimy.", "Mam nadzieję, że umiesz blokować."],
        capture: ["Trafienie!", "Combo x2!", "Kontra!", ""],
        blunder: ["Opuściłeś gardę!", "Kara!", "Pudło. Teraz ja."],
        trouble: ["Mało życia. Tryb powrotu.", "Dobra, dobra, jestem w narożniku.", "Muszę wbić jeden czysty cios."],
        brilliantMove: ["Odwrócenie! Dobre czytanie.", "Sparowałeś to? Łoo."],
        win: ["K.O.!", "Bez skazy... no, prawie bez skazy."],
        loss: ["GG. Jeszcze raz.", "Czytałeś mnie jak tabelę klatek."],
        idle: ["*boksuje z cieniem*", "Twój ruch. Ładuję super.", "Czekam na otwarcie...", ""],
        mirror: ["Lustrzane starcie! Te same ruchy, kto szybszy?", "Ja kontra ja. Wreszcie godny rywal."],
        mirrorEnd: ["Któryś z nas wbił combo.", "Do dwóch wygranych!"],
      },
    },
  },
  {
    id: "mordax",
    name: "Mordax",
    rating: 2200,
    tint: "#7b4bc4",
    thinkDelay: 1300,
    // The final boss: deep and precise, though not an engine.
    style: { depth: 10, moveTimeMs: 1500, lines: 3, temperature: 20, randomMove: 0, ...NO_TASTE },
    text: {
      en: {
        short: "The final boss",
        description: "Waits at the top of the tower for the heroes who made it this far. Deep, precise and theatrical, with a monologue for every occasion and a second phase when things go badly.",
        greetings: ["So. You finally reached the top of my tower.", "Many heroes have climbed these stairs. None have climbed down.", "Kneel. Or play White. Your choice."],
        won: "Mordax won",
        over: "Mordax Won",
        quips: {
          win: ["The final boss falls. Roll the credits.", "Mordax swears this was only his first form."],
          loss: ["Game over. Continue?", "The tower claims another hero."],
          draw: ["A draw with the final boss. The ending is open.", "Mordax calls it a stalemate of destinies."],
        },
      },
      pl: {
        short: "Ostatni boss",
        description: "Czeka na szczycie wieży na bohaterów, którzy zaszli tak daleko. Głęboki, precyzyjny i teatralny: ma monolog na każdą okazję i drugą fazę, kiedy robi się źle.",
        greetings: ["A więc dotarłeś na szczyt mojej wieży.", "Wielu bohaterów weszło po tych schodach. Żaden nie zszedł.", "Klęknij. Albo graj białymi. Wybór należy do ciebie."],
        won: "Mordax wygrał",
        over: "Mordax wygrał",
        quips: {
          win: ["Ostatni boss pada. Puśćcie napisy końcowe.", "Mordax przysięga, że to była dopiero pierwsza forma."],
          loss: ["Koniec gry. Kontynuować?", "Wieża pochłania kolejnego bohatera."],
          draw: ["Remis z ostatnim bossem. Zakończenie otwarte.", "Mordax nazywa to patem przeznaczeń."],
        },
      },
    },
    chat: {
      en: {
        start: ["Let the final battle begin.", "You did well to get here. It ends now.", "Your journey ends at this board."],
        capture: ["Another piece for my collection.", "Fall.", "Kneel before me.", ""],
        blunder: ["Did you think I wouldn't notice?", "Foolish hero.", "This is why no one reaches the end."],
        trouble: ["This is only my first phase.", "Impossible! ...Very well. Phase two.", "You think you've won? My health bar has more segments."],
        brilliantMove: ["Interesting. You are no ordinary hero.", "At last, a worthy challenger."],
        win: ["As it was foretold.", "Game over, hero."],
        loss: ["No... this cannot be... the credits...", "Well played. The tower is yours. For now."],
        idle: ["*drums armoured fingers on the throne*", "Take all the time you need. I am eternal.", "The braziers burn on.", ""],
        mirror: ["Only I am worthy of facing me.", "Two dark lords. One throne."],
        mirrorEnd: ["The throne has its master.", "Again. Darkness is patient."],
      },
      pl: {
        start: ["Niech rozpocznie się ostatnia bitwa.", "Dobrze, że tu dotarłeś. Tu się wszystko kończy.", "Twoja podróż kończy się na tej planszy."],
        capture: ["Kolejna figura do mojej kolekcji.", "Padnij.", "Klęknij przede mną.", ""],
        blunder: ["Myślałeś, że nie zauważę?", "Głupi bohaterze.", "Dlatego nikt nie dochodzi do końca."],
        trouble: ["To dopiero moja pierwsza faza.", "Niemożliwe! ...Dobrze. Faza druga.", "Myślisz, że wygrałeś? Mój pasek życia ma więcej segmentów."],
        brilliantMove: ["Ciekawe. Nie jesteś zwykłym bohaterem.", "Wreszcie godny przeciwnik."],
        win: ["Tak było zapisane.", "Koniec gry, bohaterze."],
        loss: ["Nie... to niemożliwe... napisy końcowe...", "Dobrze zagrane. Wieża jest twoja. Na razie."],
        idle: ["*bębni pancernymi palcami o tron*", "Nie spiesz się. Jestem wieczny.", "Paleniska płoną dalej.", ""],
        mirror: ["Tylko ja jestem godny walki ze mną.", "Dwóch mrocznych władców. Jeden tron."],
        mirrorEnd: ["Tron ma swojego pana.", "Jeszcze raz. Ciemność jest cierpliwa."],
      },
    },
  },
];

export const STOCKFISH_TINT = "#3d424d";

/** The engine's own lines: dry, in its own protocol's words. */
const STOCKFISH_CHAT: { en: ChatMessages; pl: ChatMessages } = {
  en: {
    start: ["uciok.", "readyok.", "New game. Hash cleared."],
    capture: ["", "", "Material balance updated."],
    blunder: ["Evaluation jumped. Noted.", "That move lowers your score."],
    trouble: ["Evaluation unfavourable. Searching on.", "Hmm. Searching deeper."],
    brilliantMove: ["Unexpected move. Re-evaluating.", "That one was not in my main line."],
    win: ["Mate found.", "bestmove: the last one."],
    loss: ["Game over. Search terminated.", "GG. Logged."],
    idle: ["…", "Waiting for your move.", ""],
    mirror: ["Same engine on both sides. Let the search begin.", "position startpos. go."],
    mirrorEnd: ["One search went deeper.", "Game over. Both sides were me."],
  },
  pl: {
    start: ["uciok.", "readyok.", "Nowa partia. Tablica haszująca wyczyszczona."],
    capture: ["", "", "Bilans materiału zaktualizowany."],
    blunder: ["Ocena skoczyła. Odnotowano.", "Ten ruch obniża twoją ocenę."],
    trouble: ["Ocena niekorzystna. Szukam dalej.", "Hmm. Szukam głębiej."],
    brilliantMove: ["Nieoczekiwany ruch. Przeliczam.", "Tego nie było w mojej głównej linii."],
    win: ["Znaleziono mata.", "bestmove: ten ostatni."],
    loss: ["Koniec partii. Szukanie przerwane.", "GG. Zapisano w logu."],
    idle: ["…", "Czekam na twój ruch.", ""],
    mirror: ["Ten sam silnik po obu stronach. Zaczynamy szukanie.", "position startpos. go."],
    mirrorEnd: ["Jedno szukanie poszło głębiej.", "Koniec partii. Obie strony to byłem ja."],
  },
};

export const STOCKFISH_TEXT: { en: CharacterText; pl: CharacterText } = {
  en: {
    short: "Engine you configure",
    description: "Stockfish (GPL-3.0) running in your browser. You set its skill level (0–20), search depth and time per move.",
    greetings: ["uciok. Configure me below.", "Skill 20 is full strength. Good luck.", "isready? readyok."],
    won: "Stockfish won",
    over: "Stockfish Won",
    quips: {
      win: ["The search was deep enough.", "Stockfish does not gloat. It logs."],
      loss: ["You beat the engine. Screenshot this.", "Was the skill level low? Don't answer."],
      draw: ["A draw with Stockfish counts.", "Even the engine found nothing better."],
    },
  },
  pl: {
    short: "Silnik, który ustawiasz",
    description: "Stockfish (GPL-3.0) działający w przeglądarce. Sam ustawiasz poziom (0–20), głębokość i czas na ruch.",
    greetings: ["uciok. Ustaw mnie poniżej.", "Poziom 20 to pełna siła. Powodzenia.", "isready? readyok."],
    won: "Stockfish wygrał",
    over: "Stockfish wygrał",
    quips: {
      win: ["Wystarczyło szukać głęboko.", "Stockfish nie triumfuje. Zapisuje w logu."],
      loss: ["Pokonałeś silnik. Zrób zrzut ekranu.", "Poziom był niski? Nie odpowiadaj."],
      draw: ["Remis ze Stockfishem się liczy.", "Nawet silnik nie znalazł nic lepszego."],
    },
  },
};

function localized<T>(pair: { en: T; pl: T }): T {
  return getLocale() === "pl" ? pair.pl : pair.en;
}

/** The current language's text for a character, or for the engine. */
export function characterText(id: CharacterId | "stockfish"): CharacterText {
  if (id === "stockfish") return localized(STOCKFISH_TEXT);
  return localized([...CHARACTERS, ...CHAOS_CHARACTERS].find((character) => character.id === id)!.text);
}

export function characterBot(character: Character): BotDefinition {
  return {
    id: character.id,
    name: character.name,
    elo: character.rating,
    thinkDelay: character.thinkDelay,
    get chat() { return localized(character.chat); },
    avatarUrl: botAvatarUrl(character.id),
  };
}

export const stockfishBot: BotDefinition = {
  id: "stockfish",
  name: "Stockfish",
  elo: 3000,
  thinkDelay: 600,
  get chat() { return localized(STOCKFISH_CHAT); },
  avatarUrl: botAvatarUrl("stockfish"),
};
