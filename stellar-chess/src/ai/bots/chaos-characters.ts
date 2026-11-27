/**
 * The opponents of Chaos Chess: five fantasy classes who live for the cards (Sorceress, Chronomancer,
 * Warrior, Oracle, and the Arbiter of Chaos), painted in the cinematic style of the Chaos card art. Each plays chess
 * through the same persona machinery as the ladder (src/ai/persona.ts) and has a favourite kind of
 * card that it reaches for in the draft; Nox has none and always takes the card the engine rates best.
 *
 * Ratings are targets, as on the ladder: each rung searches shallower and chooses more loosely than
 * the one above it.
 */

import type { Character } from "./characters";
import type { ChaosEffectDefinition } from "@/engine/chaos";

export type ChaosCharacterId = "iskra" | "bruno" | "bolko" | "mira" | "nox";

export interface ChaosTaste {
  /** The category of cards it reaches for, or null for the engine's best card every time. */
  favorite: ChaosEffectDefinition["category"] | null;
  /** How often it takes a favourite-category card when one is offered (0–1). */
  loyalty: number;
}

export const CHAOS_TASTE: Record<ChaosCharacterId, ChaosTaste> = {
  iskra: { favorite: "arcane", loyalty: 0.75 },
  bruno: { favorite: "time", loyalty: 0.8 },
  bolko: { favorite: "battle", loyalty: 0.75 },
  mira: { favorite: "fate", loyalty: 0.7 },
  nox: { favorite: null, loyalty: 0 },
};

