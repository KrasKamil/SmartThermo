# Smart Thermo

Smart Thermo to nowoczesny system asystenta termicznego z interfejsem webowym, obsługą audio, Spotify, Bluetooth, pogodą i sterowaniem systemowym.

## Wymagania
- Node.js (zalecane: v18+)
- Python 3.10+ (zalecane venv)
- npm
- Przeglądarka Chrome/Edge/Firefox

## Struktura projektu
- `env-media/` — wirtualne środowisko Python do obsługi audio/systemu
- `venv/` — drugie środowisko Python do pozostałych skryptów
- `src/` — backend Node.js (TypeScript, API, serwer)
- `js/` — frontend JavaScript (widgety, UI)
- `style-css/` — style CSS (dark/light, animacje)
- `vapage.html` — główny plik strony
- `.env` — konfiguracja środowiska (np. klucze API, porty)
- `requirements.txt` — zależności Python
- `package.json` — zależności Node.js
- `get_media.py`, `control_media.py` — skrypty do obsługi audio/systemu
- `universal_logger.py` — logowanie i monitoring
- `nircmd.exe` — narzędzie do sterowania systemem Windows

## Funkcje
- Odtwarzanie muzyki z systemu, Spotify, Bluetooth
- Widgety: Spotify, radio, pogoda, sterowanie audio
- Sterowanie systemem (play/pause, głośność, next/prev)
- Obsługa API pogodowego
- Logowanie zdarzeń i błędów
- Tryb jasny/ciemny, nowoczesny UI
- Integracja z .env (klucze, porty, konfiguracja)

## Instalacja

### 1. Utwórz dwa środowiska Python

```bash
python -m venv env-media
python -m venv venv
```

Zainstaluj zależności:

```bash
# Aktywuj env-media
source env-media/bin/activate  # Linux/Mac
env-media\Scripts\activate    # Windows
pip install -r requirements.txt

# Aktywuj venv
source venv/bin/activate  # Linux/Mac
venv\Scripts\activate    # Windows
pip install -r requirements.txt
```

### 2. Instalacja zależności Node.js

```bash
npm install
```

### 3. Konfiguracja pliku `.env`

Utwórz plik `.env` w głównym katalogu i dodaj wymagane zmienne środowiskowe, np.:

```
PORT=8080
SPOTIFY_CLIENT_ID=twoj_client_id
SPOTIFY_CLIENT_SECRET=twoj_client_secret
API_KEY=twoj_api_key
```

### 4. Budowanie i uruchamianie strony

#### Backend (Node.js)

```bash
npm run build   # kompilacja TypeScript
npm start       # uruchomienie serwera
```

#### Frontend

Plik `vapage.html` jest główną stroną. Skrypty JS i CSS są ładowane automatycznie.

#### Python (media/system)

Aktywuj środowisko `env-media` i uruchom odpowiednie skrypty (np. obsługa audio, API systemowe).

## Użytkowanie
- Strona dostępna pod adresem `http://localhost:PORT` (PORT z `.env`)
- Widgety: Spotify, radio, pogoda, sterowanie audio
- Możliwość sterowania systemem i odtwarzaniem muzyki
- Logi dostępne w pliku `universal_logger.py` oraz konsoli
- Obsługa przez przeglądarkę i API

## Integracje i API
- Spotify: wymaga kluczy w `.env`
- Pogoda: wymaga klucza API
- Bluetooth: obsługa przez system i JS
- System audio: obsługa przez skrypty Python i nircmd.exe

## Testowanie
- Testy manualne: uruchom stronę, sprawdź widgety, API, sterowanie
- Logi błędów i zdarzeń: sprawdź plik logów oraz konsolę
- W razie problemów sprawdź:
  - Poprawność pliku `.env`
  - Aktywację odpowiedniego venv
  - Dostępność portu
  - Uprawnienia do nircmd.exe

## FAQ
**Jak zmienić port?**
Zmień wartość `PORT` w pliku `.env`.

**Jak dodać własny widget?**
Dodaj plik JS w folderze `js/modules/` i zarejestruj w `main.js`.

**Jak dodać nową integrację API?**
Dodaj klucz do `.env`, napisz obsługę w `src/routes/` i frontend w `js/modules/`.

**Jak uruchomić tylko backend?**
`npm start` (Node.js)

**Jak uruchomić tylko skrypty Python?**
Aktywuj odpowiedni venv i uruchom skrypt np. `python get_media.py`

## Przykłady użycia
- Odtwarzanie muzyki: kliknij Spotify lub radio, steruj z poziomu strony
- Zmiana głośności: użyj suwaka w ustawieniach
- Aktualizacja pogody: kliknij Update Data
- Sterowanie systemem: przyciski play/pause/next/prev

## Troubleshooting
- Sprawdź logi w konsoli i pliku logów
- Upewnij się, że oba venvy są aktywne
- Sprawdź uprawnienia do plików i portów
- W razie problemów z API sprawdź klucze w `.env`

## Dokumentacja i linki
- [Node.js](https://nodejs.org/)
- [Python](https://www.python.org/)
- [Spotify API](https://developer.spotify.com/documentation/web-api/)
- [Chart.js](https://www.chartjs.org/)
- [TypeScript](https://www.typescriptlang.org/)

## Autor
KrasKamil

---
Jeśli masz pytania lub chcesz rozwinąć projekt, napisz na GitHub!

