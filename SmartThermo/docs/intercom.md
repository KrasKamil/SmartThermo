# Wideodomofon SmartThermo

Dokument opisuje bieżący panel, API, Socket.IO, firmware kamery i ograniczenia
sprzętowe. Szczegółowe połączenia i procedura programowania płytek znajdują się w
[instrukcji podłączenia ESP](./intercom-esp-connection.md).

## Co działa obecnie

- Panel w `public/vapage.html` otwiera się z przycisku domofonu lub po zdarzeniu
  `doorbell:ring`.
- ESP32-CAM udostępnia jednokierunkowy obraz MJPEG oraz może wysłać zgłoszenie
  dzwonka do serwera.
- `POST /api/intercom/answer` odbiera powiadomienie w aplikacji; nie ustanawia
  rozmowy głosowej.
- Serwer obsługuje osobne cele `gate` i `wicket`, ale zwraca ich dostępność jako
  wyłączoną, dopóki dokładnie jeden uwierzytelniony sterownik danego celu nie jest
  połączony. Sam firmware ESP32-CAM nie obsługuje przekaźników.

## Przepływ i źródła prawdy

```text
ESP32-CAM ── MJPEG HTTP ───────────────────────────► przeglądarka
     └────── POST /api/intercom/ring ──► Express ──► Socket.IO ──► przeglądarka
ESP-I/O furtki ── uwierzytelnione Socket.IO ◄──────┤
ESP-I/O bramy  ── uwierzytelnione Socket.IO ◄──────┘
```

Stan dzwonka jest niezależny od impulsów sterowników. Każdy cel ma własną dostępność,
termin impulsu i timer; otwarcie bramy nie zmienia stanu furtki ani dzwonka.
`revision` porządkuje zmiany stanu, a interfejs ignoruje starsze odpowiedzi HTTP i
zdarzenia.

### Stany dzwonka

| Stan | Znaczenie |
|---|---|
| `idle` | Brak aktywnego dzwonienia. |
| `ringing` | Dzwonek oczekuje na odpowiedź; bez odpowiedzi wraca do `idle` po 30 s. |
| `answered` | Użytkownik potwierdził powiadomienie; obraz MJPEG nadal jest jednokierunkowy. |

`POST /api/intercom/dismiss` wycisza aktywny dzwonek lub kończy stan odebrany.
Zamknięcie panelu nie wycisza dzwonka. Dwa równoczesne żądania odbioru nie
przyjmują tego samego dzwonka dwa razy: kolejne żądanie otrzymuje `409`.

### Dostępność urządzeń

Każdy z `devices.gate` i `devices.wicket` w odpowiedzi statusu ma:

- `not_configured`: brak podłączonego sterownika;
- `ready`: dokładnie jeden sterownik jest podłączony;
- `multiple_devices`: podłączono więcej niż jeden sterownik dla celu, więc
  polecenia są blokowane;
- `pulse_active`: sterownik potwierdził aktywację impulsu.

`available` jest prawdziwe wyłącznie dla pojedynczego sterownika. Stan impulsu
oznacza potwierdzoną aktywację wyjścia, nie położenie fizycznego skrzydła.

## API HTTP

Wszystkie endpointy są pod `/api/intercom`. Trasy `/api` używają standardowego
nagłówka aplikacji `x-api-key`.

| Metoda i ścieżka | Żądanie | Wynik |
|---|---|---|
| `GET /status` | — | `success`, `data.callStatus`, zgodnościowe `data.status`, `revision`, `callId`, `devices` i `now`. |
| `POST /ring` | opcjonalne `{ "source": "ESP32-CAM-Furtka" }` | Ustawia `ringing`, nowy `callId`, emituje zdarzenie i uruchamia timeout 30 s. |
| `POST /answer` | — | Ustawia `answered`; zwraca `409`, jeśli nie ma aktywnego dzwonka. |
| `POST /dismiss` | — | Ustawia `idle`; zwraca `dismissed: false`, jeśli nie było aktywnego dzwonka. |
| `POST /unlock` | `{ "target": "gate", "duration": 5 }` (albo `wicket`) | Wysyła polecenie do sterownika i zwraca sukces wyłącznie po poprawnym ACK. |

