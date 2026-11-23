# Moduły SmartThermo i wideodomofon

## Bieżący przepływ i kierunek rozwoju

```text
ESP32-CAM ── MJPEG ───────────────────────────────► przeglądarka
     └────── HTTP POST /api/intercom/ring ────────► Express ── Socket.IO ──► panel
ESP-I/O furtki/bramy (przyszły firmware) ◄───────────────┘
```

Aktualny szkic ESP32-CAM przesyła obraz MJPEG i raportuje naciśnięcie przycisku.
Sterowanie furtką i bramą wymaga przyszłego, osobnego ESP-I/O; kontrakt Socket.IO
serwera jest udokumentowany, ale firmware przekaźników nie istnieje.
Kompletna dokumentacja panelu, API, stanów, eventów i uruchomienia znajduje się w
[dokumentacji interkomu](./intercom.md), a schemat połączeń w
[instrukcji ESP](./intercom-esp-connection.md).

Docelowo serwer pozostaje centralnym rejestrem i pośrednikiem zdarzeń. Moduły ESP
nie powinny polegać na bezpośrednim połączeniu Wi-Fi między sobą. MQTT z retained
availability/LWT można dodać jako dalsze rozszerzenie; nie jest obecnym transportem
poleceń interkomu.

Na start obecny Express może przyjmować dzwonek przez `POST /api/intercom/ring`, a
ESP32-CAM może podawać MJPEG pod adresem `/stream`. Przy dodawaniu kolejnych
urządzeń warto przejść na Mosquitto i tematy w rodzaju:

- `smartthermo/v1/devices/<id>/state` — stan i pomiary, retained;
- `smartthermo/v1/devices/<id>/event` — zdarzenia, np. `doorbell.ring`;
- `smartthermo/v1/devices/<id>/command` — polecenia, z `requestId` i terminem ważności;
- `smartthermo/v1/devices/<id>/availability` — `online` / `offline`, retained + LWT.

Payload wspólny dla urządzeń: `{ "schema": 1, "deviceId": "...", "type": "...",
"timestamp": "...", "state": { ... } }`. Serwer mapuje `type` na frontendowy
moduł/kafelek. Nie należy wykonywać HTML dostarczonego przez ESP; frontend renderuje
znane typy urządzeń z własnych komponentów. Dzięki temu nowy czujnik temperatury
może pojawić się jako kafelek z pomiarem i dostępnością, bez dopisywania jego
szczegółów do `vapage.html`.

Proponowana struktura, gdy dojdzie warstwa MQTT i rejestr:

```text
firmware/
  esp32-cam/                 # podgląd obrazu; bez sterowania rygla
  esp32-node/                # przycisk, wejścia, wyjścia, czujniki
src/
  devices/                   # schemat, rejestr i transport MQTT
  routes/devices.ts          # HTTP API dla panelu
public/js/modules/devices/   # renderer kafelków wg znanego typu
docs/hardware/               # pinouty i schematy konkretnych płytek
```

Temperaturę warto modelować jako `sensor.temperature` z `value` i `unit`, a nie jako
specjalny endpoint dla każdej płytki. Intercom pozostaje typem domenowym, bo ma
zdarzenia, stan połączenia i polecenie otwarcia.

## Stan obecnej integracji

Panel używa `GET /api/intercom/status`, `POST /api/intercom/ring`,
`POST /api/intercom/answer`, `POST /api/intercom/dismiss` i `POST /api/intercom/unlock`.
`unlock` wymaga celu `gate` albo `wicket` i całkowitego czasu impulsu 1–15 sekund.
Otwieranie jest dostępne wyłącznie dla osobnego sterownika, który połączył się z
serwerem i potwierdził uruchomienie wyjścia. Bez takiego urządzenia API zwraca
`503 DEVICE_UNAVAILABLE`; nie symuluje sukcesu. Stan dzwonka i impulsy każdego
sterownika są niezależne.

Przyszły ESP-I/O łączy się z Socket.IO z obiektem auth
`{ "device": "gate" | "wicket", "apiKey": "<INTERCOM_GATE_KEY lub INTERCOM_WICKET_KEY>" }`.
Każdy cel musi mieć dokładnie jeden sterownik i osobny sekret serwerowy; brak
sekretu oznacza brak dostępności, a kilka sterowników dla jednego celu blokuje
polecenia. Serwer kieruje do niego
`doorbell:unlock:command` z `commandId`, `target`, `duration`, `requestedAt` i
`expiresAt`. Urządzenie musi odrzucić nieznany cel, powtórzone/nieaktualne polecenie
i każde polecenie po `expiresAt`; callback Socket.IO potwierdza
`{ "confirmed": true }` dopiero po wysterowaniu przekaźnika. Brak potwierdzenia
kończy się błędem API, a nie sukcesem. Serwer publikuje
`doorbell:unlock:requested`, `doorbell:unlock:confirmed` (także zgodnościowe
`doorbell:unlock`), `doorbell:unlock:failed` i `doorbell:unlock:ended`.
Zdarzenie `ended` oznacza wyłącznie koniec impulsu czasowego — bez czujnika położenia
nie potwierdza zamknięcia fizycznego skrzydła.

Dzwonek emituje `doorbell:ring`, odbiór panelu `doorbell:answered`, a wyciszenie
`doorbell:dismiss`; nieodebrane wywołanie wraca do idle po 30 sekundach.
„Odbierz” potwierdza tylko powiadomienie i nie tworzy toru rozmowy. ESP32-CAM daje
jednokierunkowy strumień obrazu MJPEG, nie audio ani WebRTC. Dwukierunkowa rozmowa
wymaga osobnego toru audio oraz WebRTC/SIP.

Panel korzysta wyłącznie z URL strumienia ESP32-CAM, który podaje użytkownik.
Nie włącza kamery telefonu ani laptopa i nie pokazuje fikcyjnego obrazu, gdy adres
jest nieustawiony lub kamera niedostępna.
