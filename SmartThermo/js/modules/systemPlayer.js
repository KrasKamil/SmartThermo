// js/modules/systemPlayer.js
import { state } from './state.js';

export async function checkSystemMedia() {
    try {
        const res = await fetch('/api/media/now-playing');
        if (!res.ok) return;

        const data = await res.json();

        // 1. Priorytet dla Radia wbudowanego w aplikację
        if (state.activeSource === 'radio' && state.isRadioPlaying) {
            return;
        }

        // 2. Sprawdź czy cokolwiek gra
        // (Status Playing LUB mamy tytuł utworu)
        if (data.status === 'Playing' || (data.title && data.title.length > 0)) {

            state.isPlaying = (data.status === 'Playing');

            // Pobieramy nazwę aplikacji (np. "Spotify.exe", "Chrome")
            // Jeśli brak danych, przyjmujemy "System"
            const rawSource = data.source || 'System';

            // Logika wykrywania typu źródła
            let sourceType = 'system';
            if (rawSource.toLowerCase().includes('spotify')) sourceType = 'spotify';
            else if (rawSource.toLowerCase().includes('bluetooth')) sourceType = 'bluetooth';
            else if (rawSource.toLowerCase().includes('chrome') || rawSource.toLowerCase().includes('edge')) sourceType = 'browser';

            state.activeSource = sourceType;

            state.currentTrack = {
                title: data.title,
                artist: data.artist,
                cover: data.cover || '',
                source: rawSource, // Pełna nazwa (np. Spotify.exe)
                type: sourceType // Typ (spotify, bluetooth, system)
            };

            showPlayer(state.currentTrack);
        } else {
            // Ukryj player tylko jeśli nie używamy radia
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
    // 1. Pobieramy elementy DOM
    const widget = document.getElementById('spotify-widget');
    const playerView = document.getElementById('player-view');
    const loginView = document.getElementById('login-view');

    // Upewniamy się, że pobieramy obrazek po poprawnym ID
    const artEl = document.getElementById('current-art');
    const titleEl = document.getElementById('current-track');
    const artistEl = document.getElementById('current-artist');

    // 2. Pokaż widget na pulpicie
    if (widget) {
        widget.style.display = 'flex';
    }

    // 3. Pokaż widok playera, ukryj "login/wznów"
    if (playerView) playerView.style.display = 'flex';
    if (loginView) loginView.style.display = 'none';

    // 4. Ustawianie tekstów
    if (titleEl) titleEl.innerText = track.title || "Nieznany utwór";
    if (artistEl) artistEl.innerText = track.artist || "";

    // 5. --- LOGIKA IKON I OKŁADEK ---
    if (artEl) {
        // A. Jeśli mamy prawdziwą okładkę (Base64 z Pythona)
        if (track.cover && track.cover.length > 50) {
            artEl.src = track.cover;
        }
        // B. Jeśli brak okładki -> dobierz ikonę aplikacji
        else {
            if (track.type === 'spotify') {
                artEl.src = "style-css/spotify.png";
            } else if (track.type === 'bluetooth') {
                artEl.src = "style-css/icon.svg";
            } else {
                artEl.src = "style-css/radio.svg";
            }
        }
    }

    // 6. Obsługa przycisku Play/Pause
    const playBtnIcon = document.querySelector('#play-pause-btn i');
    if (playBtnIcon) {
        playBtnIcon.className = state.isPlaying ? 'fas fa-pause' : 'fas fa-play';
    }

    // 7. Aktualizacja MINI PLAYERA (DOLNY PASEK)
    updateMiniPlayer(track);
}

export function hidePlayer() {
    const widget = document.getElementById('spotify-widget');
    const playerView = document.getElementById('player-view');
    const loginView = document.getElementById('login-view');

    if (state.activeSource !== 'radio') {
        // Opcja A: Całkowite ukrycie widgetu gdy nic nie gra (czystrzy pulpit)
        if (widget) widget.style.display = 'none';

        // Opcja B (alternatywna): Zostawienie widgetu z napisem "Otwórz aplikację"
        /*
        if (playerView) playerView.style.display = 'none';
        if (loginView) loginView.style.display = 'block';
        */

        updateMiniPlayer(null); // Ukrywa pasek dolny
        state.activeSource = 'none';
    }
}

export function updateMiniPlayer(track) {
    const p = document.getElementById('mini-player');
    const iconContainer = document.getElementById('mini-icon');

    // Jeśli track jest null, ukrywamy
    if (!track || !p) {
        if (p) p.classList.add('hidden');
        return;
    }

    // Pokaż pasek
    p.classList.remove('hidden');

    // Teksty
    document.getElementById('mini-title').innerText = track.title || "Brak tytułu";
    document.getElementById('mini-subtitle').innerText = track.artist || "";

    // Ikona w mini playerze
    if (iconContainer) {
        if (track.type === 'spotify') {
            iconContainer.innerHTML = '<img src="style-css/spotify.png" style="width: 24px; height: 24px;">';
        } else if (track.type === 'bluetooth') {
            iconContainer.innerHTML = '📶';
        } else {
            iconContainer.innerHTML = '🎵';
        }
    }
}

export function controlSystemMedia(action) {
    fetch('/api/media/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
    });

    // Szybka reakcja UI
    if (action === 'playpause') {
        state.isPlaying = !state.isPlaying;
        const playBtnIcon = document.querySelector('#play-pause-btn i');
        if (playBtnIcon) {
            playBtnIcon.className = state.isPlaying ? 'fas fa-pause' : 'fas fa-play';
        }
    }
}