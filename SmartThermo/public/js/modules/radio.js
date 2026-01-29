// js/modules/radio.js
import { state } from './state.js';
import { showPlayer, updateMiniPlayer } from './systemPlayer.js';

export async function loadStations() {
    const grid = document.getElementById('stations-grid');
    if (!grid) return;

    grid.innerHTML = '<p>Ładowanie...</p>';
    try {
        const res = await fetch('/api/radio/list');
        const stations = await res.json();
        state.globalStationList = stations;
        grid.innerHTML = '';

        stations.forEach((station, index) => {
            const btn = document.createElement('div');
            btn.className = 'radio-tile';
            btn.id = `station-tile-${index}`;

            btn.innerHTML = `<div class="icon">🎵</div><div class="title">${station.title}</div>`;

            btn.onclick = () => {
                state.currentStationIndex = index;

                // 1. Graj natychmiast lokalnie
                playRadio(station.streamUrl, station.title);
                highlightActiveStation(index);

                // 2. WYŚLIJ INFO DO SERWERA (żeby zapamiętał nową stację)
                fetch('/api/media/control', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'play_radio',
                        value: {
                            title: station.title,
                            url: station.streamUrl
                        }
                    })
                }).catch(err => console.error("Błąd synchro radia:", err));
            };
            grid.appendChild(btn);
        });
    } catch (e) {
        grid.innerHTML = '<p style="color:red">Błąd listy</p>';
    }
}

// Funkcja pomocnicza do zmiany klasy CSS
function highlightActiveStation(index) {
    // 1. Usuń .active ze wszystkich
    document.querySelectorAll('.radio-tile').forEach(el => el.classList.remove('active'));

    // 2. Dodaj .active do wybranego
    const activeTile = document.getElementById(`station-tile-${index}`);
    if (activeTile) {
        activeTile.classList.add('active');
        // Opcjonalnie: Przewiń listę do wybranej stacji
        activeTile.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

export function playRadio(url, name) {
    const player = document.getElementById('radio-audio');
    if (!player) return;

    // --- 1. OPTYMISTYCZNA AKTUALIZACJA UI (NATYCHMIAST) ---
    // Nie czekamy na buforowanie dźwięku, zmieniamy napisy od razu!

    state.isRadioPlaying = true;
    state.isPlaying = true;
    state.activeSource = 'radio';

    const radioTrack = {
        title: name,
        artist: "Radio Internetowe",
        cover: "style-css/img/radio.svg",
        source: "Radio",
        type: "radio"
    };

    // Aktualizujemy główny player
    showPlayer(radioTrack);
    updateUIState(true);

    // Aktualizujemy podświetlenie kafelka (jeśli znamy index)
    if (state.currentStationIndex >= 0) {
        highlightActiveStation(state.currentStationIndex);
    }

    // --- 2. ODTWARZANIE DŹWIĘKU ---
    player.src = url;
    player.play().catch(e => console.error("Błąd odtwarzania radia (może być przerwane):", e));
}

export function toggleRadioPlay() {
    const player = document.getElementById('radio-audio');
    if (!player) return;

    if (player.paused) {
        // PLAY
        console.log("Wznawianie radia");
        player.play();
        state.isRadioPlaying = true;
        state.isPlaying = true;
        updateUIState(true);

        const currentStation = state.globalStationList[state.currentStationIndex];
        if (currentStation) {
            // Odśwież UI na wypadek gdyby było stare
            showPlayer({
                title: currentStation.title,
                artist: "Radio Internetowe",
                cover: "style-css/img/radio.svg",
                source: "Radio",
                type: "radio"
            });

            fetch('/api/media/control', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'play_radio',
                    value: {
                        title: currentStation.title,
                        url: currentStation.streamUrl
                    }
                })
            });
        }
    } else {
        // PAUSE
        console.log("Pauzowanie radia");
        player.pause();
        state.isRadioPlaying = false;
        state.isPlaying = false;
        updateUIState(false);

        fetch('/api/media/control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'pause' })
        });
    }
}

function updateUIState(isPlaying) {
    const playBtn = document.querySelector('#play-pause-btn');
    const equalizer = document.getElementById('equalizer-anim');

    if (isPlaying) {
        if (playBtn) playBtn.innerHTML = '<i class="fas fa-pause"></i>';
        if (equalizer) equalizer.classList.remove('hidden-anim');
    } else {
        if (playBtn) playBtn.innerHTML = '<i class="fas fa-play"></i>';
        if (equalizer) equalizer.classList.add('hidden-anim');
    }
}