# Kings Reigns

Gra towarzyska o dworze, prywatnej wiedzy i zdradzie, zbudowana jako aktywność Stellarra
(Vite + React + TypeScript, autorytet gospodarza). Źródła wersji 0.1.0 pochodzą
z repozytorium `stellar-activities-registry`, z commita `08bd17f`.

## Jak się gra

- Pięć krzeseł: Król i czterech doradców (Skarbnik, Generał, Biskup, Trybun). Gracze
  przychodzą z kanału głosowego. Wolne krzesła zajmują boty, a nadmiarowe osoby
  oglądają grę. W trybie osobistym grasz solo jako Król z czterema botami.
- Jeden z doradców jest Zdrajcą. Gra wyświetla tę informację tylko jemu.
- Panowanie trwa trzy lata po 12 dekretów.
- Na początku każdego roku losuje się **znak roku**: Susza, Wojna na granicy, Zaraza,
  Kometa albo Urodzaj. Znak po każdym dekrecie podgryza któryś filar i przechyla talię
  ku swoim kategoriom. Wchodzą wtedy cztery sprawy, które istnieją tylko pod tym znakiem.
- **Tura:** doradca przeciąga kartę sprawy. Pod spodem lis (A) albo kruk (B)
  pokazuje dekret i jego liczbę dla tego doradcy. Przeciągnięcie za próg oddaje głos,
  a puszczenie wcześniej cofa kartę. Zdrajca widzi dodatkowo Stabilność i podpowiedź, który dekret
  bardziej szkodzi. Król nie widzi żadnych liczb, a dekret wydaje tym samym gestem,
  gdy zagłosują wszyscy doradcy.
- **Sąd roku** po 12. dekrecie: głosuje cała piątka, Król też. Wyrok zapada przy
  3 głosach. Trafiony Zdrajca daje Stabilność +10, a gracz zostaje przy stole jako
  lojalny następca. Przed kolejnym rokiem los z szansą 1 na 2 wybiera nowego zdrajcę.
  Pomyłka kosztuje filar straconego doradcy −12. Bez większości nikt nie ginie.
- **Nowy rok** przynosi wytchnienie: każdy filar wraca o 6 punktów ku środkowi.
- **Koniec:** filar na 0 albo 100 przewraca tron i wygrywa obecny Zdrajca, a jeśli
  żadnego nie ma, nikt. Trzy lata bez upadku to wygrana Rady.
- **Menu** jest na każdym ekranie: powrót do gry, zasady, ekran tytułowy. Gospodarz może
  stamtąd zakończyć panowanie. Wszyscy wracają wtedy do sali obrad i zachowują krzesła.
  Ekran tytułowy, menu gry i ustawienia w sali obrad są arkuszem tego samego papieru co
  karta dekretu, z pieczęcią przy głównej akcji. Tytuł i menu stoją na środku, a za nimi
  na stole Rady leżą rozsypane karty: sprawy, znaki roku, portrety i rewersy. Karty powoli
  dryfują, a dwie co jakiś czas się odwracają. Przycisk „Zatrzymaj tło” zatrzymuje ruch,
  a przy ustawieniu ograniczonego ruchu karty leżą nieruchomo. W sali obrad każde krzesło
  jest kartą: wolne leży rewersem, zajęte pokazuje portret roli.

### Poselstwa (na razie wyłączone)

Tryb jest zbudowany, ale na razie wyłączony flagą `EMBASSY_ENABLED` w
`src/game/features.ts`. Gdy flaga jest wyłączona, reguły odmawiają tego trybu, a pokój
pozostawiony w Poselstwach zaczyna zwykłą radę. W sali obrad kafelek jest wtedy oznaczony jako
zamknięty, a ekran tytułowy go nie pokazuje. Po włączeniu flagi tryb ma ten sam rytm: 3 lata po
12 depesz, znak roku, sąd i Zdrajcę.

- Depesze przychodzą od trzech stron: Czarnej Fali, Wolnych Portów i Bursztynowego Traktu.
  Kolejne depesze roku idą po kolei do każdej z nich. Każda strona ma swoją relację z
  Koroną (0–100), a 100 depesz pochodzi ze starej wersji.
- Każda depesza ma trzy odpowiedzi. Każda zmienia filary i relację w sposób, który widać
  na karcie.
- **Łącznik** depeszy, jeden z doradców, widzi dodatkowo ukryte skutki każdej odpowiedzi.
  Zdrajca widzi, która odpowiedź naprawdę szkodzi najbardziej.
- Doradcy głosują kliknięciem odpowiedzi. Gdy zagłosują wszyscy, Król wybiera odpowiedź
  i przykłada pieczęć. Dopiero wtedy wszyscy poznają ukryte skutki, a strona odpisuje.
