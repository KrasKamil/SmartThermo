let tempChart = null;
let skolimAudio = null;
let clickTimer = null;

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
    const musicTrigger = document.getElementById('temp-music-trigger');
    const radioPlayer = document.getElementById('radio-audio');

    let wasRadioPlaying = false;

    // --- LOGIKA MP3 (Single vs Double Click) ---
    if (musicTrigger) {

        // Funkcja pomocnicza do odtwarzania
        const playSkolim = (fileSrc, isFull) => {
            // 1. Jeśli coś już gra (Skolim), zatrzymaj to, zresetuj I WZÓW RADIO
            if (skolimAudio) {
                skolimAudio.pause();
                skolimAudio.currentTime = 0;
                skolimAudio = null;
                musicTrigger.style.color = "#ff007f"; // Reset koloru
                musicTrigger.innerText = "Temperatura ";

                // Wznawiamy radio przy ręcznym stopie, jeśli grało wcześniej
                if (wasRadioPlaying && radioPlayer) {
                    radioPlayer.play().catch(e => console.error("Błąd wznawiania radia:", e));
                    wasRadioPlaying = false; // Resetujemy flagę
                }
                return;
            }

            // 2. Zatrzymaj radio internetowe (jeśli gra) i ZAPAMIĘTAJ to
            if (radioPlayer && !radioPlayer.paused) {
                wasRadioPlaying = true; // Zapamiętujemy, że grało
                radioPlayer.pause();
            } else {
                wasRadioPlaying = false; // Dla pewności resetujemy
            }

            // 3. Utwórz nowy player i graj
            skolimAudio = new Audio(fileSrc);
            skolimAudio.volume = 1.0;

            skolimAudio.play().catch(e => console.error("Błąd audio:", e));

            // Zmiana wyglądu
            musicTrigger.style.color = "#00d2ff";
            musicTrigger.innerText = isFull ? "Temperatura 🔥" : "Temperatura 🔥";

            // Reset po zakończeniu i WZNOWIENIE RADIA
            skolimAudio.onended = () => {
                skolimAudio = null;
                musicTrigger.style.color = "#ff007f";
                musicTrigger.innerText = "Temperatura ";

                // Wznawiamy radio po zakończeniu utworu
                if (wasRadioPlaying && radioPlayer) {
                    radioPlayer.play().catch(e => console.error("Błąd wznawiania radia:", e));
                    wasRadioPlaying = false;
                }
            };
        };

        // --- OBSŁUGA POJEDYNCZEGO KLIKNIĘCIA ---
        musicTrigger.onclick = () => {
            if (clickTimer) clearTimeout(clickTimer);
            clickTimer = setTimeout(() => {
                playSkolim('media/temperatura.mp3', false); // GRA KRÓTKI
            }, 250);
        };

        // --- OBSŁUGA PODWÓJNEGO KLIKNIĘCIA ---
        musicTrigger.ondblclick = () => {
            if (clickTimer) clearTimeout(clickTimer);
            playSkolim('media/temperatura_full.mp3', true); // GRA PEŁNY
        };
    }

    // --- LOGIKA WYKRESU (BTN) ---
    // To musi być poza if(musicTrigger), ale wewnątrz initChartToggle
    if (btn && row) {
        btn.onclick = () => {
            const isHidden = row.style.display === 'none';
            row.style.display = isHidden ? 'table-row' : 'none';
            btn.classList.toggle('active', isHidden); // 'active' gdy pokazujemy (isHidden=true przed zmianą)

            if (isHidden) {
                updateChart();
            }
        };
    }
}

// --- Funkcja rysująca wykres ---
async function updateChart() {
    const row = document.getElementById('inline-chart-row');
    if (!row || row.style.display === 'none') return;

    try {
        const res = await fetch('/api/weather/history');
        const historyData = await res.json();
        if (!historyData || historyData.length === 0) return;

        const ctx = document.getElementById('tempChart').getContext('2d');

        const isLight = document.body.classList.contains('light-mode');
        const axisColor = isLight ? '#222' : 'rgba(255, 255, 255, 0.6)';
        const gridColor = isLight ? '#bbb' : 'rgba(255, 255, 255, 0.05)';

        const gradient = ctx.createLinearGradient(0, 0, 0, 200);
        gradient.addColorStop(0, 'rgba(46, 148, 227, 0.4)');
        gradient.addColorStop(1, 'rgba(46, 148, 227, 0.0)');

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
                plugins: { legend: { display: false } },
                scales: {
                    y: {
                        title: { display: true, text: 'Temp [°C]', color: axisColor, font: { size: 10, weight: 'bold' } },
                        grid: { color: gridColor },
                        ticks: { color: axisColor, font: { size: 9 } }
                    },
                    x: {
                        title: { display: true, text: 'Godzina', color: axisColor, font: { size: 10, weight: 'bold' } },
                        grid: { display: false },
                        ticks: { color: axisColor, font: { size: 9 } }
                    }
                }
            }
        });
    } catch (e) { console.error("Błąd wykresu:", e); }
}

window.updateChart = updateChart;