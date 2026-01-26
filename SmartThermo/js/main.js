// js/main.js
import { initClock } from './modules/clock.js';
import { fetchWeather, clearWeatherData, initChartToggle } from './modules/weather.js';
import { loadStations } from './modules/radio.js';
import { checkSystemMedia, controlSystemMedia, miniControl } from './modules/systemPlayer.js';
import { scanBluetooth, connectBluetooth } from './modules/bluetooth.js';
import { initVoiceAssistant } from './modules/voice.js';
import {
    toggleTheme,
    openPopup,
    closePopup,
    handleVolumeInput
} from './modules/ui.js';
import { initAirQuality, loadAirQuality } from './modules/air.js';
import { initDaily, startDailyInterval } from './modules/daily.js';

// Importujemy initNotes. Funkcja openHistoryPopup jest globalna, więc jej tu nie wymieniamy.
import { initNotes } from './modules/notes.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Uruchamiamy podstawowe moduły
    initClock();
    fetchWeather();
    initChartToggle();
    loadStations();
    initVoiceAssistant();

    // 2. Media i System
    setInterval(checkSystemMedia, 3000);
    checkSystemMedia();

    // 3. Powietrze i Pogoda
    initAirQuality();
    startDailyInterval();

    // 4. Inicjalizacja notatek i historii (TO JEST KLUCZOWE DLA PRZYCISKU)
    initNotes();

    // Obsługa rozwijania/zwijania tabeli pogody
    const weatherContainer = document.getElementById('weather-container');
    const toggleBtn = document.getElementById('toggle-weather-table');
    if (toggleBtn && weatherContainer) {
        toggleBtn.addEventListener('click', () => {
            weatherContainer.classList.toggle('collapsed');
        });
    }

    // Obsługa rozwijania/zwijania widgetu daily
    const dailyWidget = document.getElementById('daily-widget');
    const toggleDailyBtn = document.getElementById('toggle-daily-widget');
    if (toggleDailyBtn && dailyWidget) {
        toggleDailyBtn.addEventListener('click', () => {
            dailyWidget.classList.toggle('collapsed');
        });
    }
});

// Eksporty do window (aby HTML je widział w onclick="")
window.ClearData = clearWeatherData;
window.toggleTheme = toggleTheme;
window.fetchWeather = fetchWeather;
window.openSpotifyPopup = () => openPopup('spotify-overlay');
window.closeSpotifyPopup = () => closePopup('spotify-overlay');
window.openRadioPopup = () => openPopup('radio-overlay');
window.closeRadioPopup = () => closePopup('radio-overlay');
window.openSettingsPopup = () => openPopup('settings-overlay');
window.closeSettingsPopup = () => closePopup('settings-overlay');
window.handleVolumeInput = handleVolumeInput;
window.scanBluetooth = scanBluetooth;
window.connectBluetooth = connectBluetooth;
window.miniControl = miniControl;
window.controlSystemMedia = controlSystemMedia;
window.loadAirQuality = loadAirQuality;