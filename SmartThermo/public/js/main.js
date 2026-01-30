// js/main.js
import { initClock } from './modules/clock.js';
import { fetchWeather, updateWeatherUI, clearWeatherData, initChartToggle } from './modules/weather.js';
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
import { startDailyInterval } from './modules/daily.js';
// Importujemy initNotes. Funkcja openHistoryPopup jest globalna, 
import { initNotes } from './modules/notes.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Inicjalizacja Socket.io
    // io() jest dostępne globalnie dzięki skryptowi w HTML
    const socket = io();

    socket.on('connect', () => {
        console.log("🟢 Połączono z Socket.io (Real-time)");
    });

    // Jak serwer krzyknie "weather_update", aktualizujemy UI
    socket.on('weather_update', (data) => {
        console.log("⚡ Otrzymano nową pogodę przez Socket!", data);
        updateWeatherUI(data);
    });

    //Reakcja na zmianę muzyki
    socket.on('media_update', (data) => {
        console.log("🎵 Media Update (Socket):", data);
        updatePlayerUI(data); // Wywołujemy funkcję aktualizującą UI
    });

    // 2. Standardowy start modułów
    initClock();

    // Pobierz pogodę raz na start (żeby nie czekać na pierwszy sygnał z czujnika)
    fetchWeather();
    // UWAGA: Usunęliśmy setInterval dla pogody! Już nie musimy pytać co chwila.

    initChartToggle();
    loadStations();
    initVoiceAssistant();

    // 3. Media i System (tu można zostawić interwał lub też przenieść na sockety w przyszłości)
    setInterval(checkSystemMedia, 2000);
    checkSystemMedia();

    // 4. Reszta modułów
    initAirQuality();
    startDailyInterval();
    initNotes();
    setupEventListeners();

    // Obsługa widgetów (UI)
    const weatherContainer = document.getElementById('weather-container');
    const toggleBtn = document.getElementById('toggle-weather-table');
    if (toggleBtn && weatherContainer) {
        toggleBtn.addEventListener('click', () => {
            weatherContainer.classList.toggle('collapsed');
        });
    }

    const dailyWidget = document.getElementById('daily-widget');
    const toggleDailyBtn = document.getElementById('toggle-daily-widget');
    if (toggleDailyBtn && dailyWidget) {
        toggleDailyBtn.addEventListener('click', () => {
            dailyWidget.classList.toggle('collapsed');
        });
    }
});

// Eksporty globalne (dla HTML onClick)

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

function updatePlayerUI(data) {
    const audioPlayer = getRadioPlayer();

    // 1. Logika dla RADIA
    if (data.source === 'Radio') {
        if (data.status === 'Playing' && data.streamUrl) {
            if (audioPlayer.src !== data.streamUrl || audioPlayer.paused) {
                console.log("📻 Start Radia:", data.title);
                audioPlayer.src = data.streamUrl;
                audioPlayer.play().catch(e => console.warn("Autoplay block:", e));
            }
        } else {
            audioPlayer.pause();
        }
        // Ustaw okładkę radia
        const art = document.getElementById('current-art');
        if (art) art.src = data.cover || 'style-css/img/radio.svg';
    }
    // 2. Logika dla SYSTEMU (Spotify/YouTube)
    else if (data.source === 'System') {
        if (!audioPlayer.paused) {
            audioPlayer.pause();
        }

        const trackTitle = document.getElementById('current-track');
        const trackArtist = document.getElementById('current-artist');
        const trackArt = document.getElementById('current-art'); // 👇 Pobieramy element obrazka

        if (trackTitle) trackTitle.innerText = data.title || "Brak muzyki";
        if (trackArtist) trackArtist.innerText = data.artist || "System";

        // 👇 Ustawiamy okładkę z Base64 (lub domyślną)
        if (trackArt) {
            if (data.cover && data.cover.startsWith('data:image')) {
                trackArt.src = data.cover;
            } else {
                trackArt.src = 'style-css/img/spotify.png'; // Domyślna
            }
        }

        const widget = document.getElementById('spotify-widget');
        if (widget) {
            if (data.status === 'Playing') {
                widget.style.display = 'block';
                document.getElementById('login-view').style.display = 'none';
                document.getElementById('player-view').style.display = 'block';
            }
        }
    }
}