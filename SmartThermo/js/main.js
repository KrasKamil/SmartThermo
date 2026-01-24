// js/main.js
import { initClock } from './modules/clock.js';
import { fetchWeather, clearWeatherData } from './modules/weather.js';
import { handleSpotifyToken } from './modules/spotify.js';
import { loadStations, toggleRadioPlay, playRadio } from './modules/radio.js';
import { checkSystemMedia, controlSystemMedia, miniControl } from './modules/systemPlayer.js';
import { scanBluetooth, connectBluetooth } from './modules/bluetooth.js';
import { initVoiceAssistant } from './modules/voice.js';
import { state } from './modules/state.js';
import {
    toggleTheme,
    openPopup,
    closePopup,
    handleVolumeInput
} from './modules/ui.js';
import { initAirQuality, loadAirQuality } from './modules/air.js'
import { initDaily } from './modules/daily.js';

document.addEventListener('DOMContentLoaded', () => {
    initClock();
    fetchWeather();
    import ('./modules/weather.js').then(mod => mod.updateChart && mod.updateChart());
    handleSpotifyToken();
    loadStations();
    initVoiceAssistant();

    // Sprawdzanie mediów co 3 sekundy
    setInterval(checkSystemMedia, 3000);
    checkSystemMedia();
    initAirQuality();
    initDaily();

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

// Eksporty do window (aby HTML je widział)
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
window.controlSystemMedia = controlSystemMedia; // Dla kompatybilności
window.loadAirQuality = loadAirQuality;