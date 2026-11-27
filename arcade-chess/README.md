# Arcade Chess

Szachy dla Stellarra, zbudowane na interfejsie [FlyChess](https://github.com/Arkazzae/flychess), ale bez muchy: bez konektomu, modelu DROSO-1 i widoku mózgu. Zostały plansza, analiza partii, zadania i boty grające ruchami Stockfisha. Do tego doszły menu, drabinka przeciwników, Chaos Chess z Multiversal Chess i gra z ludźmi na kanale głosowym przez SDK Stellarra.

Do 27 listopada 2026 aktywność nazywała się Stellar Chess, a jej folder i identyfikator `stellar-chess`. Nie miała jeszcze wydania, więc zmiana identyfikatora nie kasuje niczyjego postępu.

## Co jest w środku

- **Menu.** Boczny pasek jak na stronach szachowych: Graj (rozwija listę: gra z botem, multiplayer, bot kontra bot, zadania, analiza ostatniej partii), Zadania, Multiplayer, Drabinka i Statystyki. Tryb wybiera się tylko w menu; ekran gry pokazuje już tylko opcje danego trybu. Na telefonie pasek zmienia się w górną belkę z ikonami.
- **Statystyki** (strona startowa). Partie, procent wygranych, najdłuższa seria i postęp na drabince za 7, 14 lub 30 dni albo cały czas; wygrane, remisy i porażki dzień po dniu; wyniki białymi i czarnymi; ostatnie partie z przejściem do analizy; najczęstsze debiuty. Historia (do 40 partii) zapisuje się w postępie Stellarra.
- **Zadania.** Ranking zadań (Elo względem rankingu zadania), seria dni z zadaniem dnia (codziennie inne zadanie z banku) i ostatni tydzień, odliczanie do następnego zadania, Błyskawica (3 minuty matów w 1, trzy pomyłki kończą serię, rekord), motywy na prawdziwych pozycjach (mat na ostatniej linii, stłumiony, promocja, podwójny szach, maty poszczególnymi figurami), pozycje testowe i końcówki przeciw obronie Stockfisha z najlepszym czasem, sześć odznak. Przy pozycji testowej panel jak w makiecie: stan próby, podpowiedź, „zagraj następny ruch”, od nowa, następne zadanie. Bank 190 zadań (150 matów w 1, 40 w 2) generuje `scripts/puzzle-bank.mjs` z partii rozegranych przez prostą politykę, a `src/data/puzzle-bank.test.ts` sprawdza, że każde ma jedno rozwiązanie. Chess960 i własny FEN zostały jako „inne starty”.
- **Chaos Chess (na razie ukryte).** Gotowe, ale wyłączone przełącznikiem `CHAOS_ENABLED` w `src/features.ts`, dopóki karty i grafiki nie są dopracowane. Karty mają wygląd Multiversal Chess: ciemna karta, ilustracja przechodząca w tekst, kategoria jako znak, rzadkość jako metal krawędzi. Każda z 50 kart ma własną ilustrację. Rywale to klasy fantasy w tym samym kinowym stylu: Czarodziejka Iskra (600, karty Magii), Kronomanta Bruno (950, Czasu), Wojownik Bolko (1300, Walki), Wyrocznia Mira (1650, Losu) i Arbiter Chaosu Nox (2000, zawsze najlepsza karta). Ma własne menu z talią do przejrzenia. Rozgrywka: co 4 ruchy draft 1 z 3 kart z talii 50 efektów, niektóre karty każą wskazać pole, aktywne efekty w panelu i kronice, specjalne figury, bot dobiera karty sam. Tylko przeciw botom; ruchów nie da się cofnąć, a zamiast analizy silnikiem partię przegląda się ruch po ruchu.
- **Drabinka graczy i Stellarr Elo.** Zakładka „Gracze” na stronie Drabinki: ranking osób z sesji według Stellarr Elo (ostatnia zmiana, partie, W–R–P, wynik procentowy, najwyższe Elo), wyniki skończonych partii z tym, ile każda zmieniła obu graczom, i karta gracza z jego ostatnimi partiami. Elo liczą tylko partie w Multiplayerze: start 1200, K = 32. Elo jest też pod nazwą w pasku bocznym.
- **Drabinka przeciwników** (zakładka „Boty”). Ośmiu botów rodem z gier: parodie typów postaci, które zna każdy gracz, a nie konkretnych bohaterów. Każdy ma własny styl gry, teksty po polsku i angielsku, ranking i portret w pixel arcie w stylu ery 32-bit:

  | Bot | Ranking | Kto to i jak gra |
  | --- | --- | --- |
  | Glut | 250 | glut z poziomu 1; połowa ruchów losowa, połyka wszystko, co się da |
  | Zenek | 450 | NPC przy studni; pcha piony, myśli powoli, powtarza się |
  | Turbo | 700 | speedrunnerka; ruchy natychmiast, wczesny hetman i szybki mat |
  | Mimik | 1000 | skrzynia-pułapka; czeka i uwielbia nagłe szachy |
  | Bazyl | 1300 | wędrowny handlarz; wymienia figury, gdzie się da |
  | Bronka | 1600 | tank z tarczą; solidnie, mur pionów |
  | Bogdan | 1900 | mistrz combosów z bijatyk; forsowne serie szachów i bić |
  | Mordax | 2200 | ostatni boss; głęboko i precyzyjnie, z „drugą fazą” w czacie |
  | Stockfish | ustawiany | poziom 0–20, głębokość i czas na ruch |

  Zapisane wyniki, historia i wybory z pierwszej drabinki (Kuba … Wiktor) przechodzą na postać z tego samego szczebla (`currentOpponentId` w `src/ai/bots/index.ts`).

  Rankingi to cele, pod które dobrano styl (`src/ai/bots/characters.ts`). Nie zostały zmierzone w partiach.
- **Wygląd planszy.** W ustawieniach: trzy zestawy figur (Klasyczne, domyślne i narysowane dla Arcade Chess; Kreskówkowe; Turniejowe, czyli cburnett) i sześć kolorów pól, z podglądem. Zapisują się w postępie Stellarra.
- **Multiplayer.** Własna strona zamiast planszy: otwarte stoły czekające na przeciwnika, trwające partie z podglądem pozycji, formularz „Hostuj grę” i lista osób w aktywności. Plansza otwiera się dopiero przy partii. Stoły jak na serwerze gry: każdy może hostować stół (czas i kolor), a inni dołączają do wybranego albo oglądają dowolną partię, więc przy większej liczbie osób kilka partii toczy się naraz. Zegar z inkrementem, propozycja remisu, poddanie, wygrana po wyjściu przeciwnika i rewanż przy tym samym stole ze zmianą kolorów. Gdy gracz po partii wstaje od stołu, stół się zamyka. Poza wspólną sesją Stellarra strona wyjaśnia, jak zagrać razem. Tylko zwykłe szachy.
- **Bez kanału** (tryb `personal` albo zwykłe `pnpm dev`) wszystko poza grą z ludźmi działa solo.

## Jak to działa ze Stellarrem

- `public/stellarr.json`: protocol 1, `launchModes: ["voice", "personal"]`, `authority: "host"`.
- SDK jest ładowane w trakcie działania z `/_stellarr/sdk/v1.js`, więc aktywność mówi wersją hosta. Poza Stellarrem (`pnpm dev`) lokalna sesja zastępcza daje tryb solo.
- Multiplayer (`src/online/`) to stan współdzielony (lista stołów) z komendami rozstrzyganymi przez hosta sesji: `host`, `close`, `join`, `leave`, `move`, `resign`, `draw`, `decline`, `flag`, `abandon` i `rematch`, każda dla swojego stołu. Zasady w `protocol.ts` są czystymi funkcjami. Każdy klient rejestruje te same reguły, a stan partii odtwarza się z listy ruchów, więc po rozłączeniu hosta sesji kolejny gracz przejmuje sędziowanie bez straty.
- Stellarr Elo: sędzia liczy zmianę przy końcu partii z Elo obu graczy z chwili jej startu i dopisuje wynik do `results` (ostatnie 30) oraz kart graczy w `profiles` stanu współdzielonego. Każdy gracz zapisuje zmianę u siebie w `session.progress` (raz na partię) i przy wejściu do sesji wysyła swoją kartę komendą `profile`. SDK nie ma wspólnego magazynu dla całej instancji, więc ranking pokazuje osoby z bieżącej sesji, a Elo każdego idzie z nim między sesjami. Liczby w karcie pochodzą od samego gracza: między znajomymi to wystarczy, ale nie jest to ranking odporny na oszustwa.
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
