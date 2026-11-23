# Podłączenie ESP do wideodomofonu SmartThermo

Ten dokument rozróżnia działający prototyp ESP32-CAM od planowanego sterownika
przekaźników. **Obecnie nie ma firmware ESP-I/O obsługującego bramę ani furtkę**;
instrukcja wyjść opisuje wymagania elektryczne przyszłego montażu, a nie gotową
funkcję do uruchomienia. Szczegóły API i zdarzeń są w
[dokumentacji interkomu](./intercom.md).

## Bezpieczeństwo

- Odłącz zasilanie przed okablowaniem. Sprawdź instrukcję konkretnego napędu,
  modułu przekaźnikowego i płytki.
- GPIO ESP32 pracują z logiką 3,3 V. Nigdy nie doprowadzaj do nich 5 V, napięcia
  sterownika bramy ani napięcia sieciowego.
- ESP nie zasila elektrozaczepu ani silnika. Sterowanie napędem może być wykonane
  wyłącznie izolowanym **suchym stykiem** na wejściu przycisku sterownika, jeśli
  instrukcja napędu dopuszcza takie podłączenie.
- Nie podłączaj GPIO ani styków modułu do sieci 230 V. Nie mostkuj nieznanych
  zacisków, nie obchodź fotokomórek, krańcówek ani zabezpieczeń napędu.
- Zaciski, polaryzacja, dopuszczalne napięcie wejścia i dobór zasilacza zależą od
  konkretnego urządzenia. Instalację do istniejącego napędu powinien wykonać
  wykwalifikowany instalator.

## Wymagany sprzęt

### Obraz i przycisk dzwonka

- AI Thinker ESP32-CAM, OV2640 i PSRAM;
- stabilizowane zasilanie 5 V z zapasem prądowym co najmniej 1 A;
- adapter USB–UART z logiką 3,3 V do wgrywania i logów;
- przycisk chwilowy między GPIO13 i GND.

### Przyszłe sterowanie

- osobny ESP32 DevKit dla furtki i osobny ESP32 DevKit dla bramy (jeden
  uwierzytelniony sterownik na cel);
- moduł przekaźnikowy/driver z wejściem zgodnym z 3,3 V, z bezpiecznym stanem
  wyłączonym przy starcie i utracie zasilania;
- istniejący sterownik napędu z wejściem chwilowego przycisku i dokumentacją
  zacisków. Nie używaj zacisków zasilających silnik lub elektrozaczep.

## A. ESP32-CAM: wgranie kamery i dzwonka

Szkic znajduje się w
[`firmware/esp32-cam-doorbell/esp32-cam-doorbell.ino`](../firmware/esp32-cam-doorbell/esp32-cam-doorbell.ino).
Jest przeznaczony dla AI Thinker ESP32-CAM i Arduino-ESP32 core 3.x.

### Okablowanie

| ESP32-CAM | Podłączenie |
|---|---|
| 5V | Stabilizowane zasilanie 5 V; nie zasilaj z pinu 3,3 V adaptera UART. |
| GND | Masa zasilacza oraz wspólna masa adaptera UART. |
| U0R / RX | TX adaptera USB–UART (logika 3,3 V). |
| U0T / TX | RX adaptera USB–UART (logika 3,3 V). |
| GPIO13 | Jeden styk przycisku chwilowego; drugi styk przycisku do GND. |
| IO0 | Do GND tylko na czas wgrywania szkicu. Odłącz przed normalnym startem. |

Kamera OV2640 wpina się taśmą w złącze kamery — nie łączy się jej przewodami z
GPIO. GPIO13 współdzieli piny ze slotem karty SD; podczas pracy przycisku nie
instaluj karty SD.

### Programowanie i konfiguracja

1. W Arduino IDE wybierz **AI Thinker ESP32-CAM** oraz zainstaluj pakiet płytek
   Espressif ESP32 w wersji 3.x.
