import asyncio
import time
import requests
import sys
import json
import base64
import os
from dotenv import load_dotenv

# --- BIBLIOTEKI ---
try:
    import soundcard as sc
    import numpy as np # Potrzebne do analizy dźwięku
    HAS_SOUNDCARD = True
except ImportError:
    HAS_SOUNDCARD = False
    print("⚠️ Brak 'soundcard' lub 'numpy'. Zainstaluj: pip install soundcard numpy")

# Wymuszenie UTF-8
try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

# Import winsdk
try:
    from winsdk.windows.media.control import GlobalSystemMediaTransportControlsSessionManager, GlobalSystemMediaTransportControlsSessionPlaybackStatus
    from winsdk.windows.storage.streams import DataReader
    from winsdk.windows.devices.enumeration import DeviceInformation, DeviceClass
    IS_WINDOWS = True
except ImportError:
    IS_WINDOWS = False

current_dir = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.join(current_dir, '..', '.env')

# 2. Załaduj zmienne
load_dotenv(env_path)

# 3. Pobierz klucz (jeśli brak, wywal błąd)
API_KEY = os.getenv("API_KEY")
if not API_KEY:
    print("❌ BŁĄD CRITICAL: Brak API_KEY w pliku .env! Skrypt zatrzymany.")
    sys.exit(1)

PORT = os.getenv("PORT", "8888") # Pobierz port lub domyślnie 8888
API_URL = f"http://localhost:{PORT}/api/media/update-system"
INTERVAL = 0.8

current_state = {}

# --- 1. Skanowanie sparowanych ---
async def scan_paired_devices():
    if not IS_WINDOWS:
        print("[]")
        return
    try:
        devices = await DeviceInformation.find_all_async(DeviceClass.BLUETOOTH)
        results = []
        for d in devices:
            if d.pairing.is_paired:
                results.append({"name": d.name if d.name else "Nieznane", "mac": d.id, "paired": True})
        print(json.dumps(results, ensure_ascii=False))
    except Exception:
        print("[]")

# --- POMOCNICZA: Sprawdzanie czy gra muzyka (Analiza sygnału) ---
def is_audio_playing(mic_device):
    try:
        # Nagrywamy bardzo krótki fragment (2048 próbek to ok. 0.04 sekundy)
        # To jest super szybkie i nie obciąża CPU
        data = mic_device.record(samplerate=44100, numframes=2048)
        
        # Obliczamy średnią głośność (RMS - Root Mean Square)
        rms = np.sqrt(np.mean(data**2))
        
        # Debugowanie głośności (odkomentuj jeśli chcesz kalibrować)
        # print(f"📊 Głośność BT: {rms:.5f}")

        # Jeśli głośność jest większa niż szum (0.005), uznajemy że GRA
        # Jeśli jest cisza absolutna (0.000...), to PAUZA
        return rms > 0.002 
    except Exception as e:
        # print(f"Błąd analizy audio: {e}")
        return False

# --- 2. Wykrywanie Audio (SoundCard + Analiza) ---
def get_active_bt_device():
    if not HAS_SOUNDCARD: return None, "Stopped"
    
    try:
        mics = sc.all_microphones(include_loopback=False)
        found_name = None
        ignored_keywords = ["Mix", "Miks", "Internal", "Wewnętrzny", "Realtek", "High Definition", "Nvidia", "Webcam", "Loopback"]

        active_mic = None

        for mic in mics:
            name = mic.name
            name_lower = name.lower()
            
            # Logika szukania telefonu (A2DP / Mikrofon)
            is_phone = False
            
            if "a2dp" in name_lower or "snk" in name_lower:
                found_name = "Telefon Bluetooth"
                is_phone = True
            
            elif "mikrofon" in name_lower or "headset" in name_lower or "hands-free" in name_lower:
                if not any(x in name_lower for x in ["realtek", "usb", "audio", "webcam"]):
                     found_name = name
                     is_phone = True
            
            elif not any(keyword.lower() in name_lower for keyword in ignored_keywords):
                found_name = name
                is_phone = True

            if is_phone:
                active_mic = mic
                break # Znaleziono, przerywamy pętlę

        if found_name and active_mic:
            # 🎵 Sprawdzamy czy faktycznie leci dźwięk!
            is_playing = is_audio_playing(active_mic)
            status = "Playing" if is_playing else "Paused"
            return found_name, status

        return None, "Stopped"

    except Exception as e:
        print(f"❌ Błąd SoundCard: {e}")
        return None, "Stopped"

