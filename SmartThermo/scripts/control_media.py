# scripts/control_media.py
import asyncio
import sys
# Korzystamy z tej samej biblioteki co get_media.py
from winsdk.windows.media.control import GlobalSystemMediaTransportControlsSessionManager as MediaManager

async def control_media(action):
    # Pobieramy menedżera sesji
    sessions = await MediaManager.request_async()
    # Pobieramy aktualną sesję (tę, która gra muzykę)
    current_session = sessions.get_current_session()
    
    if current_session:
        # Wysyłamy konkretne komendy do API Windowsa
        if action == 'playpause':
            await current_session.try_toggle_play_pause_async()
        elif action == 'play':
            await current_session.try_play_async()
        elif action == 'pause':
            await current_session.try_pause_async()
        elif action == 'next':
            await current_session.try_skip_next_async()
        elif action == 'prev':
            await current_session.try_skip_previous_async()
        elif action == 'stop':
            await current_session.try_stop_async()
    else:
        print("Brak aktywnej sesji mediów.")

if __name__ == '__main__':
    if len(sys.argv) > 1:
        # Uruchamiamy asynchroniczną funkcję z argumentem z konsoli
        asyncio.run(control_media(sys.argv[1]))