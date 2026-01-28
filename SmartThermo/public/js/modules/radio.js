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

    player.src = url;
    player.play().then(() => {
        state.isRadioPlaying = true;
        state.isPlaying = true; // Dla globalnego stanu
        state.activeSource = 'radio'; // Ustawiamy źródło na Radio

        // Ustawiamy okładkę i tytuł w głównym playerze
        const radioTrack = {
            title: name,
            artist: "Radio Internetowe",
            cover: "style-css/img/radio.svg",
            source: "Radio",
            type: "radio"
        };
        showPlayer(radioTrack);
        updateUIState(true);

    }).catch(console.error);
}

export function toggleRadioPlay() {
    const player = document.getElementById('radio-audio');
    if (!player) return;

    if (player.paused) {
        // PLAY
        console.log("Wznawianie radia (lokalnie + serwer)");
        player.play();
        state.isRadioPlaying = true;
        state.isPlaying = true;
        updateUIState(true);

        // Wyślij, co teraz gramy, żeby serwer wiedział
        const currentStation = state.globalStationList[state.currentStationIndex];
        if (currentStation) {
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
        console.log("Pauzowanie radia -> Wysyłam STOP do serwera");
        player.pause();
        state.isRadioPlaying = false;
        state.isPlaying = false;
        updateUIState(false);

        // Wyślij PAUSE do serwera - to musi zabić stan na backendzie!
        fetch('/api/media/control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'pause' })
        });
    }
}

// Funkcja aktualizująca wygląd przycisku w Mini Playerze
function updateUIState(isPlaying) {
    const playBtn = document.querySelector('#play-pause-btn');
    // POPRAWKA: Nowe ID equalizera
    const equalizer = document.getElementById('equalizer-anim');

    if (isPlaying) {
        if (playBtn) playBtn.innerHTML = '<i class="fas fa-pause"></i>';
        // POPRAWKA: Usuwamy klasę hidden-anim, żeby pokazać słupki
        if (equalizer) equalizer.classList.remove('hidden-anim');
    } else {
        if (playBtn) playBtn.innerHTML = '<i class="fas fa-play"></i>';
        // POPRAWKA: Dodajemy klasę hidden-anim, żeby ukryć słupki
        if (equalizer) equalizer.classList.add('hidden-anim');
    }
}