2. W szkicu lokalnie wpisz SSID/hasło Wi-Fi, adres i port serwera SmartThermo oraz
   `SMARTTHERMO_API_KEY` zgodny z `API_KEY` serwera. Nie zapisuj prawdziwych danych
   w repozytorium i nie udostępniaj ich w zrzutach ekranu.
3. Podczas wgrywania połącz IO0 z GND, wgraj szkic, odłącz IO0 od GND i zresetuj
   płytkę. Linie UART muszą mieć logikę 3,3 V.
4. Otwórz Serial Monitor z prędkością 115200 baud. Po połączeniu Wi-Fi szkic
   wypisze przydzielony adres IP.
5. Strumień obrazu będzie dostępny pod `http://<IP-ESP32-CAM>:81/stream`, a strona
   podglądowa pod `http://<IP-ESP32-CAM>/`. W Ustawieniach systemu zapisz pełny URL
   `/stream` albo ustaw `INTERCOM_STREAM_URL=http://<IP-ESP32-CAM>:81/stream` w
   serwerowym `.env`. Wartość z `.env` jest domyślna; zapisane ustawienie
   przeglądarki ma pierwszeństwo.
6. Naciśnięcie GPIO13 wysyła `POST /api/intercom/ring` z nagłówkiem `x-api-key`.
   Serwer emituje dzwonek do panelu; wywołanie nie włącza audio.

Kamera i panel muszą mieć dostępną trasę sieciową między sobą. HTTP w tej wersji
nie szyfruje obrazu ani klucza. Ogranicz urządzenia do zaufanej sieci lokalnej;
nie wystawiaj portu kamery ani API bezpośrednio do Internetu. Gdy panel działa po
HTTPS, przeglądarka może zablokować kamerę HTTP jako mixed content — potrzebny
będzie reverse proxy z HTTPS.

## B. Przyszły ESP-I/O: wejście i przekaźnik

Poniższe piny są propozycją dla ESP32 DevKit; sprawdź oznaczenia i schemat
konkretnej płytki. Dla każdej bramy/furtki przewidziany jest oddzielny kontroler,
który łączy się jako `device: "gate"` albo `device: "wicket"`.

| ESP32 DevKit | Połączenie logiczne | Uwagi |
|---|---|---|
| GPIO27 | Opcjonalny przycisk chwilowy do GND | Firmware musi skonfigurować `INPUT_PULLUP` i debounce. To nie jest aktualnie wejście używane przez szkic ESP32-CAM. |
| GPIO26 | Wejście `IN` kompatybilnego modułu przekaźnika | Wyłącznie sterowanie logiczne; pin ma pozostać w stanie wyłączonym podczas startu i błędów. |
| GND | GND modułu | Tylko jeśli wejście modułu wymaga wspólnej masy; przy izolowanym wejściu zachowaj izolację wg instrukcji modułu. |
| 5V/USB | Zasilanie DevKit | Użyj osobnego, odpowiedniego zasilacza. Nie zasilaj napędu z płytki ESP. |

Styk przekaźnika modułu (COM i NO) może być połączony równolegle z wejściem
chwilowego przycisku sterownika napędu **wyłącznie po potwierdzeniu w dokumentacji
napędu**, że jest to wejście bezpotencjałowe niskiego napięcia. W stanie spoczynku
NO ma pozostać otwarty. Nie podawaj napięcia ESP ani zasilacza na te zaciski:
moduł ma jedynie naśladować styk przycisku. Wybór COM/NO/NC, izolacji, obudowy,
bezpieczników i przewodów należy do instalatora.

Nie podłączaj GPIO26 bezpośrednio do cewki przekaźnika, zamka ani napędu.
Nie podłączaj wyjścia modułu bezpośrednio do elektrozaczepu. Nie używaj tej
propozycji bez sprawdzenia prądu wejścia modułu i zgodności z logiką 3,3 V.

### Wymagania dla firmware sterownika (jeszcze do napisania)