`duration` musi być liczbą całkowitą z zakresu 1–15 sekund, a `target` jest
wymagany. Odpowiedzi błędów polecenia:

| HTTP | Kod | Znaczenie |
|---:|---|---|
| `400` | — | Nieprawidłowy cel albo czas. |
| `409` | `MULTIPLE_DEVICES` / `COMMAND_IN_PROGRESS` | Niejednoznaczny sterownik lub już oczekujące polecenie dla tego celu. |
| `502` | `DEVICE_NOT_CONFIRMED` / `DEVICE_ACK_EXPIRED` | Brak pozytywnego ACK albo ACK dotarło po terminie polecenia. |
| `503` | `DEVICE_UNAVAILABLE` | Brak połączonego sterownika. |
| `504` | `DEVICE_ACK_TIMEOUT` | Sterownik nie potwierdził polecenia w ciągu 5 s. |

Nie interpretuj samego `doorbell:unlock:requested` jako sukcesu. Dopiero
`doorbell:unlock:confirmed` i odpowiedź HTTP `success: true` oznaczają ACK
sterownika. Nie wysyłaj polecenia ponownie automatycznie po timeout: urządzenie
mogło aktywować wyjście, a odpowiedź mogła zaginąć.

## Zdarzenia Socket.IO

| Zdarzenie | Kierunek / znaczenie |
|---|---|
| `doorbell:ring` | Serwer → panel: dzwonek, `source`, `callId`, `revision`, `timestamp`. |
| `doorbell:answered` | Serwer → panel: odebrano powiadomienie. |
| `doorbell:idle` | Serwer → panel: upłynął timeout nieodebranego dzwonka. |
| `doorbell:dismiss` | Serwer → panel: wyciszenie/odrzucenie. |
| `doorbell:device:availability` | Serwer → panel: dostępność `gate` albo `wicket`. |
| `doorbell:unlock:requested` | Serwer → panel/monitoring: polecenie wysłane do sterownika, jeszcze niepotwierdzone. |
| `doorbell:unlock:command` | Serwer → sterownik: `commandId`, `target`, `duration`, `requestedAt`, `expiresAt`; wymaga ACK Socket.IO. |
| `doorbell:unlock:confirmed` | Serwer → panel: sterownik potwierdził aktywację wyjścia. |
| `doorbell:unlock` | Zgodnościowy alias zdarzenia potwierdzonego otwarcia. |
| `doorbell:unlock:failed` | Serwer → panel/monitoring: polecenie niepotwierdzone, spóźnione lub timeout. |
| `doorbell:unlock:ended` | Serwer → panel: upłynął czas impulsu. Nie oznacza potwierdzenia zamknięcia fizycznego. |

Panel pobiera ponownie `GET /status` przy połączeniu i każdym reconnect Socket.IO.
Serwer ustala dostępność urządzenia na podstawie uwierzytelnionego pokoju
Socket.IO.

## Uwierzytelnianie sterownika

Sterownik Socket.IO przedstawia w handshake:

```json
{
  "device": "gate",
  "apiKey": "<sekret INTERCOM_GATE_KEY>"
}
```

Dla furtki użyj `device: "wicket"` i osobnego `INTERCOM_WICKET_KEY`. Sekrety
konfiguruje się wyłącznie po stronie serwera; nie wolno umieszczać ich w
`public/config.js`, HTML ani kodzie panelu. Brak sekretu oznacza odrzucenie
sterownika. Dla wdrożenia produkcyjnego ustaw również nieprzewidywalny `API_KEY`
i nie wystawiaj kamery ani serwera API bezpośrednio do publicznego Internetu.

## Kamera, audio i dostępność

W Ustawieniach systemu wpisuje się pełny adres strumienia, zwykle
`http://<IP-ESP32-CAM>:81/stream`. Serwerowy `INTERCOM_STREAM_URL` jest wartością
domyślną; lokalne nadpisanie zapisane w przeglądarce ma pierwszeństwo. Przycisk
„Użyj domyślnego adresu serwera” usuwa nadpisanie. Panel wyświetla osobny komunikat
podczas łączenia, przy braku adresu oraz przy błędzie obrazu. Nie używa lokalnej
kamery komputera ani telefonu i nie pokazuje obrazu zastępczego udającego kamerę
furtki.

