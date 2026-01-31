let volumeDebounceTimer; // Zmienna poza funkcją, pamięta licznik czasu

export function toggleTheme() {
    document.body.classList.toggle("light-mode");

    // NAPRAWA: Po zmianie klasy, wymuś przerysowanie wykresu z nowymi kolorami
    if (window.updateChart) {
        window.updateChart();
    }
    const slider = document.getElementById('volume-slider');
    if (slider) {
        updateVolumeVisuals(slider.value);
    }
}

export function controlVolume(action) {
    fetch('/api/media/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
    });
}

// Obsługa popupów - eksportujemy helpery
export function openPopup(id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.remove('hidden');
        el.style.removeProperty('display');
        // Specjalnie dla overlayów, domyślnie flex, ale jeśli nie, ustaw flex
        if (getComputedStyle(el).display === 'none') {
            el.style.display = 'flex';
        }
        // Tylko overlay settings wymaga syncSystemVolume
        if (id === 'settings-overlay') {
            syncSystemVolume();
        }
    }
}

export function closePopup(id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.add('hidden');
        el.style.display = 'none';
    }
}
export function updateVolumeVisuals(val) {
    const slider = document.getElementById('volume-slider');
    const label = document.getElementById('vol-percent');
    const iconStatus = document.getElementById('vol-icon-status');

    // 1. Aktualizacja tekstu procentowego
    if (label) label.innerText = `${val}%`;

    // 2. Sprawdzamy czy mamy Jasny Motyw
    const isLight = document.body.classList.contains('light-mode');

    // 3. LOGIKA IKONY
    if (iconStatus) {
        if (val == 0) {
            iconStatus.innerText = "🔇";
            iconStatus.style.color = "#ff4444";
        } else {
            iconStatus.innerText = "🔈";
            // W jasnym trybie ikona fioletowa, w ciemnym domyślna
            iconStatus.style.color = isLight ? '#a64ac9' : '';
        }
    }

    // 4. AKTUALIZACJA GRADIENTU (Kluczowa zmiana)
    if (slider) {
        const percentage = (val - slider.min) / (slider.max - slider.min) * 100;

        // Ustawiamy kolory zależnie od trybu
        // Light: Różowy pasek + Szare tło
        // Dark:  Niebieski pasek + Przezroczyste tło
        const colorFill = isLight ? '#d63384' : '#00d2ff';
        const colorTrack = isLight ? '#e9ecef' : 'rgba(255,255,255,0.1)';

        slider.style.background = `linear-gradient(to right, ${colorFill} 0%, ${colorFill} ${percentage}%, ${colorTrack} ${percentage}%, ${colorTrack} 100%)`;
        slider.style.backgroundSize = "100% 8px";
        slider.style.backgroundRepeat = "no-repeat";
        slider.style.backgroundPosition = "center";
    }
}


// funkcja pomocnicza do pobierania głośności z serwera
async function syncSystemVolume() {
    try {
        const res = await fetch('/api/media/volume');
        const data = await res.json();

        const slider = document.getElementById('volume-slider');
        if (slider && data.volume !== undefined) {
            slider.value = data.volume; // Ustaw suwak na wartość z Windowsa
            updateVolumeVisuals(data.volume); // Odśwież wygląd (kolory, ikonki)
        }
    } catch (err) {
        console.error("Nie udało się pobrać głośności:", err);
    }
}

export function setVolume(val) {
    // Wysyłamy do backendu
    fetch('/api/media/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'set_volume',
            value: parseInt(val)
        })
    }).catch(err => console.error("Błąd zmiany głośności:", err));
}

export function handleVolumeInput(val) {
    // 1. NATYCHMIAST: Aktualizuj wygląd (tekst, pasek, ikonkę)
    updateVolumeVisuals(val);

    // 2. Z OPÓŹNIENIEM: Wyślij do serwera (Debounce)
    // Jeśli użytkownik wciąż przesuwa, anuluj poprzednie wysłanie
    clearTimeout(volumeDebounceTimer);

    // Ustaw nowe wysłanie za 100ms (to wystarczy, by było płynnie, ale nie zabiło serwera)
    volumeDebounceTimer = setTimeout(() => {
        setVolume(val);
    }, 100);
}

export function setupEventListeners() {
    console.log("🔧 Uruchamianie Event Listenerów UI...");

    // 1. Przycisk Historii Telegrama (w Ustawieniach)
    const historyBtn = document.getElementById('btn-show-history');
    if (historyBtn) {
        historyBtn.addEventListener('click', (e) => {
            e.preventDefault();
            // Wywołujemy funkcję z notes.js (która jest przypisana do window)
            if (typeof window.openHistoryPopup === 'function') {
                window.openHistoryPopup();
            } else {
                console.error("❌ Błąd: Funkcja window.openHistoryPopup nie jest dostępna.");
            }
        });
    }

    // 2. Obsługa suwaka głośności
    const volumeSlider = document.getElementById('volume-slider');
    if (volumeSlider) {
        volumeSlider.addEventListener('input', (e) => {
            handleVolumeInput(e.target.value);
        });
    }

    // 3. Przycisk otwierania ustawień (jeśli masz taki w HTML, np. ikonka trybika)
    const settingsBtn = document.getElementById('btn-settings'); // Sprawdź czy masz takie ID w HTML
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => openPopup('settings-overlay'));
    }

    // 4. Obsługa zamykania wszystkich popupów (krzyżyki i kliknięcie w tło)
    document.querySelectorAll('.btn-close, .popup-overlay').forEach(el => {
        el.addEventListener('click', (e) => {
            // Jeśli kliknięto w tło (overlay) LUB w przycisk z klasą .btn-close
            if (e.target === el || e.target.classList.contains('btn-close')) {
                const overlay = el.closest('.popup-overlay');
                if (overlay) {
                    overlay.style.display = 'none';
                    overlay.classList.add('hidden');
                }
            }
        });
    });
}