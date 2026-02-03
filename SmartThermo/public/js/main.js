// public/js/main.js
import { initClock } from './modules/clock.js';
import { fetchWeather, updateWeatherUI, clearWeatherData, initChartToggle } from './modules/weather.js';
import { loadStations } from './modules/radio.js';
import { miniControl, controlSystemMedia } from './modules/systemPlayer.js';
import { scanBluetooth, connectBluetooth } from './modules/bluetooth.js';
import { initVoiceAssistant } from './modules/voice.js';
import { toggleTheme, openPopup, closePopup, handleVolumeInput, setupEventListeners } from './modules/ui.js';
import { initAirQuality, loadAirQuality } from './modules/air.js';
import { startDailyInterval } from './modules/daily.js';
import { initNotes } from './modules/notes.js';
import { state } from './modules/state.js';

document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    socket.on('connect', () => {
        console.log("🟢 Połączono z Socket.io (Real-time)");
    });

    socket.on('weather_update', (data) => {
        updateWeatherUI(data);
    });

    socket.on('media_update', (data) => {
        console.log("📡 [SOCKET] Media Update:", data); // ✅ DODANO: Debug
        updateUnifiedPlayerUI(data);
    });

    // Inicjalizacja modułów
    initClock();
    fetchWeather();
    initChartToggle();
    loadStations();
    initVoiceAssistant();
    initAirQuality();
    startDailyInterval();
    initNotes();
    setupEventListeners();

    // Pobierz stan tylko jeśli radio NIE gra
    if (!state.isRadioPlaying) {
        fetchCurrentMedia();
    }

    // Obsługa widgetów (UI)
    const weatherContainer = document.getElementById('weather-container');
    const toggleBtn = document.getElementById('toggle-weather-table');
    if (toggleBtn && weatherContainer) {
        toggleBtn.addEventListener('click', () => weatherContainer.classList.toggle('collapsed'));
    }
    const dailyWidget = document.getElementById('daily-widget');
    const toggleDailyBtn = document.getElementById('toggle-daily-widget');
    if (toggleDailyBtn && dailyWidget) {
        toggleDailyBtn.addEventListener('click', () => dailyWidget.classList.toggle('collapsed'));
    }
});

async function fetchCurrentMedia() {
    try {
        const res = await fetch('/api/media/now-playing');
        const data = await res.json();
        console.log("📥 [FETCH] Now Playing:", data); // ✅ DODANO: Debug
        if (!state.isRadioPlaying) {
            updateUnifiedPlayerUI(data);
        }
    } catch (e) { console.error("Błąd pobierania mediów:", e); }
}

