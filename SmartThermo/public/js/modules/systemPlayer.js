import { toggleRadioPlay, playRadio } from './radio.js';
import { state } from './state.js';

export function miniControl(action) {
    console.log("⏯️ MiniControl:", action, "| Source:", state.activeSource);

    // 1. NEXT/PREV (Tylko Radio)
    if ((state.activeSource === 'radio' || state.isRadioPlaying) && (action === 'next' || action === 'prev')) {
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
        return;
    }

    // 2. PLAY / PAUSE (Zawsze wysyłamy playpause do API)
    if (action === 'play' || action === 'playpause') {
        const playBtn = document.getElementById('play-pause-btn');
        if (playBtn) {
            const isPlaying = playBtn.innerHTML.includes('fa-pause');
            playBtn.innerHTML = isPlaying ? '<i class="fas fa-play"></i>' : '<i class="fas fa-pause"></i>';

            // Lokalne sterowanie audio tagiem dla płynności
            const audio = document.getElementById('radio-audio');
            if (state.activeSource === 'radio' && audio) {
                if (isPlaying) audio.pause();
                else if (audio.src) audio.play().catch(() => {});
            }
        }

        fetch('/api/media/control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'playpause' })
        });
        return;
    }

    // 3. SYSTEM CONTROL
    fetch('/api/media/control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: action })
        })
        .then(() => {
            setTimeout(() => {
                fetch('/api/media/now-playing')
                    .then(r => r.json())
                    .then(data => { if (window.updatePlayerUI) window.updatePlayerUI(data); });
            }, 1000);
        });
}

export function controlSystemMedia(action) {
    miniControl(action);
}