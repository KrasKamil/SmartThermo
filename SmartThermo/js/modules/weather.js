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
        setText("last-update-text", data.due_date || "-");

        document.getElementById("weather-container").classList.remove("hidden");
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
    ["City", "Temp_ins", "Hum_ins", "Pressure", "Temp_out", "Wind"].forEach(id => setText(id, ""));
    fetchWeather().then(() => {
        // Jeśli wiersz z wykresem jest otwarty, odświeżamy go
        const row = document.getElementById('inline-chart-row');
        if (row && row.style.display !== 'none') {
            updateChart();
        }
    });
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerText = text;
}

export function initChartToggle() {
    const btn = document.getElementById('toggle-inline-chart');
    const row = document.getElementById('inline-chart-row');

    if (btn && row) {
        btn.onclick = () => {
            const isHidden = row.style.display === 'none';
            row.style.display = isHidden ? 'table-row' : 'none';
            btn.classList.toggle('active', isHidden);

            if (isHidden) {
                updateChart();
            }
        };
    }
}

async function updateChart() {
    try {
        const res = await fetch('/api/weather/history');
        const historyData = await res.json();

        if (!historyData || historyData.length === 0) return;

        const ctx = document.getElementById('tempChart').getContext('2d');

        // Przywrócenie gradientu
        const gradient = ctx.createLinearGradient(0, 0, 0, 200);
        gradient.addColorStop(0, 'rgba(46, 148, 227, 0.4)');
        gradient.addColorStop(1, 'rgba(46, 148, 227, 0.0)');

        const isLight = document.body.classList.contains('light-mode');
        const axisColor = isLight ? '#222' : 'rgba(255, 255, 255, 0.6)';
        const gridColor = isLight ? '#bbb' : 'rgba(255, 255, 255, 0.05)';

        if (tempChart) tempChart.destroy();

        tempChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: historyData.map(d => d.time),
                datasets: [{
                    label: 'Temperatura',
                    data: historyData.map(d => d.temp),
                    borderColor: '#00d2ff',
                    borderWidth: 3,
                    pointBackgroundColor: '#2E94E3',
                    pointBorderColor: '#fff',
                    tension: 0.4,
                    fill: true,
                    backgroundColor: gradient
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        title: {
                            display: true,
                            text: 'Temp [°C]',
                            color: axisColor,
                            font: { size: 10, weight: 'bold' }
                        },
                        grid: { color: gridColor },
                        ticks: { color: axisColor, font: { size: 9 } }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Godzina',
                            color: axisColor,
                            font: { size: 10, weight: 'bold' }
                        },
                        grid: { display: false },
                        ticks: { color: axisColor, font: { size: 9 } }
                    }
                }
            }
        });
    } catch (e) {
        console.error("Błąd wykresu:", e);
    }
}