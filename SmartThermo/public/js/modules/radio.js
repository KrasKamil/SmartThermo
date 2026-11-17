// public/js/modules/radio.js
import { state } from './state.js';

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

                if (window.closeRadioPopup) window.closeRadioPopup();
            };
            grid.appendChild(btn);
        });
    } catch (e) {
        console.error("Błąd stacji:", e);
        grid.innerHTML = '<p style="color:red">Błąd sieci</p>';
    }
}

function highlightActiveStation(index) {
    document.querySelectorAll('.radio-tile').forEach(el => el.classList.remove('active'));
    const active = document.getElementById(`station-tile-${index}`);
    if (active) active.classList.add('active');
}

export function playRadio(url, title) {
    const player = document.getElementById('radio-audio');

    state.activeSource = 'radio';
    state.isRadioPlaying = true;
    state.isPlaying = true;
    state.lastRadioStartTimestamp = Date.now();

    if (player) {
        // Reset tylko jeśli URL się zmienia
        const targetSrc = new URL(url, document.baseURI).href;
        if (player.src !== targetSrc) {
            player.src = url;
        }
        player.volume = 1.0;
        player.play().catch(e => console.warn("Autoplay block:", e));
    }

    // Optymistyczny update
    if (window.updatePlayerUI) {
        window.updatePlayerUI({
            source: 'Radio',
            status: 'Playing',
            title: title,
            artist: 'Radio Internetowe',
            streamUrl: url,
            cover: 'style-css/img/radio.svg'
        });
    }

    fetch('/api/media/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'play_radio',
            value: { title: title, url: url }
        })
    }).catch(e => console.error("Błąd serwera:", e));
}

export function toggleRadioPlay() {
    const player = document.getElementById('radio-audio');
    if (!player) return;

    if (player.paused) {
        // Resume
        state.lastRadioStartTimestamp = Date.now();
        if (state.currentStationIndex >= 0 && state.globalStationList[state.currentStationIndex]) {
            const currentStation = state.globalStationList[state.currentStationIndex];
            playRadio(currentStation.streamUrl, currentStation.title);
        }
    } else {
        // Pause
        player.pause();
        state.isPlaying = false;
        // W radio pause działa jak stop dla UI, ale backend pamięta URL
        fetch('/api/media/control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'pause' })
        });
    }
}

// 🔥 NOWA FUNKCJA: Całkowite zatrzymanie radia (Czyści URL)
export function stopRadio() {
    const player = document.getElementById('radio-audio');
    if (player) {
        player.pause();
        player.src = ""; // Czyścimy źródło
        state.isRadioPlaying = false;
        state.isPlaying = false;
        state.activeSource = 'none';
    }

    // Wysyłamy specjalną komendę do backendu
    fetch('/api/media/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop_radio' })
    });
}

// Eksportujemy do window, żeby można było użyć w HTML onclick="stopRadio()"
window.stopRadio = stopRadio;