# --- 3. Media Systemowe ---
async def get_winsdk_media():
    if not IS_WINDOWS: return None
    try:
        sessions = await GlobalSystemMediaTransportControlsSessionManager.request_async()
        session = sessions.get_current_session()
        if not session: return None

        info = session.get_playback_info()
        props = await session.try_get_media_properties_async()
        if not info or not props: return None

        status_str = "Stopped"
        if info.playback_status == GlobalSystemMediaTransportControlsSessionPlaybackStatus.PLAYING: status_str = "Playing"
        elif info.playback_status == GlobalSystemMediaTransportControlsSessionPlaybackStatus.PAUSED: status_str = "Paused"

        # 🔥 NAPRAWA: Pobieramy prawdziwą nazwę aplikacji (np. Spotify.exe, Chrome)
        app_id = session.source_app_user_model_id if session.source_app_user_model_id else "System"
        
        # Upraszczamy nazwę dla czytelności
        source_name = "System"
        if "spotify" in app_id.lower(): source_name = "Spotify"
        elif "chrome" in app_id.lower(): source_name = "Chrome"
        elif "edge" in app_id.lower(): source_name = "Edge"
        elif "firefox" in app_id.lower(): source_name = "Firefox"

        cover_data = ""
        try:
            if props.thumbnail:
                stream = await props.thumbnail.open_read_async()
                size = stream.size
                if size > 0 and size < 5 * 1024 * 1024:
                    reader = DataReader(stream)
                    await reader.load_async(size)
                    buffer = reader.read_buffer(size)
                    b64_string = base64.b64encode(bytes(buffer)).decode('utf-8')
                    cover_data = f"data:image/jpeg;base64,{b64_string}"
        except: pass

        return {
            "source": source_name, # 🔥 Teraz wysyłamy np. "Spotify" albo "Chrome"
            "status": status_str,
            "title": props.title if props.title else "",
            "artist": props.artist if props.artist else "",
            "cover": cover_data 
        }
    except: return None
    
# --- GŁÓWNA PĘTLA ---
async def loop():
    global current_state
    print("🎵 Media Monitor: START (Silence Detection)")
    
    tick = 0
    while True:
        try:
            final_data = {"status": "Stopped", "title": "", "artist": "", "cover": "", "source": "System"}
            
            # 1. Sprawdź System (Spotify)
            winsdk_data = await get_winsdk_media()
            
            # Jeśli Spotify gra, ma priorytet
            if winsdk_data and winsdk_data['status'] == 'Playing':
                final_data = winsdk_data
            else:
                # 2. Sprawdź Bluetooth + Analiza dźwięku
                bt_name, bt_status = get_active_bt_device()
                
                if bt_name:
                    # Jeśli Spotify jest zapauzowane, a BT też zapauzowane -> Pokaż BT Paused
                    # Jeśli Spotify Stopped, a BT Paused -> Pokaż BT Paused
                    
                    final_data = {
                        "source": "Bluetooth",
                        "status": bt_status, # "Playing" lub "Paused" zależnie od głośności
                        "title": "Bluetooth Audio",
                        "artist": bt_name,
                        "cover": "style-css/img/bluetooth.png" 
                    }

            # Wysyłka tylko przy zmianie
            if json.dumps(final_data) != json.dumps(current_state):
                    try:
                        # Używamy pobranego klucza
                        headers = {'x-api-key': API_KEY}
                        
                        requests.post(API_URL, json=final_data, headers=headers, timeout=1)
                        
                        if tick % 5 == 0: 
                            print(f"🚀 UPDATE: {final_data.get('source')} -> {final_data.get('status')}")
                        current_state = final_data
                    except: pass
            
            tick += 1
            
        except Exception as e:
            print(f"❌ Błąd pętli: {e}")
            
        await asyncio.sleep(INTERVAL)

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "scan":
        if IS_WINDOWS: asyncio.run(scan_paired_devices())
        else: print("[]")
    elif IS_WINDOWS:
        asyncio.run(loop())
    else:
        while True: time.sleep(10)