import asyncio
import json
import base64
from winsdk.windows.media.control import GlobalSystemMediaTransportControlsSessionManager, GlobalSystemMediaTransportControlsSessionPlaybackStatus
from winsdk.windows.storage.streams import DataReader

async def get_media_info():
    try:
        mgr = await GlobalSystemMediaTransportControlsSessionManager.request_async()
        sess = mgr.get_current_session()

        if sess:
            media = await sess.try_get_media_properties_async()
            timeline = sess.get_playback_info()
            
            # Status
            status_enum = timeline.playback_status
            status_str = "Paused"
            if status_enum == GlobalSystemMediaTransportControlsSessionPlaybackStatus.PLAYING:
                status_str = "Playing"
            elif status_enum == GlobalSystemMediaTransportControlsSessionPlaybackStatus.PAUSED:
                status_str = "Paused"
            else:
                status_str = "Stopped"

            # --- NOWOŚĆ: Pobieranie okładki ---
            cover_data = ""
            try:
                if media.thumbnail:
                    # Otwieramy strumień z obrazkiem
                    stream = await media.thumbnail.open_read_async()
                    size = stream.size
                    
                    # Jeśli obrazek istnieje i nie jest za duży (max 5MB)
                    if size > 0 and size < 5 * 1024 * 1024:
                        reader = DataReader(stream)
                        await reader.load_async(size)
                        
                        # Czytamy bajty
                        buffer = reader.read_buffer(size)
                        img_bytes = bytes(buffer)
                        
                        # Konwertujemy na Base64
                        b64_string = base64.b64encode(img_bytes).decode('utf-8')
                        
                        # Tworzymy gotowy string dla HTML
                        cover_data = f"data:image/jpeg;base64,{b64_string}"
            except Exception as e:
                # Jeśli nie uda się pobrać okładki, trudno - reszta działa
                pass
            # ----------------------------------

            response = {
                "title": media.title if media.title else "",
                "artist": media.artist if media.artist else "",
                "source": sess.source_app_user_model_id,
                "status": status_str,
                "cover": cover_data, # Tutaj trafi Base64
                "found": True
            }
            print(json.dumps(response))
        else:
            print(json.dumps({"found": False}))

    except Exception as e:
        print(json.dumps({"found": False, "error": str(e)}))

if __name__ == "__main__":
    asyncio.run(get_media_info())