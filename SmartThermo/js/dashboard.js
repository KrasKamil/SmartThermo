// --- GLOBALNE ZMIENNE STANU ---
let activeSource = 'none'; // 'spotify' lub 'radio'
let globalStationList = []; // Lista stacji radiowych
let currentStationIndex = -1; // Które radio teraz gra?
let isRadioPlaying = false;
let stationsLoaded = false;
let currentPlayPromise = null;
let use24HourFormat = false;
let lastTrackTitle = "";

// --- 1. OBSŁUGA UI (Motyw, Popup) ---

async function loadAppConfig() {
    try {
        const res = await fetch('http://localhost:8888/api/config'); // lub relatywnie '/api/config'
        const data = await res.json();

        if (data.clockFormat === '24') {
            use24HourFormat = true;
            console.log("🕒 Tryb zegara: 24h");
        } else {
            use24HourFormat = false;
            console.log("🕒 Tryb zegara: 12h (AM/PM)");
        }
        // Wymuś odświeżenie zegara od razu po pobraniu konfigu
        updateClock();
    } catch (e) {
        console.error("Nie udało się pobrać konfiguracji zegara", e);
    }
}

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

    let pe = ""; // AM/PM lub puste
    let hourShow = hou;

    // LOGIKA FORMATU
    if (use24HourFormat) {
        // Tryb 24h: Godzina bez zmian (0-23), brak dopisku AM/PM
        pe = "";
    } else {
        // Tryb 12h: Logika AM/PM
        pe = "AM";
        if (hourShow == 0) hourShow = 12;
        if (hourShow > 12) {
            hourShow -= 12;
            pe = 'PM';
        }
    }

    const pad = (num) => num.toString().padStart(2, '0');
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const week = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    // Aktualizacja daty
    const ids = ["dayname", "month", "daynum", "year", "hour", "minute", "second", "period"];
    const values = [week[dname], months[mo], pad(dnum), yr, pad(hourShow), pad(min), pad(sec), pe];

    for (let i = 0; i < ids.length; i++) {
        const el = document.getElementById(ids[i]);
        if (el) {
            el.textContent = values[i];

            // [OPCJONALNIE] Ukryj element 'period' (AM/PM) jeśli jest tryb 24h, żeby nie było pustego miejsca
            if (ids[i] === "period") {
                el.style.display = use24HourFormat ? "none" : "inline-block";
            }
        }
    }
}