export const CHAOS_CHARACTERS: Character[] = [
  {
    id: "iskra",
    name: "Iskra",
    rating: 600,
    tint: "#8f6ae0",
    thinkDelay: 900,
    style: { depth: 3, moveTimeMs: 300, lines: 9, temperature: 180, randomMove: 0.18, captureBonus: 80, checkBonus: 60, queenBonus: 0, queenUntilPly: 0, pawnBonus: 0 },
    text: {
      en: {
        short: "The Sorceress",
        description: "The youngest of the mage circle, an obsidian knight floating over her palm. In Chaos she reaches for Arcane cards: moving pieces, summoning pawns and swapping everything around.",
        greetings: ["Watch the queen closely. She's about to vanish.", "The mage circle sent me for your pieces.", "A little magic never hurt anyone."],
        won: "Iskra won",
        over: "Iskra Wins!",
        quips: {
          win: ["Iskra takes a bow.", "The trick worked. Applause!"],
          loss: ["Iskra checks her sleeve for an ace. Nothing.", "Even the best trick fails sometimes."],
          draw: ["A draw. Iskra says that's an illusion too.", "Nobody vanished. A draw."],
        },
      },
      pl: {
        short: "Czarodziejka",
        description: "Najmłodsza w kręgu magów, z obsydianowym skoczkiem nad dłonią. W Chaosie sięga po karty Magii: przenosi figury, przyzywa piony i zamienia wszystko miejscami.",
        greetings: ["Patrz uważnie na hetmana. Zaraz zniknie.", "Krąg magów przysłał mnie po twoje figury.", "Odrobina magii jeszcze nikomu nie zaszkodziła."],
        won: "Iskra wygrała",
        over: "Iskra wygrała!",
        quips: {
          win: ["Iskra kłania się publiczności.", "Sztuczka się udała. Brawa!"],
          loss: ["Iskra szuka asa w rękawie. Nie ma.", "Nawet najlepszy trik czasem nie wychodzi."],
          draw: ["Remis. Iskra mówi, że to też iluzja.", "Nikt nie zniknął. Remis."],
        },
      },
    },
    chat: {
      en: {
        start: ["Cards shuffled. Let's go!", "Hocus pocus, first move!", "Careful, this game has a false bottom."],
        capture: ["Abracadabra, gone!", "Vanished!", "Ta-da!", ""],
        blunder: ["Oops, that was too easy.", "That piece was standing in the spotlight.", "Thanks for the assist!"],
        trouble: ["That wasn't supposed to vanish…", "Hmm, where's my knight?", "Relax, I've still got a card up my sleeve."],
        brilliantMove: ["Nice trick!", "Hey, who taught you that?"],
        win: ["And that's the grand finale!", "Thank you, thank you!"],
        loss: ["Fine, this time the trick was yours.", "Rematch? I've got a new trick."],
        idle: ["Shuffle, shuffle…", "Pick a move, any move.", "I love the moment before the trick.", ""],
        mirror: ["A mirror! My favourite illusion.", "Which one of us is real?"],
        mirrorEnd: ["The illusion is over.", "We both take a bow!"],
        card: ["Let the magic work.", "This card is mine!", "The mage circle would smile."],
      },
      pl: {
        start: ["Karty potasowane. Zaczynamy!", "Hokus-pokus, pierwszy ruch!", "Uwaga, ta partia ma podwójne dno."],
        capture: ["Abrakadabra, nie ma!", "Znikło!", "Tadaam!", ""],
        blunder: ["Ojej, to było za łatwe.", "Ta figura stała jak na scenie.", "Dzięki za asystę!"],
        trouble: ["To nie tak miało zniknąć…", "Hmm, gdzie mój skoczek?", "Spokojnie, mam jeszcze kartę w rękawie."],
        brilliantMove: ["To był niezły trik!", "Hej, kto cię tego nauczył?"],
        win: ["I to jest finał przedstawienia!", "Brawa, brawa, dziękuję!"],
        loss: ["Dobra, tym razem trik był twój.", "Rewanż? Mam nową sztuczkę."],
        idle: ["Tasuję, tasuję…", "Wybierz ruch, dowolny ruch.", "Lubię ten moment przed sztuczką.", ""],
        mirror: ["Lustro! Moja ulubiona iluzja.", "Która z nas jest prawdziwa?"],
        mirrorEnd: ["Iluzja się skończyła.", "Obie się kłaniamy!"],
        card: ["Niech zadziała magia.", "Ta karta jest moja!", "Krąg magów by się uśmiechnął."],
      },
    },
  },
  {
    id: "bruno",
    name: "Bruno",
    rating: 950,
    tint: "#3d8fd6",
    thinkDelay: 500,
    style: { depth: 4, moveTimeMs: 350, lines: 7, temperature: 110, randomMove: 0.08, captureBonus: 40, checkBonus: 40, queenBonus: 0, queenUntilPly: 0, pawnBonus: 0 },
    text: {
      en: {
        short: "The Chronomancer",
        description: "Counts time in grains of starlight sand and hates to see it wasted. In Chaos he takes Time cards and plays to run you out of yours.",
        greetings: ["Tick-tock. We start on time.", "I trust the clock is set.", "Every second counts. Yours too."],
        won: "Bruno won",
        over: "Bruno Wins!",
        quips: {
          win: ["Bruno checks the time. Satisfied.", "Right to the second, like clockwork."],
          loss: ["Bruno winds his watch. Until next time.", "Even the best movement stops sometimes."],
          draw: ["A draw. Both hands in the same place.", "Bruno notes it down: a draw, good timing."],
        },
      },
      pl: {
        short: "Kronomanta",
        description: "Liczy czas w ziarnach gwiezdnego piasku i nie znosi, gdy ktoś go marnuje. W Chaosie bierze karty Czasu i gra tak, żeby tobie go zabrakło.",
        greetings: ["Tik-tak. Zaczynamy punktualnie.", "Mam nadzieję, że zegar jest nastawiony.", "Każda sekunda się liczy. Twoja też."],
        won: "Bruno wygrał",
        over: "Bruno wygrał!",
        quips: {
          win: ["Bruno sprawdza godzinę. Zadowolony.", "Co do sekundy, jak w szwajcarskim zegarku."],
          loss: ["Bruno nakręca zegarek. Do następnego razu.", "Nawet najlepszy mechanizm czasem staje."],
          draw: ["Remis. Obie wskazówki w tym samym miejscu.", "Bruno notuje: remis, czas dobry."],
        },
      },
    },
    chat: {
      en: {
        start: ["The clock is running. After you.", "Tick-tock, tick-tock.", "Let's not waste time."],
        capture: ["Precise.", "A gear in its place.", "Tick.", ""],
        blunder: ["Haste is a poor advisor.", "That move was a second late.", "Ah, too quick."],
        trouble: ["Something's off in the movement.", "Hmm, I'll have to take this apart.", "I hate it when things run late."],
        brilliantMove: ["Swiss workmanship!", "Precision worthy of a watchmaker."],
        win: ["Right on time at the finish.", "The movement runs flawlessly."],
        loss: ["My clock must have been slow.", "Well played. Tick-tock, rematch soon."],
        idle: ["Tick-tock.", "Time flows…", "Hear that? That's your clock.", ""],
        mirror: ["Two identical movements.", "Which one keeps better time?"],
        mirrorEnd: ["One clock ran late.", "A result to the second."],
        card: ["Buying a little time.", "The hourglass is on my side.", "Time is the best card."],
      },
      pl: {
        start: ["Zegar ruszył. Proszę.", "Tik-tak, tik-tak.", "Nie marnujmy czasu."],
        capture: ["Precyzyjnie.", "Trybik na miejscu.", "Tik.", ""],
        blunder: ["Pośpiech to zły doradca.", "Ten ruch spóźnił się o sekundę.", "Ach, zbyt szybko."],
        trouble: ["Coś mi tu nie gra w mechanizmie.", "Hmm, trzeba to rozebrać na części.", "Nie lubię, jak coś się spóźnia."],
        brilliantMove: ["Szwajcarska robota!", "Precyzja godna zegarmistrza."],
        win: ["Punktualnie do mety.", "Mechanizm działa bez zarzutu."],
        loss: ["Mój zegar musiał się spóźnić.", "Dobrze rozegrane. Tik-tak, do rewanżu."],
        idle: ["Tik-tak.", "Czas płynie…", "Słyszysz? To twój zegar.", ""],
        mirror: ["Dwa identyczne mechanizmy.", "Który chodzi dokładniej?"],
        mirrorEnd: ["Jeden zegar się spóźnił.", "Wynik co do sekundy."],
        card: ["Kupuję trochę czasu.", "Klepsydra po mojej stronie.", "Czas jest najlepszą kartą."],
      },
    },
  },
  {
    id: "bolko",
    name: "Bolko",
    rating: 1300,
    tint: "#c75a2f",
    thinkDelay: 1000,
    style: { depth: 5, moveTimeMs: 550, lines: 6, temperature: 80, randomMove: 0.04, captureBonus: 120, checkBonus: 30, queenBonus: 0, queenUntilPly: 0, pawnBonus: 0 },
    text: {
      en: {
        short: "The Warrior",
        description: "A war-smith in obsidian armour with a big laugh and an even bigger hammer. In Chaos he takes Battle cards: forging pawns into rooks and rewarding every capture.",
        greetings: ["Ha! The forge is hot, sit down.", "I like games where sparks fly.", "Every pawn is raw steel."],
        won: "Bolko won",
        over: "Bolko Wins!",
        quips: {
          win: ["Bolko strikes the anvil. Victory!", "Forged while hot."],
          loss: ["Bolko cools the steel. And his head.", "Even the best steel cracks sometimes."],
          draw: ["A draw. Bolko says the steel hasn't cooled yet.", "Two shields, no wounds. A draw."],
        },
      },
      pl: {
        short: "Wojownik",
        description: "Kowal wojny w obsydianowej zbroi, z wielkim śmiechem i jeszcze większym młotem. W Chaosie sięga po karty Walki: przekuwa piony w wieże i nagradza każde bicie.",
        greetings: ["Ha! Kuźnia rozgrzana, siadaj.", "Lubię partie, w których lecą iskry.", "Każdy pionek to surowa stal."],
        won: "Bolko wygrał",
        over: "Bolko wygrał!",
        quips: {
          win: ["Bolko wali młotem w kowadło. Zwycięstwo!", "Wykute na gorąco."],
          loss: ["Bolko studzi stal. I głowę.", "Nawet najlepsza stal czasem pęka."],
          draw: ["Remis. Bolko mówi, że stal jeszcze nie ostygła.", "Dwie tarcze, zero ran. Remis."],
        },
      },
    },
    chat: {
      en: {
        start: ["Let's get to work!", "Firing up the forge!", "Ha! Let's see who tempers better."],
        capture: ["Bang!", "Onto the anvil!", "Ha! Scrap!", ""],
        blunder: ["Ha! Soft steel.", "That move cracked under the blow.", "Thanks for the material!"],
        trouble: ["Ow, hot!", "Hey, that was my best rook!", "Need more coal in the furnace."],
        brilliantMove: ["Ha! A strong blow!", "That was cold-forged. Respect."],
        win: ["Done! Forged!", "Ha! The anvil never lies!"],
        loss: ["Good blow. Next time a heavier hammer.", "Ha! Lost, but it was hot."],
        idle: ["Pumping the bellows…", "Sparks flying…", "Ha!", ""],
        mirror: ["Two smiths at one fire!", "Ha! Who strikes harder?"],
        mirrorEnd: ["One hammer was heavier.", "Ha! What a forging!"],
        card: ["To the forge!", "I'll forge something strong.", "Ha! This card has weight."],
      },
      pl: {
        start: ["Do roboty!", "Rozpalam palenisko!", "Ha! Zobaczymy, kto lepiej się hartuje."],
        capture: ["Bach!", "Na kowadło z nim!", "Ha! Złom!", ""],
        blunder: ["Ha! Miękka stal.", "Ten ruch pękł od uderzenia.", "Dzięki za materiał!"],
        trouble: ["Au, gorące!", "Ej, to była moja najlepsza wieża!", "Trzeba dorzucić do pieca."],
        brilliantMove: ["Ha! Mocny cios!", "To było kute na zimno. Szacunek."],
        win: ["Gotowe! Wykute!", "Ha! Kowadło nie kłamie!"],
        loss: ["Dobry cios. Następnym razem wezmę cięższy młot.", "Ha! Przegrałem, ale było gorąco."],
        idle: ["Dmucham w miech…", "Iskry lecą…", "Ha!", ""],
        mirror: ["Dwóch kowali przy jednym ogniu!", "Ha! Kto mocniej uderzy?"],
        mirrorEnd: ["Jeden młot był cięższy.", "Ha! Ale się kuło!"],
        card: ["Do kuźni!", "Wykuję coś mocnego.", "Ha! Ta karta ma ciężar."],
      },
    },
  },
  {
    id: "mira",
    name: "Mira",
    rating: 1650,
    tint: "#b8901f",
    thinkDelay: 1400,
    style: { depth: 6, moveTimeMs: 800, lines: 5, temperature: 55, randomMove: 0.02, captureBonus: 0, checkBonus: 20, queenBonus: 0, queenUntilPly: 0, pawnBonus: 0 },
    text: {
      en: {
        short: "The Oracle",
        description: "Sees the future in a single card and claims she already knows your next move. In Chaos she picks Fate cards: bringing lost pieces back and taking a gamble.",
        greetings: ["I see… I see your first move.", "The cards say this will be interesting.", "Fate is already dealt. Almost."],
        won: "Mira won",
        over: "Mira Wins!",
        quips: {
          win: ["Mira says she knew all along.", "The cards never lie."],
          loss: ["Mira shuffles the deck again.", "The cards didn't foresee that."],
          draw: ["A draw. Mira claims it was written too.", "Fate hesitated."],
        },
      },
      pl: {
        short: "Wyrocznia",
        description: "Widzi przyszłość w jednej karcie i twierdzi, że twój następny ruch już zna. W Chaosie wybiera karty Losu: przywraca stracone figury i lubi zaryzykować.",
        greetings: ["Widzę… widzę twój pierwszy ruch.", "Karty mówią, że będzie ciekawie.", "Los już jest rozdany. Prawie."],
        won: "Mira wygrała",
        over: "Mira wygrała!",
        quips: {
          win: ["Mira mówi, że wiedziała od początku.", "Karty nie kłamią."],
          loss: ["Mira tasuje talię jeszcze raz.", "Tego karty nie przewidziały."],
          draw: ["Remis. Mira twierdzi, że to też było zapisane.", "Los się zawahał."],
        },
      },
    },
    chat: {
      en: {
        start: ["Destiny awaits.", "Show me your palm… I mean, your move.", "The stars favour Black. Or White."],
        capture: ["It was written.", "Fate wished it so.", "Mmm.", ""],
        blunder: ["I expected that.", "The cards warned me, not you.", "Destiny can be cruel."],
        trouble: ["Hmm, that wasn't in the cards.", "Mist veils the future…", "I need to reshuffle."],
        brilliantMove: ["Even I didn't foresee that!", "Your star shines today."],
        win: ["All has come to pass.", "I told you. The cards never lie."],
        loss: ["Your star shone brighter.", "Fate turned. Until next time."],
        idle: ["I see… mist.", "The cards are silent.", "Patience, the future will come.", ""],
        mirror: ["Two seers, one future.", "Which of us sees further?"],
        mirrorEnd: ["The prophecy came half true.", "Fate chose one of us."],
        card: ["This card was meant for me.", "I'll trust fate.", "Let's flip a coin…"],
      },
      pl: {
        start: ["Przeznaczenie czeka.", "Pokaż mi dłoń… to znaczy ruch.", "Gwiazdy sprzyjają czarnym. Albo białym."],
        capture: ["Tak było pisane.", "Los tak chciał.", "Mmm.", ""],
        blunder: ["Tego się spodziewałam.", "Karty ostrzegły mnie, nie ciebie.", "Przeznaczenie bywa okrutne."],
        trouble: ["Hmm, tego nie było w kartach.", "Mgła zasłania przyszłość…", "Muszę przetasować."],
        brilliantMove: ["Tego nawet ja nie przewidziałam!", "Masz dziś dobrą gwiazdę."],
        win: ["Wszystko się wypełniło.", "Mówiłam. Karty nie kłamią."],
        loss: ["Twoja gwiazda świeciła jaśniej.", "Los się odwrócił. Do następnego razu."],
        idle: ["Widzę… mgłę.", "Karty milczą.", "Cierpliwości, przyszłość nadejdzie.", ""],
        mirror: ["Dwie wróżki, jedna przyszłość.", "Która z nas widzi dalej?"],
        mirrorEnd: ["Przepowiednia spełniła się w połowie.", "Los wybrał jedną z nas."],
        card: ["Ta karta była mi pisana.", "Zaufam losowi.", "Rzućmy monetą…"],
      },
    },
  },
  {
    id: "nox",
    name: "Nox",
    rating: 2000,
    tint: "#4b3a78",
    thinkDelay: 1200,
    style: { depth: 8, moveTimeMs: 1200, lines: 3, temperature: 28, randomMove: 0, captureBonus: 0, checkBonus: 0, queenBonus: 0, queenUntilPly: 0, pawnBonus: 0 },
    text: {
      en: {
        short: "The Arbiter of Chaos",
        description: "Nobody has seen the face behind the obsidian mask. Nox has dealt the cards of fate forever and always takes the one that hurts most. The hardest opponent in Chaos.",
        greetings: ["The cards are dealt. Please, take a seat.", "Everything is at stake. As always.", "The house always wins. Almost always."],
        won: "Nox won",
        over: "Nox Wins!",
        quips: {
          win: ["The house wins.", "Nox gathers the cards without a word."],
          loss: ["Nox gives a slight bow. A rare sight.", "This time the bank is broken."],
          draw: ["A draw. Nox keeps shuffling.", "Nobody takes the pot."],
        },
      },
      pl: {
        short: "Arbiter Chaosu",
        description: "Nikt nie widział twarzy spod obsydianowej maski. Nox rozdaje karty losu od zawsze i zawsze bierze tę, która zaboli najbardziej. Najtrudniejszy rywal Chaosu.",
        greetings: ["Karty rozdane. Proszę zająć miejsce.", "Stawką jest wszystko. Jak zawsze.", "Dom zawsze wygrywa. Prawie zawsze."],
        won: "Wygrywa Nox",
        over: "Nox wygrywa!",
        quips: {
          win: ["Dom wygrywa.", "Nox zbiera karty bez słowa."],
          loss: ["Nox lekko się kłania. Rzadki widok.", "Tym razem bank rozbity."],
          draw: ["Remis. Nox tasuje dalej.", "Nikt nie zgarnia puli."],
        },
      },
    },
    chat: {
      en: {
        start: ["Let's begin.", "Please. Your move.", "First hand."],
        capture: ["My pot.", "Thank you.", "Mm.", ""],
        blunder: ["A costly mistake.", "The house thanks you.", "It happens. Often."],
        trouble: ["Interesting.", "Hm. A risky game.", "High stakes."],
        brilliantMove: ["Impressive.", "Worthy of the high-stakes table."],
        win: ["Game over. The house wins.", "Thank you for the game."],
        loss: ["Congratulations. The bank is broken.", "That rarely happens. Well done."],
        idle: ["…", "I'm waiting.", "Take your time. The cards will wait.", ""],
        mirror: ["The same dealer twice.", "I wonder who holds better cards."],
        mirrorEnd: ["The house won. And lost.", "A draw would have been more elegant."],
        card: ["This one.", "The best card on the table.", "I'll draw."],
      },
      pl: {
        start: ["Zaczynamy.", "Proszę. Twój ruch.", "Rozdanie pierwsze."],
        capture: ["Pula moja.", "Dziękuję.", "Mm.", ""],
        blunder: ["Kosztowny błąd.", "Dom dziękuje.", "To się zdarza. Często."],
        trouble: ["Interesujące.", "Hm. Ryzykowna gra.", "Wysoka stawka."],
        brilliantMove: ["Imponujące.", "Godne stołu wysokich stawek."],
        win: ["Gra skończona. Dom wygrywa.", "Dziękuję za grę."],
        loss: ["Gratuluję. Bank rozbity.", "Rzadko się to zdarza. Brawo."],
        idle: ["…", "Czekam.", "Spokojnie. Karty poczekają.", ""],
        mirror: ["Dwa razy ten sam krupier.", "Ciekawe, kto ma lepsze karty."],
        mirrorEnd: ["Dom wygrał. I przegrał.", "Remis byłby elegantszy."],
        card: ["Ta.", "Najlepsza karta na stole.", "Dobieram."],
      },
    },
  },
];
