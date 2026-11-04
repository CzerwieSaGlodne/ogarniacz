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

Po wdrożeniu nowej wersji na GitHub Pages zamknij aplikację i otwórz ją
ponownie (w razie potrzeby drugi raz). Nie trzeba niczego odinstalowywać ani
czyścić danych — tablice zostają na telefonie.

### Twoje dane na telefonie

Dane są w pamięci Chrome, więc **wyczyszczenie danych przeglądarki usuwa
tablice**. Dla bezpieczeństwa:

- menu **☰ → Zapisz kopię tablic** pobiera plik JSON do folderu Pobrane;
- menu **☰ → Wczytaj kopię tablic** przywraca tablice z pliku;
- w menu widać datę ostatniej kopii, a aplikacja przypomina o niej po tygodniu.

Kopię z komputera przeniesiesz tak: na komputerze **Plik → Zapisz kopię…**,
potem wyślij plik na telefon (Dysk Google, WhatsApp, kabel USB) i wczytaj go
w telefonie. W drugą stronę działa to samo.

## Automatyczna synchronizacja komputer ↔ telefon (Tailscale)

Od wersji **1.4.0** OGARNIACZ może sam przenosić zmiany między komputerem
i telefonem. Połączenie działa **tylko w Twojej prywatnej sieci Tailscale**:
dane nie trafiają do chmury, nie trzeba otwierać portów w routerze.

### Co jest potrzebne

- Tailscale zainstalowany i zalogowany na komputerze oraz na telefonie
  (na obu urządzeniach to samo konto),
- w panelu Tailscale włączone **MagicDNS** i **HTTPS Certificates**,
- OGARNIACZ 1.4.0 na komputerze i telefonie.

### Pierwsze połączenie

1. Na komputerze otwórz **Plik → Synchronizacja z telefonem…** i kliknij
   **Włącz synchronizację**.
2. Poczekaj, aż pojawi się adres typu
   `https://ogarniacz-desktop.tail….ts.net` oraz 6-cyfrowy **kod jednorazowy**.
   Jeśli zamiast tego jest ostrzeżenie o Tailscale, sprawdź, czy Tailscale jest
   włączony, a potem kliknij **Spróbuj ponownie**.
3. Na telefonie otwórz OGARNIACZA online (po aktualizacji może być potrzebne
   zamknięcie i ponowne otwarcie aplikacji), otwórz menu **☰** i wybierz
   **Synchronizacja**.
4. Przepisz adres komputera i kod. Przy pierwszym połączeniu zostaw zaznaczone
   **Zastąp dane tego telefonu danymi z komputera** — to najbezpieczniejszy
   wariant, jeśli komputer ma już Twoje tablice.
5. Po połączeniu oba urządzenia synchronizują się automatycznie, gdy aplikacja
   jest otwarta. Telefon dogoni zmiany po ponownym uruchomieniu.

Telefon nie synchronizuje się w tle, gdy aplikacja jest całkowicie zamknięta.
Po otwarciu łączy się ponownie i od razu dociąga zmiany.

### Zasobnik i autostart

Po włączeniu synchronizacji zamknięcie okna zostawia program w zasobniku
systemowym (ikona przy zegarze), żeby telefon nadal miał się z czym łączyć.
Opcję **Uruchamiaj przy starcie Windows** można wyłączyć w panelu
synchronizacji.

### Kopie bezpieczeństwa

Synchronizacja nie zastępuje kopii zapasowej. Przed pierwszą migracją
i przed synchronizacją, która zmienia dane, komputer zapisuje plik
`kopia-przed-….json` w folderze danych:

```
C:\Users\Natalia\AppData\Roaming\OGARNIACZ\
```

Przy pierwszym połączeniu telefon zapisuje też lokalną kopię sprzed zastąpienia
danych — można ją pobrać przyciskiem **Pobierz kopię sprzed połączenia**.
Nadal działają zwykłe kopie JSON: **Plik → Zapisz kopię…** na komputerze
i **☰ → Zapisz kopię tablic** na telefonie.

### Gdy synchronizacja nie działa

- Sprawdź, czy Tailscale jest włączony na obu urządzeniach.
- Wejdź na komputerze w panel synchronizacji i kliknij **Spróbuj ponownie**.
- Upewnij się, że w Tailscale włączone są **MagicDNS** i **HTTPS Certificates**.
- Adres musi zaczynać się od `https://` i kończyć na `.ts.net` (bez portu).
- Kod jest jednorazowy i wygasa po godzinie — kliknij **Nowy kod**.
- Jeśli komputer był wyłączony, telefon pokaże brak połączenia; po włączeniu
  komputera kolejna synchronizacja wykona się sama.

## Gesty na telefonie

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
electron/sync-server.js lokalny serwer synchronizacji i Tailscale Serve
src/index.html          szkielet aplikacji
src/css/themes.css      3 motywy (zmienne CSS)
src/css/app.css         wygląd desktopowy
src/css/mobile.css      wygląd telefonu, dotyk, pełnoekranowa karta
src/js/seed.js          5 gotowych tablic na starcie
src/js/storage.js       zapis: plik na komputerze, pamięć w przeglądarce
src/js/sync-core.js     scalanie zmian, znaczniki czasu i usunięcia
src/js/store.js         dane i wszystkie operacje na tablicach
src/js/ui.js            powiadomienia, potwierdzenia, rozwijane menu
src/js/dnd.js           przeciąganie myszką i przytrzymaniem palca
src/js/sidebar.js       lista tablic, wyszukiwarka, menu tablic
src/js/board.js         listy, karty i checklista na tablicy
src/js/card.js          okno karty
src/js/sync.js          panel synchronizacji na komputerze i telefonie
src/js/app.js           start aplikacji, motyw, kopie, szuflada telefonu
src/js/pwa.js           instalacja PWA, service worker i aktualizacje
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
