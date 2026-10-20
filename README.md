# OGARNIACZ

Program do tablic z zadaniami, w stylu Trello. Tablice, listy i karty można
przeciągać, karty mają checklistę widoczną od razu na tablicy, a całość ma 3
motywy w pełnych kolorach plus przełącznik przygaszenia ekranu.

## Uruchamianie

Program instaluje się normalnie, przez plik `OGARNIACZ Setup 1.x.x.exe`
z folderu `release`. Po instalacji dostajesz ikonę na Pulpicie i w Menu Start.

Podczas pracy nad programem (bez instalacji) uruchom go w terminalu:

```
npm start
```

## Gdzie są moje dane

Wszystkie tablice zapisywane są w jednym pliku:

```
C:\Users\Natalia\AppData\Roaming\OGARNIACZ\data.json
```

Plik jest zwykłym tekstem (JSON) — można go podejrzeć albo skopiować.
Adres znajdziesz też w aplikacji: menu **Pomoc → Gdzie są moje dane?**.

Aplikacja zapisuje się sama po każdej zmianie, więc nie trzeba nic klikać.
Kopia zapasowa: **Plik → Zapisz kopię…** albo `Ctrl+E`.

## Skróty klawiszowe

| Skrót | Działanie |
|---|---|
| `Ctrl+K` lub `/` | szukaj tablic |
| `Enter` | dodaj kartę albo punkt checklisty |
| `Enter` w nazwie tablicy, listy lub karty | zatwierdza zmianę i wraca do tablicy |
| `Esc` | zamknij okno karty, anuluj wpisywanie |
| `Ctrl+Delete` | usuwa otwartą kartę |
| `Ctrl+E` | zapisz kopię tablic |
| `Ctrl+I` | wczytaj kopię tablic |

## Jak pracować

| Element | Co można zrobić |
|---|---|
| Tablica | nowa, nazwa, duplikat, czyszczenie, usuwanie (✕ przy nazwie), kolejność przeciąganiem, wyszukiwanie |
| Lista | nowa, nazwa, czyszczenie, usuwanie (✕ przy nazwie), kolejność przeciąganiem |
| Karta | nowa, tytuł, opis, kategorie kolorowe, „wykonane”, usuwanie (✕ w rogu karty) |
| Checklista | punkty widoczne wprost na karcie, `1. 2. 3.`, `–`, `•` albo emotki, zaznaczanie gotowych, pasek postępu |
| Prawy przycisk myszy | na karcie: emotka punktacji, otwórz, duplikuj, usuń. Na tablicy: menu tablicy |
| Motywy | pastelowy, ciemny, cozy |
| Przygaszenie ekranu | przycisk motywu (prawy górny róg) → Wyłączone / Lekkie / Średnie / Mocne — ustawienie zostaje zapamiętane |

Wpisując na początku punktu `1.` albo `-`, punktacja sama się dopasowuje.

## Struktura projektu

```
electron/main.js        okno aplikacji, menu, pasek tytułu, zapis pliku z danymi
electron/preload.js     bezpieczne połączenie interfejsu z dyskiem
src/index.html          szkielet aplikacji
src/css/themes.css      3 motywy (zmienne CSS)
src/css/app.css         wygląd
src/js/seed.js          4 gotowe tablice na starcie
src/js/store.js         dane i wszystkie operacje na tablicach
src/js/ui.js            powiadomienia, potwierdzenia, rozwijane menu
src/js/dnd.js           przeciąganie i upuszczanie
src/js/sidebar.js       lista tablic, wyszukiwarka, usuwanie
src/js/board.js         listy, karty i checklista na tablicy
src/js/card.js          okno karty
src/js/app.js           start aplikacji, motyw paska tytułu
build/icon.png          ikona programu (piesek Shiba)
```

## Ponowne zbudowanie instalatora

```
npm run dist
```

Gotowe pliki pojawią się w folderze `release`.

### Gdyby budowanie się nie powiodło

`electron-builder` przy pierwszym uruchomieniu rozpakowuje dodatkowe narzędzia
i tworzy w tym celu dwa dowiązania (pliki dla Maca, niepotrzebne na Windowsie).
Windows pozwala na to tylko przy włączonym **Trybie dewelopera** albo przy
uruchomieniu z uprawnieniami administratora. Bez tego budowanie zatrzymuje się
komunikatem „Cannot create symbolic link”.

Obejście: włącz Tryb dewelopera w **Ustawieniach → System → Dla deweloperów**
albo uruchom `npm run dist` z terminala administratora.

Ikona programu: `build/icon.png` (piesek Shiba). Plik `build/icon.ico` powstaje
z niego narzędziem Electrona:

```
node_modules\app-builder-bin\win\x64\app-builder.exe icon --format ico --input build\icon.png --out build
```