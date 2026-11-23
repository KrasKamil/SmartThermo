// Target: AI Thinker ESP32-CAM, Arduino-ESP32 core 3.x.
// Camera stream: http://<device-ip>:81/stream
// Doorbell input: momentary button from GPIO13 to GND (no SD card installed).

#include "esp_camera.h"
#include "esp_http_server.h"
#include <HTTPClient.h>
#include <WiFi.h>

// Fill these in locally. Keep this device on the trusted LAN.
const char *WIFI_SSID = "YOUR_WIFI_SSID";
const char *WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char *SMARTTHERMO_URL = "http://192.168.1.10:8888";
const char *SMARTTHERMO_API_KEY = "REPLACE_WITH_API_KEY";

constexpr int DOORBELL_PIN = 13;
constexpr uint32_t DEBOUNCE_MS = 60;
constexpr uint32_t RING_COOLDOWN_MS = 1500;

// AI Thinker ESP32-CAM camera pin map.
camera_config_t cameraConfig = {
    .pin_pwdn = 32,
    .pin_reset = -1,
    .pin_xclk = 0,
    .pin_sccb_sda = 26,
    .pin_sccb_scl = 27,
    .pin_d7 = 35,
    .pin_d6 = 34,
    .pin_d5 = 39,
    .pin_d4 = 36,
    .pin_d3 = 21,
    .pin_d2 = 19,
    .pin_d1 = 18,
    .pin_d0 = 5,
    .pin_vsync = 25,
    .pin_href = 23,
    .pin_pclk = 22,
    .xclk_freq_hz = 20000000,
    .ledc_timer = LEDC_TIMER_0,
    .ledc_channel = LEDC_CHANNEL_0,
    .pixel_format = PIXFORMAT_JPEG,
    .frame_size = FRAMESIZE_VGA,
    .jpeg_quality = 12,
    .fb_count = 2,
    .fb_location = CAMERA_FB_IN_PSRAM,
    .grab_mode = CAMERA_GRAB_LATEST,
};

httpd_handle_t streamServer = nullptr;
httpd_handle_t pageServer = nullptr;
bool rawButtonState = HIGH;
bool stableButtonState = HIGH;
uint32_t lastButtonChange = 0;
uint32_t lastRingSent = 0;

static const char *STREAM_TYPE = "multipart/x-mixed-replace;boundary=frame";

static esp_err_t streamHandler(httpd_req_t *request) {
    esp_err_t result = httpd_resp_set_type(request, STREAM_TYPE);
    if (result != ESP_OK) return result;
    httpd_resp_set_hdr(request, "Access-Control-Allow-Origin", "*");
    httpd_resp_set_hdr(request, "Cache-Control", "no-store");

    char partHeader[80];
    while (true) {
        camera_fb_t *frame = esp_camera_fb_get();
        if (!frame) return ESP_FAIL;

        result = httpd_resp_send_chunk(request, "\r\n--frame\r\n", 11);
        if (result == ESP_OK) {
            const int headerLength = snprintf(partHeader, sizeof(partHeader),
                "Content-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n",
                static_cast<unsigned>(frame->len));
            result = httpd_resp_send_chunk(request, partHeader, headerLength);
        }
        if (result == ESP_OK) {
            result = httpd_resp_send_chunk(request,
                reinterpret_cast<const char *>(frame->buf), frame->len);
        }
        esp_camera_fb_return(frame);
        if (result != ESP_OK) break;
        delay(1);
    }
    httpd_resp_send_chunk(request, nullptr, 0);
    return result;
}

static esp_err_t indexHandler(httpd_req_t *request) {
    const String html = String("<!doctype html><meta name='viewport' content='width=device-width'>") +
        "<title>SmartThermo Doorbell</title><img style='width:100%;max-width:800px' src='http://" +
        WiFi.localIP().toString() + ":81/stream'>";
    httpd_resp_set_type(request, "text/html; charset=utf-8");
    return httpd_resp_send(request, html.c_str(), html.length());
}

static bool startCamera() {
    if (!psramFound()) {
        Serial.println("PSRAM not found; camera needs an AI Thinker board with PSRAM.");
        return false;
    }
    const esp_err_t result = esp_camera_init(&cameraConfig);
    if (result != ESP_OK) {
        Serial.printf("Camera init failed: 0x%x\n", result);
        return false;
    }
    return true;
}

static void startServers() {
    httpd_config_t streamConfig = HTTPD_DEFAULT_CONFIG();
    streamConfig.server_port = 81;
    streamConfig.ctrl_port = 32769;
    streamConfig.max_uri_handlers = 4;
    httpd_uri_t streamUri = { .uri = "/stream", .method = HTTP_GET,
        .handler = streamHandler, .user_ctx = nullptr };
    if (httpd_start(&streamServer, &streamConfig) == ESP_OK) {
        httpd_register_uri_handler(streamServer, &streamUri);
    }

    httpd_config_t pageConfig = HTTPD_DEFAULT_CONFIG();
    pageConfig.server_port = 80;
    pageConfig.ctrl_port = 32768;
    httpd_uri_t indexUri = { .uri = "/", .method = HTTP_GET,
        .handler = indexHandler, .user_ctx = nullptr };
    if (httpd_start(&pageServer, &pageConfig) == ESP_OK) {
        httpd_register_uri_handler(pageServer, &indexUri);
    }
}

static void sendRingEvent() {
    if (WiFi.status() != WL_CONNECTED || SMARTTHERMO_API_KEY[0] == '\0') return;
    HTTPClient http;
    const String url = String(SMARTTHERMO_URL) + "/api/intercom/ring";
    if (!http.begin(url)) return;
    http.setTimeout(2500);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("x-api-key", SMARTTHERMO_API_KEY);
    const int status = http.POST("{\"source\":\"ESP32-CAM-Furtka\"}");
    Serial.printf("Doorbell event HTTP status: %d\n", status);
    http.end();
}

void setup() {
    Serial.begin(115200);
    pinMode(DOORBELL_PIN, INPUT_PULLUP);
    rawButtonState = digitalRead(DOORBELL_PIN);
    stableButtonState = rawButtonState;

    if (!startCamera()) return;
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    Serial.print("Connecting to Wi-Fi");
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print('.');
    }
    Serial.printf("\nCamera: http://%s:81/stream\n", WiFi.localIP().toString().c_str());
    startServers();
}

void loop() {
    const uint32_t now = millis();
    const bool reading = digitalRead(DOORBELL_PIN);
    if (reading != rawButtonState) {
        rawButtonState = reading;
        lastButtonChange = now;
    }
    if (now - lastButtonChange >= DEBOUNCE_MS && stableButtonState != rawButtonState) {
        stableButtonState = rawButtonState;
        if (stableButtonState == LOW && now - lastRingSent >= RING_COOLDOWN_MS) {
            lastRingSent = now;
            sendRingEvent();
        }
    }
    delay(5);
}
