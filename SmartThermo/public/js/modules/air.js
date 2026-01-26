// js/modules/air.js

// 1. Główna funkcja pobierająca i wyświetlająca dane
export async function loadAirQuality(lat, lon) {
    try {
        const res = await fetch(`/api/air?lat=${lat}&lon=${lon}`);
        const data = await res.json();

        // Zabezpieczenie przed pustymi danymi
        if (!data.list || data.list.length === 0) return;

        const aqi = data.list[0].main.aqi;
        const pm25 = data.list[0].components.pm2_5;

        const container = document.getElementById('air-quality-widget');
        if (!container) return;

        const statusMap = {
            1: { text: "Świetne", color: "#27ae60" },
            2: { text: "Dobre", color: "#f1c40f" },
            3: { text: "Średnie", color: "#e67e22" },
            4: { text: "Złe", color: "#e74c3c" },
            5: { text: "Tragiczne", color: "#c0392b" }
        };

        const currentStatus = statusMap[aqi] || statusMap[1];

        container.innerHTML = `
            <div style="text-align: center;">
                <h3 style="margin: 0; color: #ccc; font-size: 0.9em;">Jakość Powietrza</h3>
                <div style="font-size: 1.8em; font-weight: bold; color: ${currentStatus.color}; margin: 5px 0;">
                    ${currentStatus.text}
                </div>
                <div style="font-size: 0.8em; color: #aaa;">
                    PM2.5: <b>${pm25}</b> µg/m³
                </div>
            </div>
        `;
    } catch (e) {
        console.error("Air Quality Error", e);
    }
}

// 2. Funkcja startowa (Inicjalizacja)
export function initAirQuality() {
    console.log("🍃 Inicjalizacja modułu Air Quality...");

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                console.log(`📍 Pobrano lokalizację: ${lat}, ${lon}`);
                loadAirQuality(lat, lon);
            },
            (error) => {
                console.warn("⚠️ Błąd lokalizacji (brak zgody?). Używam domyślnej (Warszawa).");
                loadAirQuality(52.2297, 21.0122);
            }
        );
    } else {
        console.warn("Brak wsparcia geolokalizacji. Używam domyślnej.");
        loadAirQuality(52.2297, 21.0122);
    }
}