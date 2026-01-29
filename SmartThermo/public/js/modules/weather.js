import { state } from './state.js';

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

// --- GŁÓWNA FUNKCJA KONTROLI WYKRESU I MUZYKI ---
export function initChartToggle() {
    const btn = document.getElementById('toggle-inline-chart');
    const row = document.getElementById('inline-chart-row');
    const musicTrigger = document.getElementById('temp-music-trigger');
    const radioPlayer = document.getElementById('radio-audio');

    let wasRadioPlaying = false;

    if (musicTrigger) {
        const playSkolim = (fileSrc, isFull) => {
            // 1. STOP (Jeśli już gra)
            if (skolimAudio) {
                try {
                    skolimAudio.pause();
                } catch (e) { /* ignoruj błędy przy pauzowaniu */ }

                skolimAudio.currentTime = 0;
                skolimAudio = null;

                musicTrigger.style.color = "#ff007f";
                musicTrigger.innerText = "Temperatura 🔥";

                // Zdejmij blokadę systemową
                state.isLocalSoundPlaying = false;

                // Wznów radio jeśli grało
                if (wasRadioPlaying && radioPlayer) {
                    radioPlayer.play().catch(e => console.error("Błąd radia:", e));
                    wasRadioPlaying = false;
                }
                return;
            }

            // 2. PLAY
            state.isLocalSoundPlaying = true; // Blokada System Playera

            if (radioPlayer && !radioPlayer.paused) {
                wasRadioPlaying = true;
                radioPlayer.pause();
            } else {
                wasRadioPlaying = false;
            }

            skolimAudio = new Audio(fileSrc);
            skolimAudio.volume = 1.0;

            const playPromise = skolimAudio.play();
            if (playPromise !== undefined) {
                playPromise.catch(e => {
                    if (e.name !== 'AbortError') {
                        console.error("Błąd odtwarzania Skolima:", e);
                    }
                });
            }

            musicTrigger.style.color = "#00d2ff";
            musicTrigger.innerText = isFull ? "Temperatura 🔥 (Cały...)" : "Temperatura 🔥 (Gra...)";

            skolimAudio.onended = () => {
                skolimAudio = null;
                musicTrigger.style.color = "#ff007f";
                musicTrigger.innerText = "Temperatura 🔥";

                state.isLocalSoundPlaying = false;

                if (wasRadioPlaying && radioPlayer) {
                    radioPlayer.play().catch(e => {});
                    wasRadioPlaying = false;
                }
            };
        };

        musicTrigger.onclick = () => {
            if (clickTimer) clearTimeout(clickTimer);
            clickTimer = setTimeout(() => {
                playSkolim('media/temperatura.mp3', false);
            }, 250);
        };

        musicTrigger.ondblclick = () => {
            if (clickTimer) clearTimeout(clickTimer);
            playSkolim('media/temperatura_full.mp3', true);
        };
    }

    if (btn && row) {
        btn.onclick = () => {
            const isHidden = row.style.display === 'none';
            row.style.display = isHidden ? 'table-row' : 'none';
            btn.classList.toggle('active', isHidden);
            if (isHidden) updateChart();
        };
    }
}

// --- ZMODYFIKOWANA FUNKCJA RYSUJĄCA WYKRES ---
async function updateChart() {
    const row = document.getElementById('inline-chart-row');
    // Sprawdzamy czy wiersz jest widoczny - jeśli nie, nie rysujemy (oszczędność zasobów)
    if (!row || row.style.display === 'none') return;

    try {
        const res = await fetch('/api/weather/history');
        const historyData = await res.json();
        if (!historyData || historyData.length === 0) return;

        const canvas = document.getElementById('tempChart');
        const ctx = canvas.getContext('2d');
        const isLight = document.body.classList.contains('light-mode');

        // --- STYLE DLA RAMKI I TŁA ---
        if (isLight) {
            canvas.style.backgroundColor = "rgba(255, 255, 255, 0.5)"; // Jaśniejsze tło w light mode
            canvas.style.border = "1px solid #ddd";
            canvas.style.boxShadow = "inset 0 0 20px rgba(0,0,0,0.05)";
        } else {
            canvas.style.backgroundColor = "rgba(0, 0, 0, 0.2)";
            canvas.style.border = "1px solid rgba(255, 255, 255, 0.1)";
            canvas.style.boxShadow = "none";
        }
        canvas.style.borderRadius = "12px";

        // Kolory
        const axisColor = isLight ? '#555' : 'rgba(255, 255, 255, 0.6)';
        const gridColor = isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)';
        const lineColor = '#00d2ff';
        const pointColor = isLight ? '#007acc' : '#2E94E3';

        const gradient = ctx.createLinearGradient(0, 0, 0, 300); // Gradient dopasowany do wysokości
        gradient.addColorStop(0, isLight ? 'rgba(0, 210, 255, 0.4)' : 'rgba(46, 148, 227, 0.4)');
        gradient.addColorStop(1, isLight ? 'rgba(0, 210, 255, 0.0)' : 'rgba(46, 148, 227, 0.0)');

        if (tempChart) tempChart.destroy();

        tempChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: historyData.map(d => d.time),
                datasets: [{
                    label: 'Temperatura',
                    data: historyData.map(d => d.temp),
                    borderColor: lineColor,
                    borderWidth: 3,
                    pointBackgroundColor: pointColor,
                    pointBorderColor: isLight ? '#fff' : '#222',
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    tension: 0.4,
                    fill: true,
                    backgroundColor: gradient
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false, // Ważne: wypełnia kontener z HTML
                resizeDelay: 200, // Zapobiega migotaniu przy skalowaniu okna

                layout: {
                    padding: {
                        // Tytuł jest teraz w HTML nad wykresem, więc top może być mały
                        top: 10,
                        right: 15,
                        bottom: 10,
                        left: 5
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: isLight ? 'rgba(255,255,255,0.95)' : 'rgba(20,20,20,0.9)',
                        titleColor: isLight ? '#000' : '#fff',
                        bodyColor: isLight ? '#333' : '#ddd',
                        borderColor: isLight ? '#ccc' : '#444',
                        borderWidth: 1,
                        displayColors: false,
                        padding: 10
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        title: { display: false }, // Ukryłem tytuł osi Y dla czystszego wyglądu (opcjonalne)
                        grid: { color: gridColor },
                        ticks: { color: axisColor, font: { size: 10 }, padding: 5 }
                    },
                    x: {
                        title: { display: false },
                        grid: { display: false },
                        ticks: {
                            color: axisColor,
                            font: { size: 10 },
                            maxRotation: 0, // Zapobiega obracaniu tekstu godziny
                            autoSkip: true, // Pomija godziny jeśli jest ciasno
                            maxTicksLimit: 6
                        }
                    }
                }
            }
        });
    } catch (e) { console.error("Błąd wykresu:", e); }
}

window.updateChart = updateChart;