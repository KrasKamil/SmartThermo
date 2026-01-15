// --- GLOBALNE ZMIENNE STANU ---
let activeSource = 'none'; // 'spotify' lub 'radio'
let globalStationList = []; // Lista stacji radiowych
let currentStationIndex = -1; // Które radio teraz gra?
let isRadioPlaying = false;
let stationsLoaded = false;
let currentPlayPromise = null;

// --- 1. OBSŁUGA UI (Motyw, Popup) ---

function toggleTheme() {
    document.body.classList.toggle("light-mode");
}

function openSpotifyPopup() {
    document.getElementById('spotify-overlay').style.display = 'flex';
}

function closeSpotifyPopup() {
    document.getElementById('spotify-overlay').style.display = 'none';
}

// --- 2. ZEGAR ---

function updateClock() {
    const now = new Date();
    const dname = now.getDay(),
        mo = now.getMonth(),
        dnum = now.getDate(),
        yr = now.getFullYear(),
        hou = now.getHours(),
        min = now.getMinutes(),
        sec = now.getSeconds();

    let pe = "AM";
    let hourShow = hou;

    if (hourShow == 0) hourShow = 12;
    if (hourShow > 12) {
        hourShow -= 12;
        pe = 'PM';
    }

    const pad = (num) => num.toString().padStart(2, '0');
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const week = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    const ids = ["dayname", "month", "daynum", "year", "hour", "minute", "second", "period"];
    const values = [week[dname], months[mo], pad(dnum), yr, pad(hourShow), pad(min), pad(sec), pe];

    for (let i = 0; i < ids.length; i++) {
        const el = document.getElementById(ids[i]);
        if (el) el.textContent = values[i];
    }
}

function initClock() {
    updateClock();
    window.setInterval(updateClock, 1000);
    userAction(); // Pobierz pogodę przy starcie
}

// --- 3. POGODA I DANE (Clear & Fetch) ---

function ClearData() {
    const ids = ["City", "Temp_ins", "Hum_ins", "Pressure", "Temp_out", "Wind", "Last_update"];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerText = "";
    });

    const errorMsg = document.getElementById("error-message");
    const table = document.getElementById("weather-table");

    if (errorMsg) errorMsg.classList.add("hidden");
    if (table) table.classList.remove("hidden");

    userAction();
}

const userAction = async() => {
    try {
        const response = await fetch('http://localhost:8888/api/weather');

        if (!response.ok) {
            throw new Error(`Błąd serwera: ${response.status}`);
        }

        const myJson = await response.json();

        document.getElementById("City").innerText = myJson.city || "Brak danych";
        document.getElementById("Temp_ins").innerText = myJson.temp_ins || "-";
        document.getElementById("Hum_ins").innerText = myJson.hum_ins || "-";
        document.getElementById("Pressure").innerText = myJson.pressure || "-";
        document.getElementById("Temp_out").innerText = myJson.temp_out || "-";
        document.getElementById("Wind").innerText = myJson.wind || "-";
        document.getElementById("Last_update").innerText = myJson.due_date || "-";

    } catch (error) {
        console.error("Fetch error:", error);
        document.getElementById("weather-table").classList.add("hidden");
        const errorDiv = document.getElementById("error-message");
        if (errorDiv) {
            errorDiv.classList.remove("hidden");
            document.getElementById("error-text").innerText = "Serwer offline / Brak bazy";
        }
    }
}

// --- 4. FUNKCJE STERUJĄCE MINI PLAYERA ---

function miniControl(action) {
    if (activeSource === 'spotify') {
        // Sterowanie Spotify (funkcje zdefiniowane w script.js)
        // Sprawdzamy czy script.js już załadował te funkcje
        if (typeof togglePlayback === 'function' && typeof controlSpotify === 'function') {
            if (action === 'play') togglePlayback();
            else if (action === 'next') controlSpotify('next');
            else if (action === 'prev') controlSpotify('previous');
        }
    } else if (activeSource === 'radio') {
        // Sterowanie Radiem
        if (action === 'play') {
            toggleRadioPlay();
        } else if (action === 'next') {
            changeStation(1); // Następna
        } else if (action === 'prev') {
            changeStation(-1); // Poprzednia
        }
    }
}

function toggleRadioPlay() {
    const player = document.getElementById('radio-audio');
    const btn = document.getElementById('mini-play-btn');

    if (player.paused) {
        player.play();
        isRadioPlaying = true;
        btn.innerText = '⏸';
        updateMiniPlayerState(true);
    } else {
        player.pause();
        isRadioPlaying = false;
        btn.innerText = '▶️';
        updateMiniPlayerState(false);
    }
}

function changeStation(direction) {
    if (globalStationList.length === 0) return;

    // Oblicz nowy indeks (z pętlą: ostatni -> pierwszy)
    currentStationIndex += direction;

    if (currentStationIndex >= globalStationList.length) currentStationIndex = 0;
    if (currentStationIndex < 0) currentStationIndex = globalStationList.length - 1;

    const nextStation = globalStationList[currentStationIndex];
    playRadio(nextStation.streamUrl, nextStation.title);
}

// --- 5. LOGIKA UI RADIA (POPUP I KAFELKI) ---

function openRadioPopup() {
    const overlay = document.getElementById('radio-overlay');
    if (overlay) {
        overlay.classList.remove('hidden');
        overlay.style.display = 'flex';

        // Załaduj listę tylko raz przy pierwszym otwarciu
        if (!stationsLoaded) {
            loadStations();
        }
    }
}

