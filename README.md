# 🌡️ Smart Thermo Assistant

**Smart Thermo** to zaawansowany dashboard i asystent domowy, łączący sterowanie multimediami, monitoring pogody, integrację z Telegramem i diagnostykę systemową. Zaprojektowany do działania na Windows oraz Raspberry Pi/Linux.

![Status](https://img.shields.io/badge/Status-Active-success)
![Node](https://img.shields.io/badge/Node.js-v18%2B-green)
![Python](https://img.shields.io/badge/Python-3.10%2B-blue)
![License](https://img.shields.io/badge/License-MIT-orange)

---

## 🚀 Możliwości

* **🎵 Centrum Multimedialne:**
    * Sterowanie głośnością systemu (Windows/Linux).
    * Integracja z **Spotify** (OAuth).
    * Wykrywanie aktualnie odtwarzanych utworów (System & Browser).
    * Obsługa radia internetowego.
* **📡 Łączność:**
    * Skaner urządzeń **Bluetooth** (wykrywanie obecności domowników).
    * Integracja z botem **Telegram** (powiadomienia, wysyłanie notatek na ekran).
* **🌦️ Warunki Otoczenia:**
    * Pogoda (OpenWeatherMap).
    * Jakość powietrza (Air Quality).
    * Statystyki dzienne (Wykresy Chart.js).
* **🎨 Nowoczesny UI:**
    * Tryb Jasny / Ciemny (Dark/Light Mode).
    * Responsywny interfejs (Mobile/Desktop).
    * Animacje i szklane efekty (Glassmorphism).

---

## 📂 Struktura Projektu

Projekt został zoptymalizowany pod kątem separacji warstw (Frontend/Backend/Scripts).

```text
SmartThermo/
├── dist/               # Skompilowany kod serwera (generowany automatycznie)
├── public/             # 🌐 FRONTEND (Widoczny dla przeglądarki)
│   ├── js/             # Logika klienta (moduły, widgety)
│   ├── style-css/      # Style (main, modules, light-mode)
│   ├── media/          # Zasoby audio (muzyka)
│   ├── sounds/         # Dźwięki systemowe (alarmy, powiadomienia)
│   └── vapage.html     # Główny widok aplikacji
├── scripts/            # 🐍 BACKEND TOOLS (Python & Utils)
│   ├── control_media.py # Sterowanie mediami (WinSDK)
│   ├── get_media.py     # Pobieranie metadanych (Okładki, Tytuły)
│   └── nircmd.exe       # Narzędzie do głośności (Windows)
├── src/                # ⚙️ BACKEND CORE (TypeScript)
│   ├── routes/         # Endpointy API (Express)
│   ├── helpers/        # Funkcje pomocnicze
│   ├── server.ts       # Punkt startowy serwera
│   └── app.ts          # Konfiguracja Express
├── jsons/              # Baza danych (Historia notatek, ustawienia)
└── env-media/          # Wirtualne środowisko Python
```

---

## 🛠️ Wymagania

1. **Node.js**: Wersja 18 lub nowsza.
2. **Python**: Wersja 3.10+ (zalecane dla obsługi `winsdk`).
3. **System**: Windows 10/11 (dla pełnej obsługi multimediów) lub Linux (ograniczona obsługa WinSDK).

---

## 📥 Instalacja

### 1. Klonowanie i zależnosci Node.js

```bash
git clone https://github.com/TwojUser/SmartThermo.git
cd SmartThermo
npm install
```

### 2. Konfiguracja Python

Projekt wymaga środowiska wirtualnego dla skryptów obsługujących media w Windows.

```bash
# Tworzenie środowiska
python -m venv env-media

# Aktywacja (Windows)
.\env-media\Scripts\activate

# Instalacja zależności
pip install -r requirements.txt
```

### 3. Konfiguracja Zmiennych (.env)

Utwórz plik `.env` w głównym katalogu i uzupełnij go wg wzoru:

```ini
PORT=8888
CLOCK_FORMAT=24

# --- API POGODY ---
OPENWEATHER_API_KEY=twoj_klucz_openweather
LAT=50.06
LON=19.94

# --- SPOTIFY ---
SPOTIFY_CLIENT_ID=twoj_id
SPOTIFY_CLIENT_SECRET=twoj_sekret
SPOTIFY_REDIRECT_URI=http://localhost:8888/api/spotify/callback

# --- TELEGRAM BOT ---
TELEGRAM_BOT_TOKEN=twoj_token_bota
# Opcjonalnie (jeśli sieć blokuje API Telegrama):
# TELEGRAM_API_ROOT=https://twoje-proxy.com
```

---

## 🚀 Uruchamianie

W projekcie zdefiniowano proste komendy startowe w `package.json`.

### 👨‍💻 Tryb Deweloperski (Development)

Uruchamia serwer z funkcją "Hot Reload" (restartuje się po zmianie kodu) oraz wyświetla pełne logi i listę endpointów.

```bash
npm run dev
```

### 🏭 Tryb Produkcyjny (Production)

Automatycznie kompiluje kod TypeScript do folderu `dist` i uruchamia zoptymalizowaną wersję serwera.

```bash
npm start
```

---

## 📡 API Endpoints

Serwer udostępnia REST API. Oto najważniejsze punkty końcowe (dostępne po uruchomieniu):

| Metoda | Endpoint | Opis |
| --- | --- | --- |
| `GET` | `/` | Główny interfejs (Dashboard) |
| `GET` | `/api/weather` | Aktualna pogoda i prognoza |
| `GET` | `/api/media/now-playing` | Informacje o utworze (Tytuł, Autor, Okładka) |
| `POST` | `/api/media/control` | Sterowanie (Play, Pause, Volume, Next) |
| `GET` | `/api/notes/history` | Historia wiadomości z Telegrama |
| `GET` | `/api/bluetooth/scan` | Skanowanie urządzeń w pobliżu |

---

## 🐛 Troubleshooting

**1. Błąd: `Cannot find module ...` w Pythonie**  
Upewnij się, że folder `env-media` istnieje w głównym katalogu projektu, a ścieżki w `src/routes/media.ts` wskazują na `env-media/Scripts/python.exe`.

**2. Błąd: Nie widać okładek albumów**  
Skrypty Python w folderze `scripts/` muszą mieć dostęp do biblioteki `winsdk`. Sprawdź, czy zainstalowałeś `pip install winsdk`.

**3. Telegram nie działa**  
Sprawdź, czy Twój dostawca internetu nie blokuje `api.telegram.org`. W razie potrzeby użyj zmiennej `TELEGRAM_API_ROOT` w `.env`.

---

## 👨‍💻 Autor

**KrasKamil**  
Projekt rozwijany hobbystycznie. Pull requesty mile widziane!

