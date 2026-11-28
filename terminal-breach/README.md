# Terminal Breach

Zręcznościowa gra na klawiaturę w oprawie terminala CRT. Wpisuj komendę bezpośrednio na jej przygaszonym wzorze i zatwierdzaj Enterem. Terminal zachowuje wpisane polecenia i ich odpowiedzi. Pozostała część wzoru zostaje przy blokowym kursorze. Każdy błędnie wpisany znak od razu kosztuje 1 punkt. Wynik może spaść poniżej zera.

## Tryby

| Menu | Tryb | Reguły |
| --- | --- | --- |
| Single | Endless | Zdobywaj punkty, dopóki nie zapełni się licznik wykrycia lub nie skończy się czas na komendę. |
| Single | Sprint | Masz 60 sekund na jak najwyższy wynik. Błąd zeruje combo. |
| Single | Sudden death | Pierwsza błędnie zatwierdzona komenda kończy grę. |
| Multi | Duel | Dwie osoby przy jednej klawiaturze dostają po 30 sekund i tę samą kolejność komend. Wygrywa wyższy wynik. |
| Multi | Relay | Wspólnie wykonajcie 12 komend, zanim zapełni się licznik wykrycia. Przekazujcie klawiaturę co trzy komendy. |

W Multi kolejna osoba rozpoczyna swoją turę przyciskiem **Start turn**. Gra czeka podczas przekazywania klawiatury. Rekordy Endless, Sprint, Sudden death i Relay zapisują się osobno. W Stellarrze rekordy i ustawienia są przypisane do konta gracza. Przy samodzielnym uruchomieniu zapisuje je przeglądarka.

## Sterowanie i efekty

- W wierszu poleceń strzałka w górę przywołuje poprzednią komendę, a strzałka w dół przywraca nowszą komendę lub rozpoczęty wpis.
- Strzałki lub WASD wybierają pozycję w menu. Enter otwiera zaznaczoną pozycję. Escape wraca z wyboru trybu. Przy zmianie zaznaczenia słychać klik klawisza, a przy zatwierdzeniu niższe stuknięcie.
- W Endless i Sudden death Tab jednokrotnie uzupełnia komendę za 80% jej punktów bazowych. Escape jednokrotnie spowalnia czas na pięć sekund. Obie funkcje mają też przyciski na ekranie.
- W tych dwóch trybach rośnie trudność i pojawiają się modyfikatory. Bomb uruchamia serię komend z limitem czasu, a Ghost zakłóca niewpisane znaki.
- W **Settings** można przełączyć animacje ASCII z tłem wideo oraz dźwięk. Domyślne ustawienie animacji uwzględnia systemowe ograniczenie ruchu. W Stellarrze głośność reguluje też suwak **Game audio**.
- Literówka lub zatwierdzenie błędnej komendy wywołuje krótki dwuton, drganie obrazu i czerwone pasma na kineskopie. Zakłócenia nasilają się z liczbą błędów, postępem rundy i poziomem TRACE.
- Przy otwarciu terminala słychać rozruch. Jeśli przeglądarka czeka na interakcję, uruchamia go pierwszy klawisz lub kliknięcie. Czaszce towarzyszy urywany szum traconego sygnału.
- Po przegranej czerwone zakłócenia ASCII składają się w czaszkę Blackwall na całym kineskopie. Przed pokazaniem wyniku twarz rozsypuje się na znaki. Sekwencja trwa 1,6 sekundy. Przy wyłączonych animacjach czaszka pozostaje nieruchoma.

## Uruchomienie

Z katalogu głównego repozytorium uruchom symulator Stellarra w trybie osobistym (Node.js 22+). Otwórz adres wypisany przez SDK.

```sh
npx --yes --package=@stellarr/sdk@0.4.0 stellarr dev --dir terminal-breach/activity --mode personal
```

Do gry bez Stellarra wystarczy serwer statyczny. Polecenie udostępnia grę pod `http://127.0.0.1:8000/`.

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory terminal-breach/activity
```

Walidację źródeł i testy można uruchomić osobno.

```sh
npx --yes --package=@stellarr/sdk@0.4.0 stellarr validate --dir terminal-breach/activity
node --test terminal-breach/test/*.test.mjs
```

## Czcionki i dźwięk

Nagłówki i menu korzystają z IBM BIOS, a terminal z IBM VGA 8×16. Oba kroje pochodzą z pakietu VileR. [The Ultimate Oldschool PC Font Pack](https://int10h.org/oldschool-pc-fonts/) · [Licencja czcionek](activity/fonts/Oldschool-PC-LICENSE.txt)

Próbki dźwiękowe odtwarza Howler.js 2.2.4. [Licencja Howler.js](activity/libraries/Howler-LICENSE.txt)