function closeRadioPopup() {
    const overlay = document.getElementById('radio-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
        overlay.style.display = 'none';
    }
}

async function loadStations() {
    const grid = document.getElementById('stations-grid');
    // Ładny loader
    grid.innerHTML = '<p style="color: #ccc; grid-column: 1/-1; text-align: center; padding: 20px;">Pobieranie stacji... 📡</p>';

    try {
        const res = await fetch('http://localhost:8888/api/radio/list');
        const stations = await res.json();

        // ZAPISUJEMY DO GLOBALNEJ LISTY (DLA PRZYCISKÓW NEXT/PREV)
        globalStationList = stations;

        grid.innerHTML = '';

        stations.forEach((station, index) => {
            // Tworzymy element div z klasą CSS (dla płynności i braku migotania)
            const btn = document.createElement('div');
            btn.className = 'radio-tile';

            // Wypełniamy treścią
            btn.innerHTML = `
                <div class="icon">🎵</div>
                <div class="title">${station.title}</div>
                <div class="subtitle">${station.subtitle}</div>
            `;

            // Kliknięcie uruchamia radio i zapisuje indeks
            btn.onclick = () => {
                currentStationIndex = index;
                playRadio(station.streamUrl, station.title);
            };

            grid.appendChild(btn);
        });

        stationsLoaded = true;

    } catch (e) {
        console.error("Błąd listy stacji:", e);
        grid.innerHTML = '<p style="color: red; grid-column: 1/-1; text-align: center;">Nie udało się pobrać listy stacji (Błąd połączenia).</p>';
    }
}

// --- 6. PANCERNA FUNKCJA ODTWARZANIA RADIA ---

function playRadio(url, name) {
    const player = document.getElementById('radio-audio');
    const label = document.getElementById('radio-now-playing');
    const controls = document.getElementById('radio-player-controls');

    if (!player) return;

    // KROK 1: Twardy Reset (zatrzymaj poprzednie)
    player.pause();
    player.currentTime = 0;

    // UI: Pokaż że ładujemy
    label.innerText = `Łączę z: ${name}... 📡`;
    controls.classList.remove('hidden');
    controls.style.display = 'block';

    console.log(`Radio: ${name} -> ${url}`);

    // KROK 2: Ustawienie źródła i wymuszenie ładowania
    player.src = url;
    player.load();

    // KROK 3: Odtwarzanie z obsługą "Promise Interrupted"
    const playPromise = player.play();

    if (playPromise !== undefined) {
        playPromise
            .then(() => {
                // SUKCES
                label.innerText = `Gram: ${name} 🎵`;
                label.style.color = "#00ff00"; // Zielony sukces
                isRadioPlaying = true;

                // Aktualizuj Mini Player pod zegarem
                updateMiniPlayer(name, "Radio Internetowe", "radio");
            })
            .catch(error => {
                // OBSŁUGA BŁĘDÓW
                if (error.name === 'AbortError') {
                    // To normalne przy szybkim przełączaniu
                    console.log("Przełączono stację (przerwano poprzednią).");
                } else {
                    console.error("Błąd radia:", error);
                    label.innerText = `Błąd: ${name}`;
                    label.style.color = "red";
                    updateMiniPlayer(name, "Błąd odtwarzania", "radio");
                }
            });
    }
}

// --- 7. AKTUALIZACJA MINI PLAYERA (Wygląd) ---

function updateMiniPlayer(title, subtitle, type = 'none') {
    const player = document.getElementById('mini-player');
    const titleEl = document.getElementById('mini-title');
    const subEl = document.getElementById('mini-subtitle');
    const iconEl = document.getElementById('mini-icon');
    const playBtn = document.getElementById('mini-play-btn');

    if (!player) return;

    // Ustawiamy globalny stan źródła
    activeSource = type;

    // Jeśli typ 'none', ukrywamy pasek
    if (type === 'none') {
        player.classList.add('hidden');
        player.style.position = 'absolute';
        return;
    }

    // Pokazujemy pasek
    player.classList.remove('hidden');
    player.style.position = 'static';

    // Teksty
    titleEl.innerText = title;
    subEl.innerText = subtitle;

    // Ikona i kolory zależne od źródła
    if (type === 'spotify') {
        iconEl.innerText = '🎵';
        player.style.borderLeft = '4px solid #1DB954'; // Zielony pasek
        // Przycisk Play w Spotify zależy od danych z API, zaktualizuje się sam
    } else if (type === 'radio') {
        iconEl.innerText = '📻';
        player.style.borderLeft = '4px solid #00d2ff'; // Niebieski pasek
        playBtn.innerText = '⏸'; // Zakładamy że jak włączasz radio, to gra
        updateMiniPlayerState(true);
    }
}

function updateMiniPlayerState(isPlaying) {
    const anim = document.getElementById('mini-anim');
    if (anim) {
        if (isPlaying) {
            anim.style.opacity = '1';
        } else {
            anim.style.opacity = '0.2'; // Przygaś animację jak pauza
        }
    }
}

// --- 8. INICJALIZACJA ---

// Wywołaj ładowanie listy stacji w tle przy starcie, 
// żeby przyciski Next/Prev działały od razu (zanim otworzysz popup)
document.addEventListener('DOMContentLoaded', () => {
    loadStations();
});