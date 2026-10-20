# OGARNIACZ

Program do tablic z zadaniami, w stylu Trello. Tablice, listy i karty można
przeciągać, karty mają checklistę widoczną od razu na tablicy, a całość ma 3
motywy w pełnych kolorach plus przełącznik przygaszenia ekranu.

OGARNIACZ działa w dwóch wersjach:

- **na komputerze** — program Electron, zapisuje dane w pliku `data.json`;
- **na telefonie** — aplikacja PWA instalowana z Chrome, zapisuje dane
  w pamięci przeglądarki. Wersja mobilna jest pod adresem:
  **https://czerwiesaglodne.github.io/ogarniacz/**

## Wersja na telefon (vivo X300 Pro i inne Androidy)

1. Otwórz w Chrome adres **https://czerwiesaglodne.github.io/ogarniacz/**
2. Otwórz menu Chrome **⋮** i wybierz **Dodaj do ekranu głównego** albo
   **Zainstaluj aplikację**.
3. Przy pierwszym uruchomieniu wybierz **Wczytaj kopię z komputera**, jeśli
   chcesz mieć swoje tablice, albo zacznij od pustej tablicy.

Aplikacja działa też bez internetu po pierwszym otwarciu. Hosting służy tylko
do pobrania programu — tablice zostają na telefonie.

### Twoje dane na telefonie

Dane są w pamięci Chrome, więc **wyczyszczenie danych przeglądarki usuwa
tablice**. Dla bezpieczeństwa:

- menu **☰ → Zapisz kopię tablic** pobiera plik JSON do folderu Pobrane;
- menu **☰ → Wczytaj kopię tablic** przywraca tablice z pliku;
- w menu widać datę ostatniej kopii, a aplikacja przypomina o niej po tygodniu.

Kopię z komputera przeniesiesz tak: na komputerze **Plik → Zapisz kopię…**,
potem wyślij plik na telefon (Dysk Google, WhatsApp, kabel USB) i wczytaj go
w telefonie. W drugą stronę działa to samo.

### Gesty na telefonie

| Gest | Działanie |
|---|---|
| przeciągnięcie palcem w bok | następna lista |
| przewinięcie listy w pionie | przewijanie kart |
| przytrzymanie karty i przeciągnięcie | przeniesienie karty |
| przytrzymanie nagłówka listy | zmiana kolejności list |
| przytrzymanie tablicy w menu **☰** | zmiana kolejności tablic |
| menu **⋯** na karcie | przenieś, duplikuj, emotka, usuń |
| przycisk wstecz | zamyka kartę albo menu, nie aplikację |
| menu **☰** | tablice, wyszukiwarka, kopie zapasowe |

## Uruchamianie na komputerze

Program instaluje się normalnie, przez plik `OGARNIACZ Setup 1.x.x.exe`
z folderu `release`. Po instalacji dostajesz ikonę na Pulpicie i w Menu Start.

Podczas pracy nad programem (bez instalacji) uruchom go w terminalu:

```
npm start
```

## Gdzie są moje dane na komputerze

Wszystkie tablice zapisywane są w jednym pliku:

```
C:\Users\Natalia\AppData\Roaming\OGARNIACZ\data.json
```

Plik jest zwykłym tekstem (JSON) — można go podejrzeć albo skopiować.
Adres znajdziesz też w aplikacji: menu **Pomoc → Gdzie są moje dane?**.

Aplikacja zapisuje się sama po każdej zmianie, więc nie trzeba nic klikać.
Kopia zapasowa: **Plik → Zapisz kopię…** albo `Ctrl+E`.

## Skróty klawiszowe (komputer)

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
src/css/app.css         wygląd desktopowy
src/css/mobile.css      wygląd telefonu, dotyk, pełnoekranowa karta
src/js/seed.js          4 gotowe tablice na starcie
src/js/storage.js       zapis: plik na komputerze, pamięć w przeglądarce
src/js/store.js         dane i wszystkie operacje na tablicach
src/js/ui.js            powiadomienia, potwierdzenia, rozwijane menu
src/js/dnd.js           przeciąganie myszką i przytrzymaniem palca
src/js/sidebar.js       lista tablic, wyszukiwarka, menu tablic
src/js/board.js         listy, karty i checklista na tablicy
src/js/card.js          okno karty
src/js/app.js           start aplikacji, motyw, kopie, szuflada telefonu
src/js/pwa.js           instalacja PWA i service worker
src/sw.js               tryb offline
src/manifest.webmanifest  dane aplikacji instalowanej na telefonie
src/assets/             logo i ikony PWA
.github/workflows/      automatyczna publikacja na GitHub Pages
build/icon.png          ikona programu (piesek Shiba)
```

## Publikacja wersji na telefon

Wersja mobilna publikuje się sama po każdym pushu do gałęzi `main` przez
GitHub Actions. Aby pierwszy raz ją włączyć:

1. wejdź w repozytorium **CzerwieSaGlodne/ogarniacz**;
2. **Settings → Pages**;
3. jako **Source** wybierz **GitHub Actions** (jeśli strona nie jest jeszcze
   włączona, workflow zrobi to sam).

Adres aplikacji: **https://czerwiesaglodne.github.io/ogarniacz/**

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
