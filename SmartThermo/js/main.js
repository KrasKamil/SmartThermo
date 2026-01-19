// js/main.js

import { initClock } from './modules/clock.js';
import { fetchWeather, clearWeatherData } from './modules/weather.js';
import { handleSpotifyToken } from './modules/spotify.js';
import { loadStations, playRadio, toggleRadioPlay } from './modules/radio.js'; // Dodano toggleRadioPlay
import { checkSystemMedia, controlSystemMedia } from './modules/systemPlayer.js';
import { scanBluetooth, connectBluetooth } from './modules/bluetooth.js';
import { toggleTheme, controlVolume, openPopup, closePopup } from './modules/ui.js';
import { initVoiceAssistant } from './modules/voice.js';
import { state } from './modules/state.js'; // Importujemy stan, żeby sprawdzać źródło

document.addEventListener('DOMContentLoaded', () => {
    initClock();
    fetchWeather();
    handleSpotifyToken();
    loadStations();
    initVoiceAssistant();
    setInterval(checkSystemMedia, 3000);
    checkSystemMedia();
});

// Eksporty do window (dla onclick w HTML)
window.ClearData = clearWeatherData;
window.toggleTheme = toggleTheme;
window.openSpotifyPopup = () => openPopup('spotify-overlay');
window.closeSpotifyPopup = () => closePopup('spotify-overlay');
window.openRadioPopup = () => openPopup('radio-overlay');
window.closeRadioPopup = () => closePopup('radio-overlay');
window.openSettingsPopup = () => openPopup('settings-overlay');
window.closeSettingsPopup = () => closePopup('settings-overlay');
window.controlVolume = controlVolume;
window.scanBluetooth = scanBluetooth;
window.connectBluetooth = connectBluetooth;
window.controlSystemMedia = controlSystemMedia;

// --- STEROWANIE MINI PLAYEREM (Radio vs System) ---
window.miniControl = (action) => {
    // 1. Jeśli gra RADIO INTERNETOWE
    if (state.activeSource === 'radio') {
        if (action === 'play') {
            toggleRadioPlay();
        } else if (action === 'next' || action === 'prev') {
            // Obsługa zmiany stacji
            if (state.globalStationList.length > 0) {
                let direction = (action === 'next') ? 1 : -1;
                state.currentStationIndex += direction;

                // Pętla listy
                if (state.currentStationIndex >= state.globalStationList.length) state.currentStationIndex = 0;
                if (state.currentStationIndex < 0) state.currentStationIndex = state.globalStationList.length - 1;

                const nextStation = state.globalStationList[state.currentStationIndex];

                // Wywołaj playRadio z nowego indeksu (to też zaktualizuje klasę .active!)
                // Symulujemy kliknięcie w kafelek, żeby logika .active zadziałała
                const tile = document.getElementById(`station-tile-${state.currentStationIndex}`);
                if (tile) tile.click();
                else playRadio(nextStation.streamUrl, nextStation.title);
            }
        }
    }
    // 2. W przeciwnym razie steruj SYSTEMEM (Spotify/BT)
    else {
        if (action === 'play') controlSystemMedia('playpause');
        if (action === 'next') controlSystemMedia('next');
        if (action === 'prev') controlSystemMedia('prev');
    }
};