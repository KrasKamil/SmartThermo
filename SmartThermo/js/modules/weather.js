export async function fetchWeather() {
    try {
        const response = await fetch('/api/weather');
        if (!response.ok) throw new Error(`Status: ${response.status}`);
        const data = await response.json();

        setText("City", data.city || "Brak danych");
        setText("Temp_ins", data.temp_ins || "-");
        setText("Hum_ins", data.hum_ins || "-");
        setText("Pressure", data.pressure || "-");
        setText("Temp_out", data.temp_out || "-");
        setText("Wind", data.wind || "-");
        setText("Last_update", data.due_date || "-");

        document.getElementById("weather-table").classList.remove("hidden");
        document.getElementById("error-message").classList.add("hidden");
    } catch (error) {
        console.error("Weather error:", error);
        document.getElementById("weather-table").classList.add("hidden");
        document.getElementById("error-message").classList.remove("hidden");
        document.getElementById("error-text").innerText = "Offline";
    }
}

export function clearWeatherData() {
    ["City", "Temp_ins", "Hum_ins", "Pressure", "Temp_out", "Wind", "Last_update"].forEach(id => setText(id, ""));
    fetchWeather();
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
}