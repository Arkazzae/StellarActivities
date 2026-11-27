/**
 * Topic packs. `{gracz}` is replaced with someone from the channel, always in the nominative
 * and never with a past-tense verb, because the SDK gives a bare display name with no gender.
 * Second-person topics stay in the present tense for the same reason.
 */
import type { PackId } from "./types.ts";

export interface TopicTemplate {
  id: string;
  pack: Exclude<PackId, "mix">;
  text: string;
}

const NAME = "{gracz}";

const codziennosc = [
  "Pierwszy łyk kawy w poniedziałek",
  "Kiedy kurier dzwoni akurat w trakcie prysznica",
  "Mina przy wejściu na wagę po świętach",
  "Szukanie pilota, który cały czas jest w ręce",
  "Kiedy sąsiad wierci o 7:00 w sobotę",
  "Ostatni kawałek pizzy i pięć osób przy stole",
  "Kiedy Wi-Fi znika w połowie odcinka",
  "Wychodzenie z ciepłego łóżka w styczniu",
  "Kiedy autobus odjeżdża sprzed nosa",
  "Gdy w sklepie otwierają drugą kasę",
  "Kiedy ktoś zjada twój jogurt z lodówki",
  "Pierwszy ciepły dzień i od razu krótki rękaw",
  "Kiedy budzik dzwoni pięć minut po zaśnięciu",
  "Składanie prania, które leży na krześle od tygodnia",
  "{gracz} rano przed pierwszą kawą",
  "{gracz} w kolejce do kasy samoobsługowej",
  "{gracz} na widok promocji 1+1 gratis",
  "{gracz} po znalezieniu 20 zł w starej kurtce",
  "{gracz} składa meble bez instrukcji",
];

const praca = [
  "Kiedy szef pisze „masz chwilę?” w piątek o 16:58",
  "Kamera włączona przez przypadek na spotkaniu",
  "Gdy pada hasło „kartkówka, zamykamy zeszyty”",
  "Odpowiadanie „jak w mailu poniżej” po raz trzeci",
  "Ostatnia godzina przed weekendem",
  "Kiedy projekt grupowy robi jedna osoba",
  "Mina po słowach „mam małą prośbę”",
  "Drukarka, gdy jest najbardziej potrzebna",
  "Kiedy prezentacja się nie otwiera, a wszyscy patrzą",
  "Wyniki egzaminu w skrzynce i strach przed kliknięciem",
  "Kiedy ktoś odpowiada „do wszystkich” całej firmie",
  "Spotkanie, które mogło być mailem",
  "Gdy dzwonek ratuje przed odpowiedzią przy tablicy",
  "Kiedy wypłata przychodzi i od razu znika",
  "{gracz} na spotkaniu, które trwa już drugą godzinę",
  "{gracz} przy odpowiedzi przy tablicy",
  "{gracz} w piątek o 15:59",
  "{gracz} czyta maila od szefa z trzema wykrzyknikami",
  "{gracz} na urlopie odbiera telefon z pracy",
];

const internet = [
  "Kiedy wiadomość jest „wyświetlona” od godziny",
  "Czytanie komentarzy pod własnym postem",
  "Kiedy ktoś pisze „musimy pogadać” i nic więcej",
  "Przypadkowe polubienie zdjęcia sprzed sześciu lat",
  "Hasło musi mieć dużą literę, cyfrę, znak i duszę",
  "Kiedy gra się aktualizuje akurat teraz",
  "Ping 999 w decydującym momencie",
  "Wiadomość głosowa na siedem minut",
  "Czat grupowy i 300 nieprzeczytanych",
  "Kiedy ktoś odpisuje na wiadomość sprzed tygodnia",
  "Mina przy „Twoja sesja wygasła”",
  "Kiedy streamer czyta twój komentarz na głos",
  "Przewijanie regulaminu i klikanie „akceptuję”",
  "Kiedy reklama zna cię lepiej niż rodzina",
  "{gracz} po wysłaniu wiadomości na zły czat",
  "{gracz} przy 1% baterii",
  "{gracz} na widok spoilera",
  "{gracz} czeka, aż ktoś odpisze",
  "{gracz}, kiedy przegrywa w ostatniej sekundzie",
];

const imprezy = [
  "Kiedy lecą pierwsze takty ulubionej piosenki",
  "Wyjście „tylko na jedno”",
  "Kiedy ktoś ogłasza „ostatnia kolejka”",
  "Taniec o drugiej w nocy",
  "Powrót do domu o świcie",
  "Impreza, na której znasz tylko gospodarza",
  "Gdy ktoś wyciąga gitarę",
  "Szukanie swojej kurtki w stosie kurtek",
  "Kiedy wszyscy śpiewają, a nikt nie zna słów",
  "Taksówka „za 2 minuty”, która jedzie 20",
  "Karaoke po trzecim refrenie",
  "Kiedy na grillu kończy się kiełbasa",
  "Zdjęcie grupowe, na którym ktoś zawsze mruga",
  "{gracz} na parkiecie",
  "{gracz} przy wyborze muzyki",
  "{gracz} w drodze na afterparty",
  "{gracz} rano po imprezie",
  "{gracz} robi zdjęcie grupowe",
  "{gracz} na weselu przy oczepinach",
];

