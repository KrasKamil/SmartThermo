export function toggleTheme() {
    document.body.classList.toggle("light-mode");
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
        el.style.display = 'flex';
    }
}

export function closePopup(id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.add('hidden');
        el.style.display = 'none';
    }
}