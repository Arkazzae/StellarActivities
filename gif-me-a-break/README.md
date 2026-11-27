# Gif Me a Break

Gra na GIF-y dla kanału głosowego Stellarr, po polsku i po angielsku. Pada temat (dwa do wyboru, czasem z imieniem kogoś z kanału), każdy szuka GIF-a, który pasuje najlepiej, potem pokaz memów jeden po drugim z naklejkami rzucanymi na żywo i głosowanie. Od 3 do 8 osób.

Projekt ekranów: https://claude.ai/artifact/5wCWMBuDjzX1uJKq2W9cQk (strona „Kierunek C”). Roboczo gra nazywała się „Pętla”, stąd `window.petla` w konsoli i nazwy plików grafik.

## Tryby

| Tryb | Zasady |
| --- | --- |
| Klasyk / Classic | Wszyscy szukają, wszyscy głosują. 1 pkt za głos, na swój mem nie wolno. |
| Zakaz słów / Banned words | Jak Klasyk, ale wyszukiwarka nie przyjmie słów z tematu ani ich odmian (każdy widzi zakaz w swoim języku). |
| Reżyser / Director | Co rundę ktoś inny (po kolei, z pominięciem nieobecnych) wybiera temat i zwycięzcę, sam nie szuka. Wybrany mem: 3 pkt. |
| Napisy / Captions | Prowadzący losuje dwa GIF-y, gracze wybierają jeden i każdy dopisuje do niego tekst (do 90 znaków). Głosuje się na napisy. |

## Języki

Każdy gracz widzi grę w języku swojego interfejsu Stellarr (`session.locale`): polski dla `pl*`, angielski dla reszty. Pokój trzyma tylko id tematów, imiona i liczby; zdania (tematy, nagrody, odmowy prowadzącego) każdy składa u siebie. Teksty: `src/i18n/index.ts`, tematy w obu językach: `src/game/topics.ts`.

## GIF-y

Gra korzysta z `session.media.gifs` (uprawnienie `media.gifs` w `stellarr.json`). Stellarr szuka w GIPHY kluczem instancji i z ustawieniem prywatności gracza; ramka gry dostaje tylko id, rozmiary i obrazki, nigdy klucza ani adresów. Podpis GIPHY dorysowuje sam Stellarr. Do stanu pokoju trafiają wyłącznie id GIF-ów.

- Limity ramki: 30 wyszukiwań i 120 wczytań na minutę, 4 naraz. Gra szuka po 12 wyników, miniatury wczytuje dopiero w polu widzenia i w osobnej kolejce (memy z pokazu idą pierwsze), a odrzucone przez limit wczytanie ponawia po przerwie.
- Lobby sprawdza, czy GIF-y działają: bez GIF-ów na instancji prowadzący nie zacznie, a gracz z wyłączonym GIPHY dostaje uwagę.
- `stellarr dev`: odpowiada własnym zestawem testowych GIF-ów, bez sieci i klucza.
- zwykłe `vite dev` (poza Stellarr): sześć zdjęć zastępczych z `public/art/demo/`.

## Polecenia

```sh
pnpm install
pnpm test            # zasady, tryby, języki (vitest)
pnpm build
pnpm sdk:validate
pnpm test:browser    # w stellarr dev: mecz w Zakazie słów (5 rund, gracze PL i EN, wyłączone GIF-y,
                     # przeładowanie, widz, odejście prowadzącego), runda Reżysera, runda Napisów;
                     # potem piaskownica z CSP Stellarr
pnpm test:screens    # zrzuty każdego ekranu i trybu z ?preview=<faza>, PL i EN, 1360×812, 1100×650 i 390
pnpm sdk:dev         # symulator; „New player” dodaje kolejną osobę
```

Podgląd jednego ekranu bez grania: zbudowana aplikacja otwarta poza Stellarr z `?preview=lobby|topic|search|reveal|vote|results|final`, opcjonalnie `&mode=rezyser|napisy`, `&lang=pl|en`, `&as=guest`.

## Budowa

- `src/game`: czyste zasady (fazy, punkty, tryby, tematy, zakaz słów) z testami. Każda decyzja prowadzącego zależy tylko od stanu, przypisań graczy i ziarna z id meczu, więc nowy prowadzący decyduje tak samo.
- `src/net/game.ts`: pokój. Komendy idą do zasad, prowadzący popycha terminy i losuje GIF-y w Napisach, naklejki lecą przez `send` (nie zapychają rejestru komend), obrazki GIF-ów są trzymane, dopóki runda ich potrzebuje.
- `src/ui`: ekrany. Na komputerze scena 1360×812 jak na canvasie, skalowana do ramki; na telefonie układ pionowy.
- GIF, napis i głos gracza są w jego prywatnym przypisaniu aż do pokazu i wyników; stan publiczny mówi tylko, kto skończył. Kolejność pokazu losuje ziarno z prywatnymi czasami wysłania, więc ze stanu publicznego nie da się odgadnąć autorów.

Grafiki (kot Pętlik, logo, naklejki, tła, okładka, zdjęcia zastępcze) zrobił Codex wg `ARTWORK.md`; źródła w `artwork/`, wersje do gry w `public/art/`.
