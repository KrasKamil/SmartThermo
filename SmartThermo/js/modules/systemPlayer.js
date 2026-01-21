import { state } from './state.js';

export async function checkSystemMedia() {
    // W trybie bez API od razu uderzamy do Twojego backendu (PowerShell)
    try {
        const res = await fetch('/api/media/now-playing');
        if (!res.ok) return;

        const data = await res.json();

        // Jeśli gra radio internetowe, nie psujemy widoku
        if (state.activeSource === 'radio' && state.isRadioPlaying) {
            return;
        }

        // Sprawdzamy czy cokolwiek gra (Windows lub Bluetooth)
        if (data.status === 'Playing' || (data.title && data.title.length > 0)) {
            showPlayer(data);
        } else {
            hidePlayer();
        }
    } catch (e) {
        console.error("Błąd pobierania mediów:", e);
        hidePlayer();
    }
}

export function showPlayer(data) {
    document.getElementById('player-view').style.display = 'flex';
    document.getElementById('login-view').style.display = 'none';

    // Wpisanie danych
    document.getElementById('current-track').innerText = data.title || "Nieznany utwór";
    document.getElementById('current-artist').innerText = data.artist || "Nieznany artysta";

    // Przycisk play/pause
    const playBtn = document.getElementById('play-btn');
    if (playBtn) playBtn.innerText = (data.status === 'Playing') ? '⏸' : '▶️';

    // Okładka (bez API nie pobierzemy okładki z Windowsa łatwo, więc dajemy ikonę)
    const artEl = document.getElementById('current-art');
    if (data.source === 'Bluetooth') {
        artEl.src = "style-css/icon.svg"; // Ikona dla BT
    } else {
        // Tu jest trick: Windows rzadko daje URL okładki przez PowerShell.
        // Dajemy logo Spotify jako placeholder
        artEl.src = "style-css/spotify.png";
    }

    // Aktualizacja Mini Playera na dole strony
    updateMiniPlayer(data.title, data.artist, 'system');
}

export function hidePlayer() {
    // Jeśli nic nie gra, wracamy do widoku "Otwórz aplikację"
    document.getElementById('player-view').style.display = 'none';
    document.getElementById('login-view').style.display = 'block';

    if (state.activeSource !== 'radio') {
        updateMiniPlayer("", "", "none");
    }
}

export function updateMiniPlayer(title, sub, type) {
    const p = document.getElementById('mini-player');
    if (type === 'none') {
        p.classList.add('hidden');
        return;
    }
    p.classList.remove('hidden');
    document.getElementById('mini-title').innerText = title;
    document.getElementById('mini-subtitle').innerText = sub;
    state.activeSource = type;
}

export function controlSystemMedia(action) {
    // Wysyłamy komendy (play/pause/next) do backendu, który użyje nircmd/keyboard simulation
    fetch('/api/media/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
    }).then(() => {
        // Po kliknięciu odśwież szybciej status
        setTimeout(checkSystemMedia, 500);
    }).catch(console.error);
}