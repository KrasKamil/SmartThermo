let volumeDebounceTimer; // Zmienna poza funkcją, pamięta licznik czasu

export function toggleTheme() {
    document.body.classList.toggle("light-mode");

    // NAPRAWA: Po zmianie klasy, wymuś przerysowanie wykresu z nowymi kolorami
    if (window.updateChart) {
        window.updateChart();
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
    const iconStatus = document.getElementById('vol-icon-status'); // Pobieramy lewą ikonkę

    // Aktualizacja tekstu procentowego
    if (label) label.innerText = `${val}%`;

    // LOGIKA IKONY: Jeśli 0 -> 🔇, w przeciwnym razie -> 🔈
    if (iconStatus) {
        if (val == 0) {
            iconStatus.innerText = "🔇";
            iconStatus.style.color = "#ff4444"; // Opcjonalnie: na czerwono gdy wyciszone
        } else {
            iconStatus.innerText = "🔈";
            iconStatus.style.color = ""; // Reset koloru
        }
    }

    // Aktualizacja gradientu (Twoja oryginalna logika)
    if (slider) {
        const percentage = (val - slider.min) / (slider.max - slider.min) * 100;
        slider.style.background = `linear-gradient(to right, #00d2ff 0%, #00d2ff ${percentage}%, rgba(255,255,255,0.1) ${percentage}%, rgba(255,255,255,0.1) 100%)`;
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