function initClock() {
    loadAppConfig(); // Pobierz konfigurację przy starcie
    updateClock();
    window.setInterval(updateClock, 1000);
    window.setInterval(checkSystemMedia, 2000); //  Sprawdzaj media co 2 sekundy
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
    // 1. STEROWANIE SPOTIFY
    if (activeSource === 'spotify') {
        if (typeof togglePlayback === 'function' && typeof controlSpotify === 'function') {
            if (action === 'play') togglePlayback();
            else if (action === 'next') controlSpotify('next');
            else if (action === 'prev') controlSpotify('previous');
        }
    }
    // 2. STEROWANIE RADIEM
    else if (activeSource === 'radio') {
        if (action === 'play') {
            toggleRadioPlay();
        } else if (action === 'next') {
            changeStation(1);
        } else if (action === 'prev') {
            changeStation(-1);
        }
    }
    // 3. STEROWANIE SYSTEMEM (WINDOWS / BLUETOOTH) - TEGO BRAKOWAŁO
    else if (activeSource === 'system') {
        let serverAction = action;

        // Mapowanie akcji dla serwera
        // Jeśli klikamy "play/pause" w playerze, wysyłamy do Windowsa 'playpause' (klawisz Media Play/Pause)
        if (action === 'play') serverAction = 'playpause';

        console.log("Wysyłam do systemu:", serverAction);

        fetch('http://localhost:8888/api/media/control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: serverAction })
        }).catch(err => console.error("Błąd sterowania:", err));

        // Opcjonalnie: Zaktualizuj wygląd przycisku od razu (dla lepszego wrażenia)
        if (action === 'play') {
            const btn = document.getElementById('mini-play-btn');
            const isPlaying = btn.innerText === '⏸';
            btn.innerText = isPlaying ? '▶️' : '⏸';
            updateMiniPlayerState(!isPlaying);
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

    // 1. ZATRZYMAJ MUZYKĘ W SYSTEMIE (Windows/Spotify)
    // Wysyłamy sygnał Play/Pause do systemu, żeby wyciszyć Bluetooth
    fetch('http://localhost:8888/api/media/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pause' }) // lub 'playpause'
    }).catch(e => console.log("Nie udało się spauzować systemu"));

    // 2. Reszta starego kodu radia...
    player.pause();
    player.currentTime = 0;
    label.innerText = `Łączę z: ${name}... 📡`;
    controls.classList.remove('hidden');
    controls.style.display = 'block';

    player.src = url;
    player.load();

    const playPromise = player.play();
    if (playPromise !== undefined) {
        playPromise
            .then(() => {
                label.innerText = `Gram: ${name} 🎵`;
                label.style.color = "#00ff00";
                isRadioPlaying = true;
                updateMiniPlayer(name, "Radio Internetowe", "radio");
            })
            .catch(error => { /* obsługa błędów bez zmian */ });
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
    } else if (type === 'system') {
        iconEl.innerText = '💻';
        player.style.borderLeft = '4px solid #ffffff';
        playBtn.innerText = '⏸';
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
// --- 9. USTAWIENIA & BLUETOOTH ---

function openSettingsPopup() {
    const overlay = document.getElementById('settings-overlay');
    overlay.classList.remove('hidden');
    overlay.style.display = 'flex';
}

function closeSettingsPopup() {
    const overlay = document.getElementById('settings-overlay');
    overlay.classList.add('hidden');
    overlay.style.display = 'none';
}

async function scanBluetooth() {
    const list = document.getElementById('bt-device-list');
    const status = document.getElementById('bt-status');

    list.innerHTML = '<li style="color: #ccc; text-align: center;">Szukam urządzeń... ⏳</li>';
    status.innerText = "";

    try {
        const res = await fetch('http://localhost:8888/api/bluetooth/scan');
        const devices = await res.json();

        list.innerHTML = '';

        if (devices.length === 0) {
            list.innerHTML = '<li style="color: #aaa; text-align: center;">Nie znaleziono urządzeń. Upewnij się, że Bluetooth w telefonie jest widoczny.</li>';
            return;
        }

        devices.forEach(dev => {
            const li = document.createElement('li');
            li.className = 'bt-item';

            // Ukryj dziwne nazwy lub puste
            const name = dev.name.trim() || dev.mac;

            li.innerHTML = `
                <span>📱 ${name}</span>
                <button onclick="connectBluetooth('${dev.mac}')">Połącz</button>
            `;
            list.appendChild(li);
        });

    } catch (e) {
        console.error(e);
        list.innerHTML = '<li style="color: red;">Błąd skanowania</li>';
    }
}

async function connectBluetooth(mac) {
    const status = document.getElementById('bt-status');
    status.innerText = "Łączenie... (Zaakceptuj parowanie na telefonie)";
    status.style.color = "#00d2ff";

    try {
        const res = await fetch('http://localhost:8888/api/bluetooth/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mac: mac })
        });

        const data = await res.json();

        if (data.status === 'success') {
            status.innerText = "✅ " + data.message;
            status.style.color = "#4CAF50";
        } else {
            status.innerText = "⚠️ " + data.message;
            status.style.color = "orange";
        }
    } catch (e) {
        status.innerText = "❌ Błąd połączenia";
        status.style.color = "red";
    }
}

// --- 10. SPRAWDZANIE MEDIÓW SYSTEMOWYCH (Bluetooth) ---
async function checkSystemMedia() {
    try {
        const res = await fetch('http://localhost:8888/api/media/now-playing');
        const data = await res.json();

        if (data.status === 'Playing') {

            // --- POPRAWIONA LOGIKA PRIORYTETÓW ---

            // 1. Jeśli Radio GRA, to ono ma pierwszeństwo. 
            // Ignorujemy Bluetooth, żeby nie podmieniał napisów w trakcie słuchania stacji.
            if (activeSource === 'radio' && isRadioPlaying) {
                return;
            }

            // 2. Jeśli Radio NIE GRA (jest pauza) lub źródłem jest co innego -> Pokaż Bluetooth.
            // Dzięki temu jak zapauzujesz radio i puścisz muzykę z telefonu, player się zaktualizuje.
            updateMiniPlayer(data.title, data.artist, 'system');

            if (lastTrackTitle !== data.title) {
                lastTrackTitle = data.title;
                // console.log("🎵 Wykryto sprzęt/muzykę:", data.title);
            }

        } else if (activeSource === 'system') {
            updateMiniPlayerState(false);
            document.getElementById('mini-subtitle').innerText = "Wstrzymano (System)";
        }
    } catch (e) {
        // cicho sza
    }
}
// --- 11. STEROWANIE GŁOŚNOŚCIĄ ---

function controlVolume(action) {
    // Efekt kliknięcia (opcjonalny, dla lepszego UX)
    console.log("🔊 Zmieniam głośność:", action);

    fetch('http://localhost:8888/api/media/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: action })
    }).catch(e => console.error("Błąd głośności:", e));
}