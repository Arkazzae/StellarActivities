/**
 * Polish and English. The language follows the player's Stellarr interface (`session.locale`):
 * Polish for `pl*`, English for everything else. Each player sees the game in their own
 * language; the room only stores ids, names and numbers, never sentences.
 */

export type Lang = "pl" | "en";

export const langOf = (locale: string | null | undefined): Lang => ((locale ?? "").toLowerCase().startsWith("pl") ? "pl" : "en");

/** Every sentence of the game: [Polish, English]. `{name}` marks a parameter. */
const S = {
  // ------------------------------------------------------------ common
  connecting: ["Łączenie z pokojem…", "Reconnecting to the room…"],
  watching: ["Oglądasz tę grę. Zagrasz w następnej.", "You're watching this game. You'll play in the next one."],
  left: ["zostało", "left"],
  timerAria: ["Zostało {n} s", "{n} s left"],
  loadingGif: ["Ładowanie GIF-a", "Loading GIF"],
  gifDeclinedShort: ["GIF-y masz wyłączone w prywatności", "GIFs are off in your privacy settings"],
  gifFailed: ["Nie da się pokazać GIF-a", "This GIF can't be shown"],
  round: ["Runda {n} z {total}", "Round {n} of {total}"],
  nOfM: ["{n} z {total}", "{n} of {total}"],
  "phase.topic": ["wybór tematu", "pick a topic"],
  "phase.gif": ["wybór GIF-a", "pick a GIF"],
  "phase.search": ["szukasz GIF-a", "find a GIF"],
  "phase.othersSearch": ["inni szukają", "the others are searching"],
  "phase.caption": ["piszesz napis", "write a caption"],
  "phase.vote": ["głosowanie", "voting"],
  "phase.directorVote": ["wybór reżysera", "the director's pick"],
  "phase.results": ["wynik", "results"],
  and: ["i", "and"],
  pts: ["pkt", "pts"],
  you: ["ty", "you"],

  endGame: ["Zakończ grę", "End game"],
  endConfirm: ["Zakończyć grę teraz? Punkty zostaną takie, jak są, a niedokończona runda się nie liczy.", "End the game now? The scores stay as they are, and an unfinished round doesn't count."],
  endNow: ["Zakończ", "End it"],
  keepPlaying: ["Gramy dalej", "Keep playing"],

  // ------------------------------------------------------------ lobby
  hostIs: ["Prowadzi {name}", "Host: {name}"],
  lobbyTitle: ["Temat pada, wy odpowiadacie GIF-em", "A topic drops, you answer with a GIF"],
  step1Title: ["Głosujecie na temat", "Vote on a topic"],
  step1Text: ["Dwa do wyboru. Czasem o kimś z kanału.", "Two to choose from. Sometimes about someone in the channel."],
  step2Title: ["Każdy szuka GIF-a", "Everyone finds a GIF"],
  step2Text: ["Kilkadziesiąt sekund na reakcję, która pasuje najlepiej.", "Under a minute to find the reaction that fits best."],
  step3Title: ["Pokaz, naklejki, głosy", "Show, stickers, votes"],
  step3Text: ["Rzucacie naklejki na żywo, potem głos na najlepszy mem.", "Throw stickers live, then vote for the best meme."],
  lobbyNote: ["Na swój mem nie da się zagłosować. Grają od {min} do {max} osób.", "You can't vote for your own meme. {min} to {max} players."],
  playersInChannel: ["Gracze z kanału: {n} z {max}", "Players in the channel: {n} of {max}"],
  roleHost: ["prowadzi", "host"],
  rolePlayer: ["gra", "playing"],
  free: ["wolne", "free"],
  watchingList: ["Ogląda: {names}", "Watching: {names}"],
  settings: ["Ustawienia", "Settings"],
  hostOnly: ["Tylko prowadzący", "Host only"],
  setBy: ["Ustawia {name}", "{name} sets these"],
  theHost: ["prowadzący", "the host"],
  mode: ["Tryb", "Mode"],
  rounds: ["Rundy", "Rounds"],
  timeToFind: ["Czas na GIF", "Time to find"],
  topics: ["Tematy", "Topics"],
  namesInTopics: ["Imiona graczy w tematach", "Player names in topics"],
  "mode.klasyk": ["Klasyk", "Classic"],
  "mode.klasyk.desc": ["Wszyscy szukają", "Everyone searches"],
  "mode.zakaz": ["Zakaz słów", "Banned words"],
  "mode.zakaz.desc": ["Bez słów z tematu", "No words from the topic"],
  "mode.rezyser": ["Reżyser", "Director"],
  "mode.rezyser.desc": ["Jedna osoba wybiera", "One person picks"],
  "mode.napisy": ["Napisy", "Captions"],
  "mode.napisy.desc": ["Ten sam GIF, wasz tekst", "Same GIF, your caption"],
  soon: ["wkrótce", "soon"],
  "pack.mix": ["Mieszanka", "Mix"],
  "pack.codziennosc": ["Codzienność", "Everyday life"],
  "pack.praca": ["Praca i szkoła", "Work and school"],
  "pack.internet": ["Internet", "Online"],
  "pack.imprezy": ["Imprezy i wyjścia", "Parties and nights out"],
  noGifsInstance: ["Ta instancja Stellarr nie ma włączonych GIF-ów. Właściciel włącza je kluczem GIPHY w Cockpicie.", "This Stellarr instance has no GIFs. The owner turns them on with a GIPHY key in Cockpit."],
  gifsDeclined: ["GIF-y masz wyłączone w ustawieniach prywatności Stellarr. Włącz je, żeby grać.", "GIFs are off in your Stellarr privacy settings. Turn them on to play."],
  noGifsButton: ["Bez GIF-ów nie zagramy", "Can't play without GIFs"],
  start: ["Zaczynamy", "Let's play"],
  waitingPlayers: ["Czekamy na graczy ({n} z {min})", "Waiting for players ({n} of {min})"],
  waitingHost: ["Czekamy, aż {name} zacznie", "Waiting for {name} to start"],
  estimate: ["{people}, {rounds}, około {min} min", "{people}, {rounds}, about {min} min"],

  // ------------------------------------------------------------ topic vote
  whichTopic: ["Który temat gramy?", "Which topic do we play?"],
  whichGif: ["Który GIF podpisujemy?", "Which GIF do we caption?"],
  directorPickTopic: ["Jesteś reżyserem. Wybierz temat rundy", "You're the director. Pick this round's topic"],
  directorPicksTopic: ["Temat wybiera reżyser: {name}", "The director picks the topic: {name}"],
  noteDirector: ["Reżyser wybiera temat i zwycięzcę rundy, sam nie szuka GIF-a. Za wybrany mem są 3 punkty.", "The director picks the topic and the winner, and doesn't search. The chosen meme gets 3 points."],
  noteCaptions: ["Każdy dopisze swój napis do wybranego GIF-a. Zagłosowali: {n} z {total}.", "Everyone writes a caption for the chosen GIF. Voted: {n} of {total}."],
  noteVotes: ["Zagłosowali: {n} z {total}. Remis rozstrzyga los.", "Voted: {n} of {total}. A tie is settled by chance."],
  yourVote: ["Twój głos", "Your vote"],
  choose: ["Wybierz", "Pick"],
  drawingGifs: ["Losuję GIF-y…", "Picking GIFs…"],
  gifN: ["GIF {n}", "GIF {n}"],

  // ------------------------------------------------------------ search
  topicOfRound: ["Temat rundy", "This round's topic"],
  topicDirector: ["Temat rundy. Zwycięzcę wybierze reżyser: {name}", "This round's topic. The director picks the winner: {name}"],
  searchLabel: ["Szukaj GIF-a", "Search for a GIF"],
  clear: ["Wyczyść", "Clear"],
  bannedLabel: ["Nie wolno szukać:", "Not allowed:"],
  bannedHit: ["„{word}” jest w temacie. Spróbuj innym słowem.", "“{word}” is in the topic. Try another word."],
  tryLabel: ["Spróbuj:", "Try:"],
  quick: ["szok|taniec|facepalm|płacz|brawo|nie", "shock|dance|facepalm|crying|applause|nope"],
  nothingFound: ["Nic nie znaleziono. Spróbuj innego słowa.", "Nothing found. Try another word."],
  more: ["Pokaż więcej", "Show more"],
  searching: ["Szukam…", "Searching…"],
  yourMeme: ["Twój mem", "Your meme"],
  authorHidden: ["autor ukryty do wyników", "author hidden until results"],
  authorHiddenLong: ["Autor ukryty do wyników", "Author hidden until results"],
  pickFromResults: ["Wybierz GIF-a z wyników", "Pick a GIF from the results"],
  sentChange: ["Wysłane. Możesz jeszcze zmienić", "Sent. You can still change it"],
  send: ["Wyślij", "Send"],
  sendInstead: ["Wyślij ten zamiast", "Send this one instead"],
  sendChanged: ["Wyślij zmieniony", "Send the new one"],
  ready: ["Gotowe: {n} z {total}", "Ready: {n} of {total}"],
  picked: ["Wybrany", "Picked"],
  sentTag: ["Wysłany", "Sent"],
  directorWait: ["W tej rundzie jesteś reżyserem. Inni szukają GIF-ów, a po pokazie wybierzesz zwycięzcę. Za wybrany mem są 3 punkty.", "You're the director this round. The others search for GIFs, and after the show you pick the winner. The chosen meme gets 3 points."],
  problemDeclined: ["GIF-y masz wyłączone w ustawieniach prywatności Stellarr. Włącz je, żeby szukać i widzieć memy.", "GIFs are off in your Stellarr privacy settings. Turn them on to search and see the memes."],
  problemPermission: ["Ta wersja gry nie ma dostępu do GIF-ów.", "This version of the game has no access to GIFs."],
  rateLimited: ["Za dużo wyszukiwań naraz. Chwila przerwy i jeszcze raz.", "Too many searches at once. Take a breath and try again."],
  searchFailed: ["Nie udało się wyszukać GIF-ów.", "Couldn't search for GIFs."],
  generic: ["Coś poszło nie tak.", "Something went wrong."],

  // ------------------------------------------------------------ captions
  gifOfRound: ["GIF rundy, ten sam dla wszystkich", "This round's GIF, the same for everyone"],
  gifOfRoundShort: ["GIF rundy", "This round's GIF"],
  yourCaption: ["Twój napis", "Your caption"],
  captionPlaceholder: ["Kiedy…", "When…"],

  // ------------------------------------------------------------ reveal
  show: ["Pokaz {n} z {total}", "Show {n} of {total}"],
  nextIn: ["Następny za {n} s", "Next in {n} s"],
  voteIn: ["Głosowanie za {n} s", "Voting in {n} s"],
  throwSticker: ["Rzuć naklejkę", "Throw a sticker"],
  stickerAria: ["Naklejka {name} (klawisz {key}), rzucona {n} razy", "Sticker {name} (key {key}), thrown {n} times"],

  // ------------------------------------------------------------ vote
  whichWins: ["Który mem wygrywa?", "Which meme wins?"],
  pickWinner: ["Wybierz zwycięzcę rundy", "Pick this round's winner"],
  directorPicksWinner: ["Zwycięzcę wybiera reżyser: {name}", "The director picks the winner: {name}"],
  voted: ["Zagłosowali: {n} z {total}", "Voted: {n} of {total}"],
  vote: ["Głosuj", "Vote"],
  pickThis: ["Wybieram ten", "Pick this one"],
  yourMemeBtn: ["Twój mem", "Your meme"],
  yourCaptionBtn: ["Twój napis", "Your caption"],
  waitDirector: ["czeka na reżysera", "waiting for the director"],
  watchingShort: ["oglądasz", "watching"],

  // ------------------------------------------------------------ results
  endIn: ["Koniec gry za {n} s", "Game ends in {n} s"],
  nextRoundIn: ["Następna runda za {n} s", "Next round in {n} s"],
  winningMeme: ["zwycięski mem", "winning meme"],
  nobodySent: ["Nikt nie wysłał GIF-a", "Nobody sent a GIF"],
  nobodyVoted: ["Nikt nie dostał głosu", "Nobody got a vote"],
  directorPicks: ["Reżyser {name} wybiera", "Director {name} picks"],
  tie: ["Remis, rundę biorą", "It's a tie, the round goes to"],
  roundTo: ["Rundę bierze", "The round goes to"],
  votedBy: ["Głosowali:", "Voted:"],
  streak: ["Seria: {wins} z rzędu", "On a roll: {wins} in a row"],
  table: ["Tabela", "Scoreboard"],
  roundCol: ["runda", "round"],
  totalCol: ["razem", "total"],
  none: ["brak", "none"],

  // ------------------------------------------------------------ final
  gameOver: ["Koniec gry", "Game over"],
  prizes: ["Nagrody z tej gry", "Awards"],
  noPrizes: ["Za krótka gra na nagrody. Jeszcze jedna?", "Too short a game for awards. One more?"],
  winnersStrip: ["Zwycięskie memy rund", "Winning memes"],
  roundN: ["Runda {n}", "Round {n}"],
  backToLobby: ["Wróć do lobby", "Back to the lobby"],
  again: ["Jeszcze raz", "Play again"],
  waitDecide: ["Czekamy, aż {name} zdecyduje", "Waiting for {name} to decide"],
  "award.streak": ["Seria", "On a roll"],
  "award.best": ["Pełna sala", "Full house"],
  "award.fast": ["Najszybszy palec", "Fastest finger"],
  "award.quiet": ["Cisza na sali", "Tough crowd"],
  "award.streak.fact": ["{n} z rzędu.", "{n} in a row."],
  "award.best.fact": ["{n} na jeden mem w rundzie {round}.", "{n} for one meme in round {round}."],
  "award.fast.fact": ["Średnio {n} s od tematu do wysłania.", "{n} s on average from topic to send."],
  "award.quiet.fact": ["{n} bez głosu. Następnym razem.", "{n} without a vote. Next time."],

  // ------------------------------------------------------------ refusals from the host (codes)
  "err.settingsLocked": ["Ustawienia zmienia się przed grą.", "Settings change before the game."],
  "err.hostOnlySettings": ["Ustawienia zmienia prowadzący.", "Only the host changes the settings."],
  "err.alreadyPlaying": ["Gra już trwa.", "The game is already on."],
  "err.hostOnlyStart": ["Grę zaczyna prowadzący.", "Only the host starts the game."],
  "err.notEnoughPlayers": ["Potrzeba co najmniej 3 osób.", "You need at least 3 players."],
  "err.hostOnlyLobby": ["Do lobby wraca prowadzący.", "Only the host goes back to the lobby."],
  "err.topicClosed": ["Temat jest już wybrany.", "The topic is already chosen."],
  "err.spectator": ["Oglądasz tę grę.", "You're watching this game."],
  "err.noSuchTopic": ["Nie ma takiego tematu.", "There's no such topic."],
  "err.directorPicksTopic": ["Temat wybiera reżyser.", "The director picks the topic."],
  "err.notAGif": ["To nie jest GIF.", "That's not a GIF."],
  "err.searchOver": ["Czas na szukanie minął.", "Time to find a GIF is up."],
  "err.directorDoesntSearch": ["W tej rundzie jesteś reżyserem: wybierasz, nie szukasz.", "You're the director this round: you pick, you don't search."],
  "err.captionsOnly": ["W Napisach piszecie tekst pod wspólnym GIF-em.", "In Captions you write text for the shared GIF."],
  "err.writingOver": ["Czas na pisanie minął.", "Time to write is up."],
  "err.emptyCaption": ["Napisz coś pod GIF-em.", "Write something for the GIF."],
  "err.hostOnlyGifs": ["GIF-y rundy losuje prowadzący.", "The host picks the round's GIFs."],
  "err.noGifs": ["Brak GIF-ów do wyboru.", "No GIFs to choose from."],
  "err.voteOver": ["Głosowanie się skończyło.", "Voting is over."],
  "err.directorPicksWinner": ["Zwycięzcę wybiera reżyser.", "The director picks the winner."],
  "err.noSuchMeme": ["Nie ma takiego mema.", "There's no such meme."],
  "err.ownMeme": ["Na swój mem nie można głosować.", "You can't vote for your own meme."],
  "err.notPlaying": ["Gra się nie toczy.", "No game is running."],
  "err.hostOnlyEnd": ["Grę kończy prowadzący.", "Only the host ends the game."],
} as const satisfies Record<string, readonly [string, string]>;

