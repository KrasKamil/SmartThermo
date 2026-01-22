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
                playRadio(station.streamUrl, station.title);
                highlightActiveStation(index);
                // Zamknij popup po wyborze (opcjonalne, odkomentuj jeśli chcesz)
                // window.closeRadioPopup(); 
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
    const label = document.getElementById('radio-now-playing');

    // 1. Ucisz system (Spotify itp.), żeby nie grały dwie rzeczy naraz
    fetch('/api/media/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'pause' }) }).catch(() => {});

    // 2. Włącz radio
    player.src = url;
    if (label) label.innerText = `Gram: ${name}`;

    player.play().then(() => {
        // 3. Ustaw stan
        state.isRadioPlaying = true;
        state.isPlaying = true; // Ważne dla spójności
        state.activeSource = 'radio';

        // 4. Zaktualizuj Duży Widget na pulpicie
        const radioTrack = {
            title: name,
            artist: "Radio Internetowe",
            cover: "style-css/radio.svg",
            source: "Radio",
            type: "radio"
        };
        showPlayer(radioTrack);

        // 5. Upewnij się, że animacja i przycisk są w stanie "Playing"
        updateUIState(true);

    }).catch(console.error);
}

export function toggleRadioPlay() {
    const player = document.getElementById('radio-audio');

    if (player.paused) {
        // WZNAWIANIE
        player.play();
        state.isRadioPlaying = true;
        state.isPlaying = true;
        state.activeSource = 'radio';
        updateUIState(true);
    } else {
        // PAUZOWANIE
        player.pause();
        // Nie zmieniamy activeSource na 'none', żeby widget nie zniknął!
        // Tylko oznaczamy, że nie gra.
        state.isRadioPlaying = false;
        state.isPlaying = false;
        updateUIState(false);
    }
}

// Funkcja aktualizująca wygląd przycisku w Mini Playerze
function updateUIState(isPlaying) {
    const playBtn = document.querySelector('#play-pause-btn');
    const anim = document.getElementById('music-anim');

    if (isPlaying) {
        if (playBtn) playBtn.innerHTML = '⏸';
        if (anim) anim.classList.remove('paused');
    } else {
        if (playBtn) playBtn.innerHTML = '▶️';
        if (anim) anim.classList.add('paused');
    }
}