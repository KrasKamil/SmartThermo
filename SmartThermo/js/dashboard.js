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

    // Helper do dodawania zera (np. 05 zamiast 5)
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
    window.setInterval(updateClock, 1000); // Odświeżanie co sekundę

    // Pobierz dane pogodowe przy starcie
    userAction();
}

// --- 3. POGODA I DANE (Clear & Fetch) ---

// Twoja funkcja czyszcząca
function ClearData() {
    // Czyścimy tekst w tabeli
    const ids = ["City", "Temp_ins", "Hum_ins", "Pressure", "Temp_out", "Wind", "Last_update"];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerText = ""; // Pusty tekst
    });

    // Resetujemy widok (ukryj błąd, pokaż tabelę)
    const errorMsg = document.getElementById("error-message");
    const table = document.getElementById("weather-table");

    if (errorMsg) errorMsg.classList.add("hidden");
    if (table) table.classList.remove("hidden");

    // Pobieramy nowe dane
    userAction();
}

const userAction = async() => {
    try {
        const response = await fetch('http://localhost:8888/api/weather');

        if (!response.ok) {
            throw new Error(`Błąd serwera: ${response.status}`);
        }

        const myJson = await response.json();

        // Wypełnianie tabeli
        document.getElementById("City").innerText = myJson.city || "Brak danych";
        document.getElementById("Temp_ins").innerText = myJson.temp_ins || "-";
        document.getElementById("Hum_ins").innerText = myJson.hum_ins || "-";
        document.getElementById("Pressure").innerText = myJson.pressure || "-";
        document.getElementById("Temp_out").innerText = myJson.temp_out || "-";
        document.getElementById("Wind").innerText = myJson.wind || "-";
        document.getElementById("Last_update").innerText = myJson.due_date || "-";

    } catch (error) {
        console.error("Fetch error:", error);

        // Ukryj tabelę, pokaż ładny błąd
        document.getElementById("weather-table").classList.add("hidden");
        const errorDiv = document.getElementById("error-message");
        if (errorDiv) {
            errorDiv.classList.remove("hidden");
            document.getElementById("error-text").innerText = "Nie można pobrać danych (Serwer offline?)";
        }
    }
}