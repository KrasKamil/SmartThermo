import asyncio
import sys

try:
    from winrt.windows.media.control import GlobalSystemMediaTransportControlsSessionManager
except ImportError:
    print("Brak biblioteki winrt-Windows.Media.Control.")
    sys.exit(1)

async def control_media(action):
    # Pobierz menedżera sesji
    manager = await GlobalSystemMediaTransportControlsSessionManager.request_async()
    sessions = manager.get_sessions()
    
    spotify_session = None
    
    # Znajdź sesję Spotify (działa w tle)
    for session in sessions:
        if "spotify" in session.source_app_user_model_id.lower():
            spotify_session = session
            break
            
    current_session = manager.get_current_session()

    # --- 1. PLAY SPOTIFY (Tylko wznów, nie uruchamiaj) ---
    if action == 'play_spotify':
        if spotify_session:
            # print("Wznawiam Spotify w tle...")
            await spotify_session.try_play_async()
        else:
            print("Nie znaleziono aktywnego procesu Spotify w tle.")
        return 
    # -----------------------------------------------------

    # --- 2. PAUSE SPOTIFY ---
    if action == 'pause_spotify':
        if spotify_session:
            await spotify_session.try_pause_async()
        return
    # -----------------------------------------------------

    # Standardowa logika (Play/Pause/Next dla tego co aktywne)
    target_session = None
    if action == 'play':
        # Priorytet dla obecnej, jak nic nie gra -> Spotify
        if current_session: target_session = current_session
        elif spotify_session: target_session = spotify_session
    else:
        target_session = current_session if current_session else spotify_session

    if not target_session:
        return

    try:
        if action == 'playpause': await target_session.try_toggle_play_pause_async()
        elif action == 'play': await target_session.try_play_async()
        elif action == 'pause': await target_session.try_pause_async()
        elif action == 'next': await target_session.try_skip_next_async()
        elif action == 'prev': await target_session.try_skip_previous_async()
        elif action == 'stop': await target_session.try_pause_async()
    except: pass

if __name__ == '__main__':
    if len(sys.argv) > 1:
        asyncio.run(control_media(sys.argv[1]))