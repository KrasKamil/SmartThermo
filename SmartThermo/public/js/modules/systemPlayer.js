// public/js/modules/systemPlayer.js
import { toggleRadioPlay, playRadio } from './radio.js';
import { state } from './state.js';


export function miniControl(action) {
    // 1. Jeśli gra RADIO INTERNETOWE
    if (state.activeSource === 'radio') {
        if (action === 'play' || action === 'playpause') {
            toggleRadioPlay();
        } else if (action === 'next' || action === 'prev') {
            if (state.globalStationList.length > 0) {
                let direction = (action === 'next') ? 1 : -1;
                state.currentStationIndex += direction;

                // Pętla listy (karuzela)
                if (state.currentStationIndex >= state.globalStationList.length) state.currentStationIndex = 0;
                if (state.currentStationIndex < 0) state.currentStationIndex = state.globalStationList.length - 1;

                const nextStation = state.globalStationList[state.currentStationIndex];

                // A. Przełącz stację LOKALNIE (dla szybkości)
                playRadio(nextStation.streamUrl, nextStation.title);

                // B. 👇 KLUCZOWE: Wyślij info do SERWERA!
                // Bez tego serwer po 1 sekundzie przywracał starą stację.
                fetch('/api/media/control', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'play_radio',
                        value: {
                            title: nextStation.title,
                            url: nextStation.streamUrl
                        }
                    })
                }).catch(e => console.error("Błąd Next/Prev:", e));
            }
        }
    }
    // 2. W przeciwnym razie steruj SYSTEMEM (Spotify/BT)
    else {
        let sysAction = action;
        if (action === 'play') sysAction = 'playpause';
        controlSystemMedia(sysAction);
    }
}

export async function checkSystemMedia() {
    if (state.isLocalSoundPlaying) {
        return;
    }

    try {
        const res = await fetch('/api/media/now-playing');
        if (!res.ok) return;

        const data = await res.json();
        const rawSource = (data.source || 'System').toLowerCase();

        const isBrowserSelfDetection = rawSource.includes('chrome') ||
            rawSource.includes('edge') ||
            rawSource.includes('opera') ||
            rawSource.includes('firefox') ||
            rawSource === 'web' ||
            rawSource === 'system';

        // --- GŁÓWNA LOGIKA OCHRONY RADIA ---
        if (state.activeSource === 'radio') {

            // POPRAWKA: Usunięta spacja w "?.title"
            const currentStation = state.globalStationList[state.currentStationIndex];
            const currentStationTitle = currentStation ? currentStation.title : "";

            // Sprawdzamy, czy to co gra w systemie to nasza stacja
            const isPlayingOurRadio = data.title && currentStationTitle && data.title.includes(currentStationTitle);

            // A. JEŚLI TO PRZEGLĄDARKA LUB NASZE RADIO -> IGNORUJ
            if (isBrowserSelfDetection || isPlayingOurRadio) {
                return; // Zostawiamy UI Radia w spokoju
            }

            // B. JEŚLI TO SPOTIFY LUB BLUETOOTH -> PRZEŁĄCZ
            const isSpotify = rawSource.includes('spotify');
            const isBluetooth = rawSource.includes('bluetooth') || data.title === "Audio Bluetooth";

            if ((isSpotify || isBluetooth) && data.status === 'Playing') {
                console.log("Przełączanie źródła z Radia na:", rawSource);

                const radioAudio = document.getElementById('radio-audio');
                if (radioAudio && !radioAudio.paused) {
                    radioAudio.pause();
                }
                state.isRadioPlaying = false;
            } else {
                return;
            }
        }
        // ------------------------------------

        // Dalsza logika (Spotify / System) - wykona się tylko jeśli NIE ma radia
        if (data.status === 'Playing' || (data.title && data.title.length > 0)) {
            state.isPlaying = (data.status === 'Playing');

            const equalizer = document.getElementById('equalizer-anim');
            if (equalizer) {
                state.isPlaying ? equalizer.classList.remove('hidden-anim') : equalizer.classList.add('hidden-anim');
            }

            let sourceType = 'system';
            if (rawSource.includes('spotify')) sourceType = 'spotify';
            else if (rawSource.includes('bluetooth')) sourceType = 'bluetooth';
            else sourceType = 'system';

            state.activeSource = sourceType;

            state.currentTrack = {
                title: data.title,
                artist: data.artist,
                cover: data.cover || '',
                source: data.source,
                type: sourceType
            };

            showPlayer(state.currentTrack);
        } else {
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