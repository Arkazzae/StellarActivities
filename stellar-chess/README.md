# Stellar Chess

Szachy dla Stellarra, zbudowane na interfejsie [FlyChess](https://github.com/Arkazzae/flychess), ale bez muchy: bez konektomu, modelu DROSO-1 i widoku mózgu. Zostały plansza, analiza partii, zadania i boty grające ruchami Stockfisha. Do tego doszły menu, drabinka przeciwników, Chaos Chess z Multiversal Chess i gra z ludźmi na kanale głosowym przez SDK Stellarra.

## Co jest w środku

- **Menu.** Boczny pasek jak na stronach szachowych: Graj (rozwija listę: gra z botem, multiplayer, Chaos Chess, bot kontra bot, zadania, analiza ostatniej partii), Zadania, Chaos Chess, Multiplayer, Drabinka i Statystyki. Tryb wybiera się tylko w menu; ekran gry pokazuje już tylko opcje danego trybu. Na telefonie pasek zmienia się w górną belkę z ikonami.
- **Statystyki** (strona startowa). Partie, procent wygranych, najdłuższa seria i postęp na drabince za 7, 14 lub 30 dni albo cały czas; wygrane, remisy i porażki dzień po dniu; wyniki białymi i czarnymi; ostatnie partie z przejściem do analizy; najczęstsze debiuty. Historia (do 40 partii) zapisuje się w postępie Stellarra.
- **Zadania.** Ranking zadań (Elo względem rankingu zadania), seria dni z zadaniem dnia (codziennie inne zadanie z banku) i ostatni tydzień, odliczanie do następnego zadania, Błyskawica (3 minuty matów w 1, trzy pomyłki kończą serię, rekord), motywy na prawdziwych pozycjach (mat na ostatniej linii, stłumiony, promocja, podwójny szach, maty poszczególnymi figurami), pozycje testowe i końcówki przeciw obronie Stockfisha z najlepszym czasem, sześć odznak. Przy pozycji testowej panel jak w makiecie: stan próby, podpowiedź, „zagraj następny ruch”, od nowa, następne zadanie. Bank 190 zadań (150 matów w 1, 40 w 2) generuje `scripts/puzzle-bank.mjs` z partii rozegranych przez prostą politykę, a `src/data/puzzle-bank.test.ts` sprawdza, że każde ma jedno rozwiązanie. Chess960 i własny FEN zostały jako „inne starty”.
- **Chaos Chess.** Własne menu: banner, pięciu rywali Chaosu (Iskra 600, Bruno 950, Bolko 1300, Mira 1650, Nox 2000), z których każdy sięga po swoją kategorię kart (Nox zawsze bierze kartę najlepszą według silnika) i komentuje swoje zagrania, kolor i czas, „jak to działa” i cała talia do przejrzenia. Rywale z drabinki grają tylko w zwykłe szachy. Silnik z Multiversal Chess: co 4 ruchy (8 półruchów) gra staje i każda strona dobiera 1 z 3 kart z talii 50 efektów (magia, walka, czas, los), a kto wybiera pierwszy, zmienia się co rundę. Karty są w formacie zwykłych kart do gry, z grafiką, rzadkością i numerem w talii; niektóre każą wskazać pole na planszy. Aktywne efekty widać jako ikony przy graczach (opis po najechaniu), jako karty z turami w panelu i w kronice wyborów, zadziałań i wygaśnięć. Figury przekute, przyzwane, żelazne, przeklęte i przywrócone mają własne grafiki i opis po najechaniu. Bot wybiera kartę sam. Chaos jest na razie tylko przeciw botom; ruchów nie da się cofnąć, a zamiast analizy silnikiem partię przegląda się ruch po ruchu.
- **Drabinka przeciwników.** Ośmiu autorskich botów, każdy z własnym stylem gry, tekstami po polsku i angielsku oraz rankingiem:

  | Bot | Ranking | Charakter gry |
  | --- | --- | --- |
  | Kuba | 250 | siedmiolatek, połowa ruchów losowa, bierze wszystko |
  | Halina | 450 | park, pcha piony, myśli powoli |
  | Tomek | 700 | streamer, hetman w drugim ruchu |
  | Amara | 1000 | otwarcia z filmików, uwielbia szachować |
  | Diego | 1300 | kawiarniany blitz, gra szybko |
  | Ingrid | 1600 | trenerka klubowa, solidna pozycyjnie |
  | Hiro | 1900 | układa zadania, taktyk |
  | Wiktor | 2200 | mistrz na emeryturze |
  | Stockfish | ustawiany | poziom 0–20, głębokość i czas na ruch |

  Rankingi to cele, pod które dobrano styl (`src/ai/bots/characters.ts`). Nie zostały zmierzone w partiach.
- **Multiplayer.** Gracze w tej samej sesji Stellarra (kanał głosowy pod spodem): ktoś rzuca wyzwanie (czas i kolor), ktoś inny je przyjmuje, a reszta ogląda. Poza wspólną sesją strona wyjaśnia, jak zagrać razem. Na razie tylko zwykłe szachy, bez Chaosu. Zegar z inkrementem, propozycja remisu, poddanie, wygrana po wyjściu przeciwnika z kanału i rewanż ze zmianą kolorów. Podpowiedzi, cofanie ruchów i pasek oceny są wyłączone do końca partii.
- **Bez kanału** (tryb `personal` albo zwykłe `pnpm dev`) wszystko poza grą z ludźmi działa solo.

## Jak to działa ze Stellarrem

- `public/stellarr.json`: protocol 1, `launchModes: ["voice", "personal"]`, `authority: "host"`.
- SDK jest ładowane w trakcie działania z `/_stellarr/sdk/v1.js`, więc aktywność mówi wersją hosta. Poza Stellarrem (`pnpm dev`) lokalna sesja zastępcza daje tryb solo.
- Gra na kanale (`src/online/`) to stan współdzielony z komendami rozstrzyganymi przez hosta: `challenge`, `cancel`, `accept`, `move`, `resign`, `draw`, `decline`, `flag`, `abandon` i `rematch`. Zasady w `protocol.ts` są czystymi funkcjami. Każdy klient rejestruje te same reguły, a stan partii odtwarza się z listy ruchów, więc po rozłączeniu hosta kolejny gracz przejmuje partię bez straty.
- Ustawienia, wybory z ekranu botów, język i statystyki trafiają do `session.progress`. W ramce Stellarra `localStorage` nie istnieje. Język startuje z języka Stellarra, dopóki gracz nie wybierze własnego. Dźwięki słuchają suwaka Game audio.
- Pobieranie plików w ramce jest zablokowane, dlatego PGN pokazuje się w okienku do skopiowania.

## Uruchomienie

Wymagane są Node.js 22+ i pnpm 10+. Folder jest samodzielny, ma własny lockfile i nie należy do workspace'u w katalogu głównym.

```bash
pnpm install
pnpm dev            # http://localhost:5180, tryb solo
pnpm build
pnpm sdk:dev        # symulator Stellarra; „New player” otwiera kolejnego gracza
```

Skrypty `sdk:*` używają `../../Stellarr-newest/sdk/cli.js`, jeśli taki checkout istnieje. Inny checkout wskazuje zmienna `STELLARR_SDK`. W ostateczności używany jest opublikowany `@stellarr/sdk`.

## Weryfikacja

```bash
pnpm check          # testy, typecheck, build i stellarr validate
pnpm test:browser   # po buildzie: dwie osoby grają na kanale w symulatorze, host przeładowuje
                    # stronę w trakcie partii, trzecia osoba ogląda; zadanie z trenerem,
                    # statystyki, drabinka, partia Chaos z wyborem kart; potem bot w ramce
                    # bez allow-same-origin (jak w Stellarrze) odpowiada na ruch
```

Zrzuty ekranu z testu przeglądarkowego trafiają do `reports/`.

## Grafiki

Portrety botów, figury (z wariantami Chaos), ikony menu, kategorii i 50 efektów wygenerował Codex; ilustracje kart, ikona i okładka pochodzą z Multiversal Chess. Szczegóły i źródła są w [ARTWORK.md](ARTWORK.md).

## Licencje

Kod: MIT (patrz [LICENSE](LICENSE), dziedziczona po FlyChess). Stockfish (`public/stockfish.js`): GPL-3.0. Figury, portrety i ikony: wygenerowane przez Codex dla tego projektu. Fonty Montserrat i Noto Sans: SIL OFL 1.1. Tabele otwarć ECO (`public/libraries`) przeniesione z FlyChess.
