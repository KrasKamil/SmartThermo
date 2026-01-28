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
    handleVolumeInput,
    setupEventListeners
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
    setInterval(checkSystemMedia, 2000);
    checkSystemMedia();

    // 3. Powietrze i Pogoda
    initAirQuality();
    startDailyInterval();

    // 4. Inicjalizacja notatek i historii (TO JEST KLUCZOWE DLA PRZYCISKU)
    initNotes();
    setupEventListeners();

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

function getRadioPlayer() {
    let player = document.getElementById('radio-audio');
    if (!player) {
        player = document.createElement('audio');
        player.id = 'radio-audio';
        player.style.display = 'none';
        document.body.appendChild(player);
    }
    return player;
}

const audioPlayer = getRadioPlayer();
let lastServerUrl = "";

async function checkServerMusic() {
    try {
        const res = await fetch('/api/media/now-playing');
        const data = await res.json();

        // 1. Radio GRA
        if (data.source === 'Radio' && data.status === 'Playing' && data.streamUrl) {
            if (lastServerUrl !== data.streamUrl) {
                console.log("📻 (Main) Zmiana stacji:", data.title);
                audioPlayer.src = data.streamUrl;
                lastServerUrl = data.streamUrl;
                audioPlayer.play().catch(e => console.warn("Autoplay block:", e));
            } else {
                if (audioPlayer.paused && audioPlayer.src) {
                    audioPlayer.play().catch(e => {});
                }
            }
        }
        // 2. Radio ZAPAUZOWANE (Nowość)
        else if (data.source === 'Radio' && data.status === 'Paused') {
            // Jeśli mamy załadowany ten URL, po prostu pauzujemy (nie czyścimy bufora!)
            if (!audioPlayer.paused) {
                console.log("⏸️ Pauza radia (z serwera)");
                audioPlayer.pause();
            }
            // Upewniamy się, że src jest ustawione (np. po odświeżeniu strony)
            if (!audioPlayer.src && data.streamUrl) {
                audioPlayer.src = data.streamUrl;
                lastServerUrl = data.streamUrl;
            }
        }
        // 3. INNE (STOP lub inne źródło)
        else {
            // Czyścimy tylko jeśli myśleliśmy, że gra radio
            if (lastServerUrl !== "") {
                console.log("⏹️ Stop radia (inne źródło lub Stop)");
                audioPlayer.pause();
                audioPlayer.src = "";
                audioPlayer.load();
                lastServerUrl = "";
            }
        }

    } catch (e) { console.error(e); }
}

setInterval(checkServerMusic, 1000);