- Relacja z żadną stroną nie przegrywa gry. Na razie wpływa tylko na ryzyko,
  które liczą boty (strona bliska wojny to większe ryzyko).

## Uruchomienie

W repozytorium są źródła gry. Do uruchomienia lokalnego użyj Node.js 22+ i pnpm 10.14.0.

```sh
cd kings-reigns
pnpm install --frozen-lockfile
pnpm dev            # sam interfejs, z lokalnym pokojem solo
pnpm test           # reguły (vitest)
pnpm build          # paczka w dist/
pnpm sdk:dev        # symulator Stellarra z dist/; dodaj --mode voice i „New player”
pnpm sdk:validate
pnpm test:browser   # symulator: rok z Królem i Skarbnikiem (Bob wypada i wraca),
                    # menu gry i koniec panowania, solo, piaskownica z CSP
                    # Stellarra; zrzuty w reports/
```

## Budowa

| Część | Gdzie | Uwagi |
| --- | --- | --- |
| Reguły | `src/game/rules.ts` | Jedna czysta funkcja `decide(kind, data, state, ctx)`. Rejestruje ją każdy klient, a uruchamia wybrany gospodarz. Po zmianie gospodarza gra toczy się dalej z samego stanu wspólnego. Boty i terminy popycha polecenie `nudge`, które wysyła klient gospodarza. Każdy losowy wynik zapisuje się w tej samej decyzji. |
| Tajemnice | `rules.ts` (`vault`, `assignments`) | Każdy gracz dostaje swoją rolę prywatnie. Gra zachowuje też tożsamość Zdrajcy we wspólnym stanie pokoju, żeby odtworzyć role po zmianie gospodarza. Uczestnik może więc poznać Zdrajcę przy użyciu narzędzi deweloperskich przeglądarki. |
| Talia | `src/game/catalog.ts`, `src/game/events/` | 184 sprawy bazowe i 50 spraw pod znaki roku. Stan wspólny trzyma tylko identyfikatory spraw. |
| Poselstwa | `src/game/embassy.ts`, `src/game/diplomatic-events.ts`, `src/ui/Embassy.tsx` | Pomocnicze funkcje odpowiedzi (skutki pod znakiem roku, ryzyko, najgorsza odpowiedź). Reguły trybu żyją w `rules.ts` obok Zwykłej Rady. Depesze ze starej wersji pisano pod 10 tur, więc każdy skutek filaru liczy się tu podwójnie (`STAKES`). Łącznik bot kieruje się ukrytą warstwą. Zdrajca bot w 45% depesz wybiera najgorszą odpowiedź (`TRAITOR_WORST_REPLY`), a zawsze wtedy, gdy ta przewraca tron. |
| Boty | `rules.ts` | Lojalny bot zna tylko swój filar i go pilnuje. Zdrajca w ~45% spraw się maskuje, a w raporcie czasem kłamie. Bot-Król liczy dekret z raportów doradców. Na sądzie boty oskarżają tego, czyje liczby zdemaskowały ogłoszone zmiany. |
| Widok gracza | `src/game/view.ts` | Co dany gracz widzi: swój filar, Stabilność i podpowiedź dla Zdrajcy. |
| Interfejs | `src/ui/`, `src/styles.css` | Ekrany obrad, dekretów, sądu i końca panowania. |
| Stellarr | `src/stellarr/` | Import SDK w czasie działania i zastępczy pokój solo przy zwykłym `vite`. Nie używa `localStorage`. Gospodarz liczy `nudge` u siebie i wysyła go tylko, gdy coś ma się wydarzyć, z identyfikatorem opartym na stanie. Dziennik poleceń pokoju (4096 wpisów) rośnie więc o jeden wpis na krok gry, a nie co sekundę. |
| Nieobecni | `rules.ts` | Za nieobecnego uznaje się dopiero kogoś, kogo SDK usunęło po 10 s karencji. Jego krzesło grają wtedy reguły, a tajny znak dostaje on dopiero po powrocie (`hello`). SDK odrzuca znaki dla osób spoza pokoju. |

W symulacji 300 rozgrywek samych botów Rada wygrywa około 59% gier, Zdrajca 28%,
a w 13% tron upada bez zdrajcy. W wyłączonych na razie Poselstwach to 63%, 14% i 22%. Bez
podwójnej stawki Zdrajca nie wygrywał tam wcale, a Rada wygrywała 97% gier.

## Grafika

- Grafiki ze starej wersji leżą w `public/assets/`.
- W `public/assets/year/` są znaki roku, sala sądu, oba wyroki i dwie pieczęcie.
- Czcionki są w paczce, bo ramka aktywności blokuje Google Fonts: Grenze Gotisch w
  `src/fonts/`, Alegreya Sans, Cormorant Garamond i IBM Plex Mono z `@fontsource`.
