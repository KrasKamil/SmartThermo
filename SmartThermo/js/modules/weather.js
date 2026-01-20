let tempChart = null;
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

        updateChart();

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

async function updateChart() {
    try {
        const res = await fetch('/api/weather/history');
        const historyData = await res.json();

        const ctx = document.getElementById('tempChart').getContext('2d');

        // Tworzymy gradient dla wypełnienia (z góry na dół)
        const gradient = ctx.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, 'rgba(46, 148, 227, 0.4)'); // Kolor #2E94E3 z Twoich styli
        gradient.addColorStop(1, 'rgba(46, 148, 227, 0.0)');

        if (tempChart) tempChart.destroy();

        tempChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: historyData.map(d => d.time),
                datasets: [{
                    label: 'Temperatura',
                    data: historyData.map(d => d.temp),
                    borderColor: '#00d2ff', // Jasny błękit
                    borderWidth: 3,
                    pointBackgroundColor: '#2E94E3',
                    pointBorderColor: '#fff',
                    pointHoverRadius: 6,
                    pointRadius: 4,
                    tension: 0.4, // Zaokrąglone linie
                    fill: true,
                    backgroundColor: gradient
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: { display: false }, // Ukrywamy legendę dla czystego wyglądu
                    tooltip: {
                        backgroundColor: 'rgba(20, 20, 20, 0.9)',
                        titleColor: '#00d2ff',
                        bodyColor: '#fff',
                        borderColor: '#2E94E3',
                        borderWidth: 1,
                        displayColors: false,
                        padding: 10
                    }
                },
                scales: {
                    y: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)', drawBorder: false },
                        ticks: { color: 'rgba(255, 255, 255, 0.6)', font: { size: 11 } }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: 'rgba(255, 255, 255, 0.6)', font: { size: 11 } }
                    }
                }
            }
        });
    } catch (e) {
        console.error("Błąd podczas rysowania fancy wykresu:", e);
    }
}