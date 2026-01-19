// js/modules/radio.js
import { state } from './state.js';
import { updateMiniPlayer } from './systemPlayer.js';

export async function loadStations() {
    const grid = document.getElementById('stations-grid');
    grid.innerHTML = '<p>Ładowanie...</p>';
    try {
        const res = await fetch('/api/radio/list');
        const stations = await res.json();
        state.globalStationList = stations;
        grid.innerHTML = '';

        stations.forEach((station, index) => {
            const btn = document.createElement('div');
            btn.className = 'radio-tile';
            // Dodajemy ID, żeby łatwo znaleźć kafelek przy przełączaniu Next/Prev
            btn.id = `station-tile-${index}`;

            btn.innerHTML = `<div class="icon">🎵</div><div class="title">${station.title}</div>`;

            btn.onclick = () => {
                state.currentStationIndex = index;
                playRadio(station.streamUrl, station.title);
                highlightActiveStation(index); // <--- Podświetlenie
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

    // Pauzuj system (Windows/Bluetooth), żeby nie grało na dwa fronty
    fetch('/api/media/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'pause' }) }).catch(() => {});

    player.src = url;
    label.innerText = `Gram: ${name}`;

    player.play().then(() => {
        state.isRadioPlaying = true;
        updateMiniPlayer(name, "Radio Internetowe", "radio");
        // Upewnij się, że przycisk playera pokazuje 'Pauza'
        updatePlayButtonUI(true);
    }).catch(console.error);
}

export function toggleRadioPlay() {
    const player = document.getElementById('radio-audio');

    if (player.paused) {
        player.play();
        state.isRadioPlaying = true;
        updatePlayButtonUI(true);
    } else {
        player.pause();
        state.isRadioPlaying = false;
        updatePlayButtonUI(false);
    }
}

// Funkcja aktualizująca wygląd przycisku w Mini Playerze
function updatePlayButtonUI(isPlaying) {
    const btn = document.getElementById('mini-play-btn');
    const anim = document.getElementById('mini-anim');
    if (btn) btn.innerText = isPlaying ? '⏸' : '▶️';
    if (anim) anim.style.opacity = isPlaying ? '1' : '0.2';
}