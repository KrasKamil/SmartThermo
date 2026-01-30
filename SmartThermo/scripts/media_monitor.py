import asyncio
import time
import requests
import sys
import json
import base64

# Wymuszenie UTF-8 dla konsoli Windows
try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

# Importujemy winsdk tylko na Windowsie
try:
    from winsdk.windows.media.control import GlobalSystemMediaTransportControlsSessionManager, GlobalSystemMediaTransportControlsSessionPlaybackStatus
    from winsdk.windows.storage.streams import DataReader
    IS_WINDOWS = True
except ImportError:
    IS_WINDOWS = False
    print("⚠️ WinSDK niedostępne (Tryb Linux/Dummy)")

API_URL = "http://localhost:8888/api/media/update-system"
INTERVAL = 1.0  

current_state = {}

async def get_media_info():
    if not IS_WINDOWS:
        return None

    try:
        # Pobieramy menedżera sesji
        sessions = await GlobalSystemMediaTransportControlsSessionManager.request_async()
        session = sessions.get_current_session()

        if not session:
            return {"status": "Stopped", "title": "", "artist": "", "cover": ""}

        # Pobieramy właściwości
        props = await session.try_get_media_properties_async()
        info = session.get_playback_info()

        if not props or not info:
             return {"status": "Stopped", "title": "", "artist": "", "cover": ""}

        # Status
        status_enum = info.playback_status
        status_str = "Stopped"
        if status_enum == GlobalSystemMediaTransportControlsSessionPlaybackStatus.PLAYING:
            status_str = "Playing"
        elif status_enum == GlobalSystemMediaTransportControlsSessionPlaybackStatus.PAUSED:
            status_str = "Paused"
        elif status_enum == GlobalSystemMediaTransportControlsSessionPlaybackStatus.STOPPED:
            status_str = "Stopped"

        # --- OKŁADKA (Kod przeniesiony z get_media.py) ---
        cover_data = ""
        try:
            if props.thumbnail:
                stream = await props.thumbnail.open_read_async()
                size = stream.size
                if size > 0 and size < 5 * 1024 * 1024: # Max 5MB
                    reader = DataReader(stream)
                    await reader.load_async(size)
                    buffer = reader.read_buffer(size)
                    img_bytes = bytes(buffer)
                    b64_string = base64.b64encode(img_bytes).decode('utf-8')
                    cover_data = f"data:image/jpeg;base64,{b64_string}"
        except Exception:
            pass
        # -------------------------------------------------

        return {
            "source": "System",
            "app_id": session.source_app_user_model_id,
            "status": status_str,
            "title": props.title,
            "artist": props.artist,
            "cover": cover_data 
        }
    except Exception as e:
        return {"status": "Stopped", "title": "", "artist": "", "cover": ""}

async def loop():
    global current_state
    print("🎵 Media Monitor: START (z okładkami)")

    while True:
        try:
            new_data = await get_media_info()
            
            # Porównujemy dane. Jeśli zmienił się tytuł, status LUB obrazek - wysyłamy
            if new_data:
                # Tworzymy kopię do porównania bez obrazka (żeby nie spamować konsoli base64)
                # Ale wysyłamy całość
                should_update = False
                
                if json.dumps(new_data) != json.dumps(current_state):
                    should_update = True

                if should_update:
                    try:
                        res = requests.post(API_URL, json=new_data, timeout=1)
                        if res.status_code == 200:
                            # Krótki log bez base64
                            print(f"🎵 Zmiana: {new_data.get('title')} [{new_data.get('status')}]")
                            current_state = new_data
                    except Exception as e:
                        print(f"⚠️ Błąd API: {e}")
            
        except Exception as e:
            print(f"❌ Błąd pętli: {e}")

        await asyncio.sleep(INTERVAL)

if __name__ == "__main__":
    if IS_WINDOWS:
        asyncio.run(loop())
    else:
        while True: time.sleep(10)