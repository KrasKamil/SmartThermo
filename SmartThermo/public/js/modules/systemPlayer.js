// public/js/modules/systemPlayer.js
import { toggleRadioPlay, playRadio } from './radio.js';
import { state } from './state.js';

// Ta funkcja jest wywoływana przez przyciski w HTML: onclick="miniControl('next')"
export function miniControl(action) {
    console.log("⏯️ MiniControl:", action, "| Source:", state.activeSource);

    // 1. Jeśli gra RADIO (lub jest wybrane jako aktywne)
    if (state.activeSource === 'radio' || (state.activeSource === 'none' && state.isRadioPlaying)) {
        if (action === 'play' || action === 'playpause') {
            toggleRadioPlay();
        } else if (action === 'next' || action === 'prev') {
            if (state.globalStationList.length > 0) {
                let direction = (action === 'next') ? 1 : -1;
                state.currentStationIndex += direction;

                if (state.currentStationIndex >= state.globalStationList.length) state.currentStationIndex = 0;
                if (state.currentStationIndex < 0) state.currentStationIndex = state.globalStationList.length - 1;

                const nextStation = state.globalStationList[state.currentStationIndex];

                playRadio(nextStation.streamUrl, nextStation.title);

                fetch('/api/media/control', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'play_radio',
                        value: { title: nextStation.title, url: nextStation.streamUrl }
                    })
                });
            }
        }
    }
    // 2. Jeśli gra SYSTEM (Spotify/YouTube)
    else {
        let sysAction = action;
        if (action === 'play') sysAction = 'playpause';

        controlSystemMedia(sysAction);
    }
}

export function controlSystemMedia(action) {
    // 1. 🔥 OPTYMISTYCZNA AKTUALIZACJA UI (NATYCHMIASTOWA) 🔥
    if (window.updatePlayerUI && (action === 'playpause' || action === 'play' || action === 'pause')) {
        let willBePlaying = !state.isPlaying;
        if (action === 'play') willBePlaying = true;
        if (action === 'pause') willBePlaying = false;

        // 👇 DŁUŻSZA WERSJA (BEZPIECZNA DLA STARSZYCH PRZEGLĄDAREK) 👇

        // Tytuł
        var trackEl = document.getElementById('current-track');
        var currentTitle = "System Audio";
        if (trackEl && trackEl.innerText) {
            currentTitle = trackEl.innerText;
        }

        // Artysta
        var artistEl = document.getElementById('current-artist');
        var currentArtist = "";
        if (artistEl && artistEl.innerText) {
            currentArtist = artistEl.innerText;
        }

        // Okładka
        var coverEl = document.getElementById('current-art');
        var currentCover = "";
        if (coverEl && coverEl.src) {
            currentCover = coverEl.src;
        }

        // Wywołujemy główną funkcję UI w main.js
        window.updatePlayerUI({
            source: 'System',
            status: willBePlaying ? 'Playing' : 'Paused',
            title: currentTitle,
            artist: currentArtist,
            cover: currentCover,
            streamUrl: ""
        });
    }

    // 2. Wysyłamy komendę do serwera
    fetch('/api/media/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
    }).catch(function(err) {
        console.error("Błąd sterowania systemem:", err);
    });
}

export function checkSystemMedia() {}