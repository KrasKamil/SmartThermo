import { state } from './state.js';
import { fetchSpotifyStatus } from './spotify.js';

export async function checkSystemMedia() {
    // 1. Sprawdź Spotify
    const spotifyData = await fetchSpotifyStatus();
    if (spotifyData) {
        showPlayer(spotifyData);
        return;
    }

    // 2. Sprawdź System/Bluetooth
    try {
        const res = await fetch('/api/media/now-playing');
        if (!res.ok) return;
        const data = await res.json();

        // Jeśli gra radio internetowe, nie nadpisuj go pustym stanem systemu
        if (state.activeSource === 'radio' && state.isRadioPlaying) {
            return;
        }

        if (data.title || data.artist) {
            showPlayer(data);
        } else {
            hidePlayer();
        }
    } catch (e) { hidePlayer(); }
}

export function showPlayer(data) {
    document.getElementById('player-view').style.display = 'flex';
    document.getElementById('login-view').style.display = 'none';

    document.getElementById('current-track').innerText = data.title || "";
    document.getElementById('current-artist').innerText = data.artist || "";
    document.getElementById('play-btn').innerText = (data.status === 'Playing') ? '⏸' : '▶️';

    const artEl = document.getElementById('current-art');
    if (data.cover) artEl.src = data.cover;
    else artEl.src = (data.title === "Audio Bluetooth") ? "style-css/icon.svg" : "style-css/spotify.png";

    // Update Mini Player
    updateMiniPlayer(data.title, data.artist, data.source === 'Spotify' ? 'spotify' : 'system');
}

export function hidePlayer() {
    document.getElementById('player-view').style.display = 'none';
    document.getElementById('login-view').style.display = 'block';
    if (state.activeSource !== 'radio') updateMiniPlayer("", "", "none");
}

export function updateMiniPlayer(title, sub, type) {
    const p = document.getElementById('mini-player');
    if (type === 'none') { p.classList.add('hidden'); return; }
    p.classList.remove('hidden');
    document.getElementById('mini-title').innerText = title;
    document.getElementById('mini-subtitle').innerText = sub;
    state.activeSource = type;
}

export function controlSystemMedia(action) {
    fetch('/api/media/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
    });
    setTimeout(checkSystemMedia, 500);
}