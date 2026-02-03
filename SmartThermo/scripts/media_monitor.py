# scripts/media_monitor.py
import asyncio
import json
import time
import sys
import requests
from winsdk.windows.media.control import (
    GlobalSystemMediaTransportControlsSessionManager,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus
)

API_URL = "http://localhost:8888/api/media/update-system"
BLUETOOTH_KEYWORDS = ['a2dp', 'snk', 'bluetooth']

# ════════════════════════════════════════════════════════════════════════════
# HELPER: Sprawdzanie Bluetootha (WMI - Windows)
# ════════════════════════════════════════════════════════════════════════════
def is_bluetooth_active():
    try:
        import subprocess
        result = subprocess.run([
            'powershell', '-NoProfile', '-Command',
            "Get-CimInstance Win32_PnPEntity | Where-Object { "
            "($_.Name -match 'A2DP' -or $_.Name -match 'SNK') -and "
            "$_.Name -notmatch 'Hands-Free' -and "
            "$_.Status -eq 'OK' -and "
            "$_.ConfigManagerErrorCode -eq 0 } | Select-Object Name"
        ], capture_output=True, text=True, timeout=3)
        
        output = result.stdout.strip()
        
        # Weryfikacja czy "Name" istnieje (nie tylko pusta lista)
        if output and "Name" in output and len(output.splitlines()) > 2:
            return True
        return False
    except Exception:
        return False

# ════════════════════════════════════════════════════════════════════════════
# FUNKCJA: Monitorowanie Mediów
# ════════════════════════════════════════════════════════════════════════════
async def monitor_media():
    last_state = None
    last_bluetooth_check = 0
    bluetooth_cooldown = 3  # Sprawdzaj Bluetooth co 3 sekundy

    while True:
        try:
            current_time = time.time()
            
            # ──────────────────────────────────────────────────────────────
            # 1. SPRAWDZANIE BLUETOOTH (z cooldownem)
            # ──────────────────────────────────────────────────────────────
            bluetooth_active = False
            if current_time - last_bluetooth_check > bluetooth_cooldown:
                bluetooth_active = is_bluetooth_active()
                last_bluetooth_check = current_time

            # ──────────────────────────────────────────────────────────────
            # 2. SPRAWDZANIE SPOTIFY/YOUTUBE (Windows Media API)
            # ──────────────────────────────────────────────────────────────
            mgr = await GlobalSystemMediaTransportControlsSessionManager.request_async()
            session = mgr.get_current_session()

            current_state = None

            # ✅ PRIORYTET 1: BLUETOOTH (jeśli aktywny)
            if bluetooth_active:
                current_state = {
                    "source": "Bluetooth",
                    "status": "Playing",
                    "title": "Urządzenie Bluetooth",
                    "artist": "",
                    "cover": ""
                }
            # ✅ PRIORYTET 2: SPOTIFY/YOUTUBE
            elif session:
                media = await session.try_get_media_properties_async()
                playback = session.get_playback_info()
                
                status_enum = playback.playback_status
                status_str = "Stopped"
                
                if status_enum == GlobalSystemMediaTransportControlsSessionPlaybackStatus.PLAYING:
                    status_str = "Playing"
                elif status_enum == GlobalSystemMediaTransportControlsSessionPlaybackStatus.PAUSED:
                    status_str = "Paused"
                
                # ✅ KLUCZOWA ZMIANA: WYSYŁAJ WSZYSTKIE STATUSY (nie tylko Playing)
                if status_str in ["Playing", "Paused"]:
                    current_state = {
                        "source": "System",
                        "status": status_str,
                        "title": media.title if media and media.title else "",
                        "artist": media.artist if media and media.artist else "",
                        "cover": ""
                    }

            # ──────────────────────────────────────────────────────────────
            # 3. WYSYŁANIE DO SERWERA (tylko jeśli stan się zmienił)
            # ──────────────────────────────────────────────────────────────
            if current_state and current_state != last_state:
                print(f"🎵 [MONITOR] Zmiana stanu: {current_state}")
                
                try:
                    requests.post(API_URL, json=current_state, timeout=2)
                except Exception as e:
                    # Ignoruj błędy sieciowe (timeout, connection refused)
                    pass
                
                last_state = current_state

        except Exception as e:
            # Ignoruj błędy timeout/połączenia
            pass

        await asyncio.sleep(1)  # Check co sekundę

# ════════════════════════════════════════════════════════════════════════════
# FUNKCJA: Skanowanie Bluetooth (dla /api/bluetooth/scan)
# ════════════════════════════════════════════════════════════════════════════
def scan_bluetooth():
    try:
        import subprocess
        result = subprocess.run([
            'powershell', '-NoProfile', '-Command',
            "Get-PnpDevice -Class Bluetooth | Where-Object { $_.Status -ne 'OK' } | Select-Object FriendlyName, InstanceId"
        ], capture_output=True, text=True, timeout=5)
        
        devices = []
        for line in result.stdout.strip().split('\n')[3:]:  # Pomijamy nagłówki
            parts = line.split()
            if len(parts) >= 2:
                devices.append({
                    "name": ' '.join(parts[:-1]),
                    "mac": parts[-1]
                })
        
        print(json.dumps(devices))
    except Exception as e:
        print(json.dumps([]))

# ════════════════════════════════════════════════════════════════════════════
# MAIN
# ════════════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "scan":
        scan_bluetooth()
    else:
        asyncio.run(monitor_media())