# ESP32-CAM doorbell prototype

This sketch targets the AI Thinker ESP32-CAM with OV2640 and PSRAM. It provides a
local MJPEG feed and reports a GPIO13 button press to the existing SmartThermo API.
The camera and button are on one board in this prototype; relay outputs require a
separate ESP-I/O board and are not implemented by this sketch.
For the complete Polish wiring, commissioning and safety guide, see
[`../../docs/intercom-esp-connection.md`](../../docs/intercom-esp-connection.md).

## Configure and upload

1. Install Arduino IDE with the Espressif ESP32 board package (3.x), then select
   **AI Thinker ESP32-CAM**.
2. Edit the Wi-Fi name/password, the SmartThermo server's LAN IP and port, and the
   API key in the `.ino` file. The API key must match `API_KEY` in the server's `.env`.
   If `API_KEY` is unset, the current server falls back to `default_key`.
3. Connect a 3.3 V logic USB-UART adapter: adapter TX → `U0R`, adapter RX → `U0T`,
   and GND → GND. Power the board through its 5V pin from a stable 5 V supply with
   at least 1 A available. Connect `IO0` to GND while uploading, then disconnect it
   and reset the board to boot normally. Never feed 5 V into UART logic pins.
4. Connect a momentary button between GPIO13 and GND. Do not use the SD card slot;
   its signals overlap GPIO13.
5. Open Serial Monitor at 115200 baud and note the assigned IP. In System Settings,
   save `http://<IP>:81/stream` as the intercom camera URL, or set
   `INTERCOM_STREAM_URL=http://<IP>:81/stream` in the server `.env`. Port 80 serves
   a simple preview page.

The device calls `POST /api/intercom/ring` with `x-api-key` when the button is
pressed. Keep the camera and server on a trusted LAN; this prototype sends HTTP
without TLS and embeds the API key in firmware, where it can be extracted. Do not
expose the camera or API directly to the public internet. For a deployed multi-device
setup, use per-device credentials and MQTT with TLS instead of a shared API key.

This board only sends doorbell events and video. It does not operate the gate lock.

## Separate gate/wicket actuator contract

The current ESP32-CAM sketch is not an actuator and will not make the panel's gate
or wicket controls available. Add a separate, safety-designed ESP-I/O controller
before enabling either action. That controller must connect to SmartThermo's
Socket.IO server with auth `{ device: "gate" | "wicket", apiKey: "<INTERCOM_GATE_KEY or INTERCOM_WICKET_KEY>" }`.
It receives `doorbell:unlock:command` with a unique `commandId`, its own target,
an integer duration in seconds, and an absolute `expiresAt`. It must validate the
target, reject expired or duplicate IDs, drive only its own isolated relay output,
and acknowledge `{ confirmed: true }` only after the output has actually been
activated. No acknowledgement means the API reports a failure. The server emits
`doorbell:unlock:confirmed` and `doorbell:unlock:ended`; the latter means the
configured relay pulse elapsed, not that a physical gate/wicket position sensor
confirmed closure.

The API currently reports both actuators unavailable unless exactly one controller
for that target is authenticated and connected. Keep relay design, dry-contact wiring,
over-current protection, default-off startup, and installation review separate
from this camera-only sketch.
