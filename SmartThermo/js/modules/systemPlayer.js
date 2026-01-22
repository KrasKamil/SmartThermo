import { state } from './state.js';

export async function checkSystemMedia() {
    try {
        const res = await fetch('/api/media/now-playing');
        if (!res.ok) return;

        const data = await res.json();

        // Pobieramy nazwę źródła z Windowsa (np. "Spotify.exe", "chrome.exe", "msedge.exe")
        const rawSource = (data.source || 'System').toLowerCase();

        // Sprawdzamy, czy Windows widzi naszą przeglądarkę
        // (To jest ta "pętla", której chcemy uniknąć)
        const isBrowserSelfDetection = rawSource.includes('chrome') ||
            rawSource.includes('edge') ||
            rawSource.includes('opera') ||
            rawSource.includes('firefox');

        // --- GŁÓWNA LOGIKA OCHRONY RADIA ---
        if (state.activeSource === 'radio') {

            // SCENARIUSZ A: Windows widzi przeglądarkę (czyli nas samych)
            // Ignorujemy to całkowicie. Nie pozwalamy nadpisać 'radio' przez 'browser'.
            if (isBrowserSelfDetection) {
                // Jeśli Windows widzi, że gramy, upewnij się, że stan globalny to potwierdza
                if (data.status === 'Playing') {
                    // Opcjonalnie: synchronizacja stanu, ale bez zmiany źródła
                }
                return; // WYCHODZIMY - Nie pozwalamy zmienić widoku!
            }

            // SCENARIUSZ B: Windows widzi INNĄ aplikację (np. Spotify)
            // Jeśli Spotify zaczęło grać, to faktycznie chcemy przełączyć widok.
            if (data.status === 'Playing' && !isBrowserSelfDetection) {
                // Wyłączamy radio, bo weszło Spotify
                const radioAudio = document.getElementById('radio-audio');
                if (radioAudio && !radioAudio.paused) {
                    radioAudio.pause();
                }
                state.isRadioPlaying = false;
                // I pozwalamy kodowi iść dalej w dół, żeby przełączyć na Spotify
            }

            // SCENARIUSZ C: Windows nic nie widzi (Pauza)
            // Skoro jesteśmy w trybie radia, to znaczy, że po prostu zapauzowaliśmy radio.
            // NIE RESETUJEMY WIDOKU.
            else {
                return; // WYCHODZIMY - Zostawiamy kafel radia na ekranie
            }
        }
        // ------------------------------------


        // Dalsza logika (tylko jeśli NIE jesteśmy w trybie radia lub Spotify przejęło kontrolę)
        if (data.status === 'Playing' || (data.title && data.title.length > 0)) {

            state.isPlaying = (data.status === 'Playing');

            // Ukrywanie equalizera przy pauzie
            const equalizer = document.getElementById('equalizer-anim');
            if (equalizer) {
                if (state.isPlaying) {
                    equalizer.classList.remove('hidden-anim');
                } else {
                    equalizer.classList.add('hidden-anim');
                }
            }

            // Wykrywanie typu źródła
            let sourceType = 'system';
            if (rawSource.includes('spotify')) sourceType = 'spotify';
            else if (rawSource.includes('bluetooth')) sourceType = 'bluetooth';
            else if (isBrowserSelfDetection) sourceType = 'browser'; // To zadziała tylko, jeśli nie byliśmy w trybie radia

            state.activeSource = sourceType;

            state.currentTrack = {
                title: data.title,
                artist: data.artist,
                cover: data.cover || '',
                source: data.source, // Oryginalna nazwa
                type: sourceType
            };

            showPlayer(state.currentTrack);
        } else {
            // Ukryj player TYLKO jeśli NIE jesteśmy w trybie radia
            if (state.activeSource !== 'radio') {
                hidePlayer();
                state.isPlaying = false;
            }
        }
    } catch (e) {
        console.error("Błąd checkSystemMedia:", e);
    }
}

export function showPlayer(track) {
    const widget = document.getElementById('spotify-widget');
    const playerView = document.getElementById('player-view');
    const loginView = document.getElementById('login-view');

    const artEl = document.getElementById('current-art');
    const titleEl = document.getElementById('current-track');
    const artistEl = document.getElementById('current-artist');

    // Pokazujemy widget
    if (widget) widget.style.display = 'flex';
    if (playerView) playerView.style.display = 'flex';
    if (loginView) loginView.style.display = 'none';

    // Ustawiamy teksty
    if (titleEl) titleEl.innerText = track.title || "Nieznany utwór";
    if (artistEl) artistEl.innerText = track.artist || "";

    // Ustawiamy okładkę lub ikonę
    if (artEl) {
        if (track.cover && track.cover.length > 50) {
            artEl.src = track.cover;
        } else {
            // Ikony zastępcze
            if (track.type === 'spotify') artEl.src = "style-css/img/spotify.png";
            else if (track.type === 'radio') artEl.src = "style-css/img/radio.svg";
            else if (track.type === 'bluetooth') artEl.src = "style-css/img/icon.svg";
            else artEl.src = "style-css/img/radio.svg";
        }
    }

    // Ikona Play/Pause
    const playBtn = document.getElementById('play-pause-btn');
    if (playBtn) {
        // Jeśli to radio, patrzymy na stan radia
        // Jeśli to system, patrzymy na stan systemu
        const isPlaying = (track.type === 'radio') ? state.isRadioPlaying : state.isPlaying;
        playBtn.innerHTML = isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
    }

    updateMiniPlayer(track);
}

export function hidePlayer() {
    const widget = document.getElementById('spotify-widget');

    // Nie ukrywaj, jeśli radio jest aktywne!
    if (state.activeSource !== 'radio') {
        if (widget) widget.style.display = 'none';
        updateMiniPlayer(null);
        state.activeSource = 'none';
    }
}

export function updateMiniPlayer(track) {
    const p = document.getElementById('mini-player');
    const iconContainer = document.getElementById('mini-icon');

    if (!track || !p) {
        if (p) p.classList.add('hidden');
        return;
    }
    p.classList.remove('hidden');
    document.getElementById('mini-title').innerText = track.title || "Brak tytułu";
    document.getElementById('mini-subtitle').innerText = track.artist || "";

    if (iconContainer) {
        if (track.type === 'spotify') iconContainer.innerHTML = '<img src="style-css/img/spotify.png" style="width: 24px; height: 24px;">';
        else if (track.type === 'radio') iconContainer.innerHTML = '📻';
        else if (track.type === 'bluetooth') iconContainer.innerHTML = '📶';
        else iconContainer.innerHTML = '🎵';
    }
}

export function controlSystemMedia(action) {
    // Wysyłamy komendę do serwera (Play/Pause/Next)
    fetch('/api/media/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
    });

    // Optymistyczna aktualizacja UI (żeby przycisk reagował od razu)
    if (action === 'playpause') {
        state.isPlaying = !state.isPlaying;
        const equalizer = document.getElementById('equalizer-anim');
        const playBtn = document.getElementById('play-pause-btn');

        if (state.isPlaying) {
            if (equalizer) equalizer.classList.remove('hidden-anim');
            if (playBtn) playBtn.innerHTML = '<i class="fas fa-pause"></i>';
        } else {
            if (equalizer) equalizer.classList.add('hidden-anim');
            if (playBtn) playBtn.innerHTML = '<i class="fas fa-play"></i>';
        }
    }
}