// English, in the same order as the Polish lists, so the same ids.
const everydayEn = [
  "The first sip of coffee on a Monday",
  "When the courier rings while you're in the shower",
  "Stepping on the scale after the holidays",
  "Looking for the remote that's in your hand",
  "When the neighbour starts drilling at 7 am on a Saturday",
  "The last slice of pizza and five people at the table",
  "When the Wi-Fi dies halfway through an episode",
  "Getting out of a warm bed in January",
  "When the bus leaves right in front of you",
  "When the shop opens a second checkout",
  "When someone eats your yogurt from the fridge",
  "The first warm day and straight into T-shirts",
  "When the alarm goes off five minutes after falling asleep",
  "Folding the laundry that's been on the chair for a week",
  "{gracz} before the first coffee",
  "{gracz} in the self-checkout queue",
  "{gracz} spotting a buy-one-get-one-free deal",
  "{gracz} after finding a twenty in an old jacket",
  "{gracz} assembling furniture without the instructions",
];

const workEn = [
  "When the boss writes “got a minute?” at 4:58 pm on a Friday",
  "Camera on by accident in a meeting",
  "When the teacher says “pop quiz, books away”",
  "Replying “as per my email below” for the third time",
  "The last hour before the weekend",
  "When one person does the whole group project",
  "Your face after “I have a small favour to ask”",
  "The printer, exactly when you need it",
  "When the presentation won't open and everyone's watching",
  "Exam results in your inbox and the fear of clicking",
  "When someone hits “reply all” to the whole company",
  "The meeting that could have been an email",
  "When the bell saves you from answering at the board",
  "When payday comes and the money's gone the same day",
  "{gracz} in a meeting that's in its second hour",
  "{gracz} answering at the board",
  "{gracz} on Friday at 3:59 pm",
  "{gracz} reading an email from the boss with three exclamation marks",
  "{gracz} on holiday, picking up a work call",
];

const onlineEn = [
  "When your message has been “seen” for an hour",
  "Reading the comments under your own post",
  "When someone writes “we need to talk” and nothing else",
  "Accidentally liking a photo from six years ago",
  "Password must have a capital, a number, a symbol and a soul",
  "When the game decides to update right now",
  "999 ping at the deciding moment",
  "A seven-minute voice message",
  "The group chat with 300 unread",
  "When someone replies to a message from last week",
  "Your face at “Your session has expired”",
  "When the streamer reads your comment out loud",
  "Scrolling through the terms and clicking “I agree”",
  "When the ads know you better than your family",
  "{gracz} after sending a message to the wrong chat",
  "{gracz} at 1% battery",
  "{gracz} seeing a spoiler",
  "{gracz} waiting for a reply",
  "{gracz} losing in the very last second",
];

const partiesEn = [
  "When the first notes of your favourite song drop",
  "Going out for “just one”",
  "When someone announces “last round”",
  "Dancing at 2 am",
  "Getting home at dawn",
  "A party where you only know the host",
  "When someone pulls out a guitar",
  "Finding your jacket in the pile of jackets",
  "When everyone sings and nobody knows the words",
  "A taxi “in 2 minutes” that takes 20",
  "Karaoke after the third chorus",
  "When the barbecue runs out of sausages",
  "The group photo where someone always blinks",
  "{gracz} on the dance floor",
  "{gracz} picking the music",
  "{gracz} on the way to the afterparty",
  "{gracz} the morning after the party",
  "{gracz} taking the group photo",
  "{gracz} at a wedding during the bouquet toss",
];

const build = (pack: TopicTemplate["pack"], prefix: string, texts: string[]): TopicTemplate[] =>
  texts.map((text, i) => ({ id: `${prefix}${String(i + 1).padStart(2, "0")}`, pack, text }));

const ENGLISH: Record<string, string> = Object.fromEntries(
  [...build("codziennosc", "c", everydayEn), ...build("praca", "p", workEn), ...build("internet", "i", onlineEn), ...build("imprezy", "m", partiesEn)].map((t) => [t.id, t.text]),
);

/**
 * A topic in the reader's language. The room keeps the host's wording, the id and the name;
 * each player rebuilds the sentence from the id, so everyone reads their own language.
 */
export function localTopic<T extends { id: string; text: string; name?: string }>(topic: T, lang: "pl" | "en"): T {
  const template = lang === "en" ? ENGLISH[topic.id] : TOPICS.find((t) => t.id === topic.id)?.text;
  if (!template) return topic;
  return { ...topic, text: topic.name ? template.replace(NAME, topic.name) : template };
}

export const englishTopics = () => ENGLISH;

export const TOPICS: TopicTemplate[] = [
  ...build("codziennosc", "c", codziennosc),
  ...build("praca", "p", praca),
  ...build("internet", "i", internet),
  ...build("imprezy", "m", imprezy),
];

export const namesSomeone = (template: TopicTemplate) => template.text.includes(NAME);

/** A display name short enough for a topic line. */
export function shortName(name: string): string {
  const clean = name.trim().replace(/\s+/g, " ");
  const chars = [...clean];
  return chars.length > 18 ? `${chars.slice(0, 17).join("").trimEnd()}…` : clean || "Ktoś";
}

export function fillTopic(template: TopicTemplate, name: string | null): { text: string; name?: string } {
  if (!namesSomeone(template) || !name) return { text: template.text };
  const short = shortName(name);
  return { text: template.text.replace(NAME, short), name: short };
}

export function poolFor(pack: PackId, names: boolean): TopicTemplate[] {
  return TOPICS.filter((t) => (pack === "mix" || t.pack === pack) && (names || !namesSomeone(t)));
}