Przy stronie działającej po HTTPS przeglądarka może zablokować kamerę HTTP jako
mixed content. Użyj wtedy zaufanego reverse proxy z HTTPS. Strumień jest obrazem
MJPEG, bez dźwięku. Nie ma podłączonego mikrofonu, głośnika, WebRTC ani SIP;
przycisk „Odbierz” nie rozpoczyna rozmowy.

Panel jest zaprojektowany mobilnie i przewija się wewnątrz ekranu, gdy treść nie
mieści się w krótkim widoku. Gest przesunięcia odbiera wyłącznie powiadomienie;
osobny przycisk zapewnia alternatywę dotykową i klawiaturową. Przyciski otwarcia są
wyłączone bez dostępnego sterownika.

Panel dziedziczy globalny motyw aplikacji (`body.light-mode`). Dźwięk domofonu to
własna, generowana przez Web Audio melodyjna sekwencja czterech tonów (nie
współdzieli pliku powiadomień Telegrama). Powtarza się podczas aktywnego
`ringing` i zatrzymuje po odebraniu, wyciszeniu albo timeoutcie. Panel ignoruje
stany `ringing` bez znacznika czasu lub starsze niż 30 sekund, a backend wygasza
również przeterminowany stan przy odczycie statusu. Ustawienie dźwięku jest
lokalne dla przeglądarki. Autoplay może być blokowany do pierwszej interakcji
użytkownika; przycisk testu w Ustawieniach pozwala sprawdzić/odblokować
odtwarzanie.

## Uruchomienie lokalne i testy

Serwer wymaga Node.js i dostępnej bazy MongoDB. Kod startowy odczytuje
`MONGO_URL`; ustaw również `PORT` (domyślnie `8888`), klucze API i opcjonalne
`INTERCOM_STREAM_URL=http://<IP-ESP32-CAM>:81/stream` w lokalnym `.env`.
Nie zapisuj rzeczywistych sekretów w dokumentacji ani repozytorium.

```powershell
npm install
$env:PORT = "8888"
npm run dev
```

Panel: `http://localhost:8888/vapage.html`. Po uruchomieniu sprawdź status
`GET /api/intercom/status`. Testowe wywołanie dzwonka można wykonać przez
`POST /api/intercom/ring`; użyj istniejącego nagłówka aplikacji `x-api-key`.
Zdarzenie otworzy panel na wszystkich połączonych klientach, tak samo jak zgłoszenie
z ESP32-CAM. Nie ma automatycznego testowego dzwonienia przy każdym wejściu na
stronę; wywołanie testowe jest jawne:

```powershell
$headers = @{ "x-api-key" = "<API_KEY>" }
Invoke-RestMethod -Uri "http://localhost:8888/api/intercom/ring" `
  -Method Post -Headers $headers -ContentType "application/json" `
  -Body '{"source":"Test ręczny"}'
```

Nie uruchamiaj testu otwierania na prawdziwym sterowniku bez sprawdzenia okablowania.

```powershell
npm test
npm run build
npm run lint
```

## Ograniczenia i następne kroki

Aktualny szkic ESP32-CAM realizuje obraz i wejście dzwonka. Nie zawiera klienta
Socket.IO sterownika, obsługi wyjścia przekaźnika ani czujnika położenia. Kontrakt
serwera jest przygotowany, lecz oprogramowanie ESP-I/O i jego testy sprzętowe
pozostają do wykonania. Przed aktywacją należy dodać sprzętowe ograniczenie
impulsu, bezpieczny stan po restarcie i utracie sieci, deduplikację `commandId`,
walidację terminu `expiresAt` oraz testy z rzeczywistym sterownikiem. Szczegóły
przewodów i procedury uruchomienia opisuje
[instrukcja podłączenia ESP](./intercom-esp-connection.md).
