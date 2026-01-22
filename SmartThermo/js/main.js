// js/main.js
import { initClock } from './modules/clock.js';
import { fetchWeather, clearWeatherData } from './modules/weather.js';
import { handleSpotifyToken } from './modules/spotify.js';
import { loadStations, toggleRadioPlay, playRadio } from './modules/radio.js';
import { checkSystemMedia, controlSystemMedia } from './modules/systemPlayer.js';
import { scanBluetooth, connectBluetooth } from './modules/bluetooth.js';
import { initVoiceAssistant } from './modules/voice.js';
import { state } from './modules/state.js';
import {
    toggleTheme,
    openPopup,
    closePopup,
    handleVolumeInput
} from './modules/ui.js';

document.addEventListener('DOMContentLoaded', () => {
    initClock();
    fetchWeather();
    handleSpotifyToken();
    loadStations();
    initVoiceAssistant();

    // Sprawdzanie mediów co 3 sekundy
    setInterval(checkSystemMedia, 3000);
    checkSystemMedia();
});

// Eksporty do window (aby HTML je widział)
window.ClearData = clearWeatherData;
window.toggleTheme = toggleTheme;
window.openSpotifyPopup = () => openPopup('spotify-overlay');
window.closeSpotifyPopup = () => closePopup('spotify-overlay');
window.openRadioPopup = () => openPopup('radio-overlay');
window.closeRadioPopup = () => closePopup('radio-overlay');
window.openSettingsPopup = () => openPopup('settings-overlay');
window.closeSettingsPopup = () => closePopup('settings-overlay');
window.handleVolumeInput = handleVolumeInput;
window.scanBluetooth = scanBluetooth;
window.connectBluetooth = connectBluetooth;

// --- TO JEST FUNKCJA, KTÓREJ BRAKOWAŁO ---
window.miniControl = (action) => {
    // 1. Jeśli gra RADIO INTERNETOWE
    if (state.activeSource === 'radio') {
        if (action === 'play' || action === 'playpause') {
            toggleRadioPlay();
        } else if (action === 'next' || action === 'prev') {
            if (state.globalStationList.length > 0) {
                let direction = (action === 'next') ? 1 : -1;
                state.currentStationIndex += direction;

                // Pętla listy
                if (state.currentStationIndex >= state.globalStationList.length) state.currentStationIndex = 0;
                if (state.currentStationIndex < 0) state.currentStationIndex = state.globalStationList.length - 1;

                const nextStation = state.globalStationList[state.currentStationIndex];

                // Przełącz stację
                playRadio(nextStation.streamUrl, nextStation.title);
            }
        }
    }
    // 2. W przeciwnym razie steruj SYSTEMEM (Spotify/BT)
    else {
        // Mapowanie akcji 'play' na 'playpause' dla systemu Windows
        let sysAction = action;
        if (action === 'play') sysAction = 'playpause';

        controlSystemMedia(sysAction);
    }
};

window.controlSystemMedia = controlSystemMedia; // Dla kompatybilności