1. Ustaw wyjście przekaźnika jako wyłączone przed uruchomieniem Wi-Fi.
2. Połącz Socket.IO z handshake `{ device: "gate", apiKey: "<INTERCOM_GATE_KEY>" }`
   albo analogicznym kluczem furtki. Klucze `INTERCOM_GATE_KEY` i
   `INTERCOM_WICKET_KEY` ustaw po stronie serwera; są różne i nie należą do
   `public/config.js`.
3. Obsłuż `doorbell:unlock:command`. Zweryfikuj własny `target`, unikalny
   `commandId`, całkowitą długość impulsu 1–15 s i absolutny termin `expiresAt`.
   Odrzuć polecenia powtórzone, nieznane lub spóźnione.
4. Uaktywnij tylko przypisane wyjście na żądany krótki impuls. Zastosuj limit
   sprzętowy/programowy, watchdog i bezpieczny stan po restarcie/utracie sieci.
5. Callback Socket.IO zwróć jako `{ "confirmed": true }` dopiero po potwierdzeniu
   aktywacji wyjścia. Nie potwierdzaj jedynie odebrania pakietu.
6. Nie raportuj zamknięcia fizycznego bez osobnego czujnika położenia. Serwerowe
   `doorbell:unlock:ended` oznacza wyłącznie koniec czasu impulsu.

Backend blokuje polecenie, gdy nie ma dokładnie jednego sterownika danego celu.
Do czasu powstania i przetestowania firmware ESP-I/O przyciski furtki i bramy w
panelu pozostają nieaktywne. Nie wgrywaj programu sterującego przekaźnikiem bez
walidacji instalatora i testu z odłączonym napędem.

## Uruchomienie i kontrola

1. Uruchom SmartThermo z poprawnym `MONGO_URL` i `PORT`; szczegóły opisuje
   [dokumentacja interkomu](./intercom.md#uruchomienie-lokalne-i-testy).
2. Otwórz `http://localhost:<PORT>/vapage.html`, wybierz panel domofonu i sprawdź,
   że bez zapisanej kamery widoczny jest komunikat o braku URL.
3. Ustaw URL strumienia, sprawdź widok ESP32-CAM i naciśnij przycisk GPIO13.
   Panel powinien pokazać „Ktoś dzwoni” i odtworzyć dźwięk, jeśli przeglądarka
   zezwala na autoplay. Bez odpowiedzi serwer wraca do `idle` po 30 sekundach.
4. Sprawdź `GET /api/intercom/status`: stan połączenia i `devices.gate`/
   `devices.wicket` są niezależne. Bez ESP-I/O dostępność obu celów ma być `false`.
5. Nie testuj fizycznego otwarcia, dopóki osobny firmware sterownika nie przejdzie
   testów odbioru ACK, timeoutu, restartu, utraty sieci i zachowania bez zasilania.

## Rozwiązywanie problemów

| Objaw | Sprawdź |
|---|---|
| Kamera nie ładuje obrazu | IP, Wi-Fi, zasilanie 5 V, log z Serial Monitora, URL `:81/stream`, mixed content HTTPS/HTTP. |
| Dzwonek nie dociera | GPIO13 do GND, brak karty SD, adres/port API, `API_KEY`, dostęp do sieci i log HTTP urządzenia. |
| Panel pokazuje brak serwera | Czy proces SmartThermo działa, poprawny `PORT`, API key strony oraz Socket.IO. |
| Przyciski otwarcia są wyłączone | To stan prawidłowy bez firmware ESP-I/O; sprawdź osobne sekrety i pojedynczy sterownik dla danego celu. |
| Polecenie nie ma potwierdzenia | Sterownik musi ACK-ować dopiero po aktywacji wyjścia; sprawdź `commandId`, termin `expiresAt` i połączenie Socket.IO. |
| Obraz działa, ale brak rozmowy | To oczekiwane: MJPEG przenosi tylko obraz; audio/WebRTC/SIP nie są zaimplementowane. |