export type Key = keyof typeof S;

export function translate(lang: Lang, key: Key, params: Record<string, string | number> = {}): string {
  const text: string = S[key][lang === "pl" ? 0 : 1];
  return text.replace(/\{(\w+)\}/g, (all, name: string) => (name in params ? String(params[name]) : all));
}

type ErrorCode = Key extends `err.${infer C}` ? C : never;

/** Whether a refusal message from the host is one of our codes. */
export const isErrorCode = (code: string): code is ErrorCode => `err.${code}` in S;

/** Counted nouns: Polish has three forms (1, 2–4, 5+), English two. */
const NOUNS = {
  people: [["osoba", "osoby", "osób"], ["player", "players"]],
  rounds: [["runda", "rundy", "rund"], ["round", "rounds"]],
  votes: [["głos", "głosy", "głosów"], ["vote", "votes"]],
  wins: [["wygrana", "wygrane", "wygranych"], ["win", "wins"]],
  roundsWon: [["runda wygrana", "rundy wygrane", "rund wygranych"], ["round won", "rounds won"]],
} as const;

export type Noun = keyof typeof NOUNS;

export function count(lang: Lang, n: number, noun: Noun): string {
  const [pl, en] = NOUNS[noun];
  if (lang === "en") return `${n} ${n === 1 ? en[0] : en[1]}`;
  if (n === 1) return `${n} ${pl[0]}`;
  const tens = n % 100;
  const last = n % 10;
  return `${n} ${last >= 2 && last <= 4 && (tens < 12 || tens > 14) ? pl[1] : pl[2]}`;
}