// ════════════════════════════════════════════════════════════════════════════
// GŁÓWNA FUNKCJA: AKTUALIZACJA UI PLAYERA
// ════════════════════════════════════════════════════════════════════════════
function updateUnifiedPlayerUI(data) {
    const audioPlayer = getRadioPlayer();

    const sourceRaw = data.source || 'none';
    const sourceLower = sourceRaw.toLowerCase();

    console.log(`🎨 [UI] Update | Source: ${sourceLower} | Status: ${data.status} | Radio Playing: ${state.isRadioPlaying}`); // ✅ DODANO: Debug

    // ──────────────────────────────────────────────────────────────────────
    // 🛡️ TARCZA OCHRONNA (Frontend) - TYLKO DLA RADIA
    // ──────────────────────────────────────────────────────────────────────
    if (sourceLower !== 'radio' && state.isRadioPlaying) {
        const timeSinceRadioStart = Date.now() - state.lastRadioStartTimestamp;
        if (timeSinceRadioStart < 5000) {
            console.log("🛡️ [FRONTEND] Ignorowanie fałszywego sygnału Systemu (Radio protection)");
            return;
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    // 1. AKTUALIZACJA STANU
    // ──────────────────────────────────────────────────────────────────────
    state.activeSource = sourceLower;
    state.isPlaying = (data.status === 'Playing');

    // ──────────────────────────────────────────────────────────────────────
    // 2. ELEMENTY UI
    // ──────────────────────────────────────────────────────────────────────
    const trackTitle = document.getElementById('current-track');
    const trackArtist = document.getElementById('current-artist');
    const trackArt = document.getElementById('current-art');
    const playBtn = document.getElementById('play-pause-btn');
    const equalizer = document.getElementById('equalizer-anim');
    const widget = document.getElementById('spotify-widget');

    // ──────────────────────────────────────────────────────────────────────
    // 3. TREŚCI
    // ──────────────────────────────────────────────────────────────────────
    if (trackTitle) trackTitle.innerText = data.title || "Brak muzyki";
    if (trackArtist) trackArtist.innerText = data.artist || "";

    if (trackArt) {
        if (data.cover && data.cover.length > 20) {
            trackArt.src = data.cover;
        } else {
            trackArt.src = (sourceLower === 'radio') ? 'style-css/img/radio.svg' : 'style-css/img/spotify.png';
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    // 4. PRZYCISK PLAY/PAUSE
    // ──────────────────────────────────────────────────────────────────────
    if (playBtn) {
        playBtn.innerHTML = state.isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
    }
    if (equalizer) {
        state.isPlaying ? equalizer.classList.remove('hidden-anim') : equalizer.classList.add('hidden-anim');
    }

    // ──────────────────────────────────────────────────────────────────────
    // 5. OBSŁUGA AUDIO (NAPRAWIONA LOGIKA - BEZ RESETÓW)
    // ──────────────────────────────────────────────────────────────────────
    if (sourceLower === 'radio') {
        state.isRadioPlaying = state.isPlaying;

        if (state.isPlaying && data.streamUrl) {
            const currentSrc = audioPlayer.src;
            const targetSrc = new URL(data.streamUrl, document.baseURI).href;

            const isSrcMatch = currentSrc === targetSrc;

            // ✅ ZMIANA ŹRÓDŁA (nowa stacja)
            if (!isSrcMatch) {
                console.log("📻 [FRONTEND] Zmiana stacji:", data.title);
                audioPlayer.src = data.streamUrl;
                audioPlayer.load();
                audioPlayer.play().catch(e => console.warn("Autoplay block:", e));
            }
            // ✅ WZNOWIENIE (ta sama stacja, ale player stoi)
            else if (audioPlayer.paused) {
                console.log("📻 [FRONTEND] Wznowienie:", data.title);
                audioPlayer.play().catch(e => console.warn("Autoplay block:", e));
            }
            // ✅ GRA DALEJ (nie rób nic!)
        } else {
            // Pauza radia
            if (!audioPlayer.paused) {
                console.log("⏸️ [FRONTEND] Pauza radia");
                audioPlayer.pause();
            }
        }
    } else {
        // Wyłączamy radio przy przełączeniu na System
        state.isRadioPlaying = false;
        if (!audioPlayer.paused) {
            console.log("⏹️ [FRONTEND] Zatrzymuję radio (System aktywny)");
            audioPlayer.pause();
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    // 6. WIDOCZNOŚĆ WIDGETU
    // ──────────────────────────────────────────────────────────────────────
    if (widget) {
        if (state.isPlaying || sourceLower === 'radio' || (data.title && data.title !== "")) {
            widget.style.display = 'flex';

            const loginView = document.getElementById('login-view');
            const playerView = document.getElementById('player-view');

            if (loginView) loginView.style.display = 'none';
            if (playerView) playerView.style.display = 'flex';
        }
    }
}

// ════════════════════════════════════════════════════════════════════════════
// HELPER: POBIERZ ELEMENT AUDIO
// ════════════════════════════════════════════════════════════════════════════
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

// Eksporty globalne
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
window.updatePlayerUI = updateUnifiedPlayerUI;