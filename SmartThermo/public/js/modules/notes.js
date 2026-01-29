// js/modules/notes.js

let lastNoteTime = 0;
let notificationQueue = [];

// Dźwięki
const audioNormal = new Audio('sounds/notification.wav');
const audioAlert = new Audio('sounds/alarm.mp3');

// Głośności
audioNormal.volume = 0.5;
audioAlert.volume = 1.0;

export function initNotes() {
    // Sprawdzaj nowe notatki co 4 sekundy
    setInterval(checkNotes, 4000);
    checkNotes();
}

async function checkNotes() {
    try {
        const res = await fetch('/api/notes');
        const data = await res.json();

        // Jeśli notatka jest widoczna i ma nowszy czas niż ostatnia
        if (data.visible && data.timestamp > lastNoteTime) {
            lastNoteTime = data.timestamp;

            // Odtwórz dźwięk
            playNotificationSound(data.text);

            // Dodaj do kolejki wyświetlania
            addNotificationToQueue(data);
        }
    } catch (e) {
        console.error("Błąd notatek:", e);
    }
}

function playNotificationSound(text) {
    if (!text) return;
    const isUrgent = text.trim().startsWith('!');
    const soundToPlay = isUrgent ? audioAlert : audioNormal;

    soundToPlay.currentTime = 0;
    soundToPlay.play().catch(e => console.warn("Audio zablokowane - kliknij stronę.", e));
}

function addNotificationToQueue(note) {
    // Jeśli to ta sama notatka co aktualnie wyświetlana, nie dodawaj jej ponownie
    const current = notificationQueue[0];
    if (current && current.text === note.text && current.author === note.author) return;

    notificationQueue.push({
        author: note.author,
        text: note.text
    });
    updateNotificationUI();
}

function updateNotificationUI() {
    const overlay = document.getElementById('notification-overlay');
    const authorEl = document.getElementById('note-author');
    const contentEl = document.getElementById('note-content');
    const counterEl = document.getElementById('msg-counter');
    const icon = overlay.querySelector('i');

    if (notificationQueue.length === 0) {
        overlay.style.display = 'none';
        return;
    }

    const currentMsg = notificationQueue[0];
    let displayText = currentMsg.text;
    const isUrgent = displayText.trim().startsWith('!');

    // STYLIZACJA OKNA POWIADOMIENIA
    if (isUrgent) {
        displayText = displayText.replace(/^!\s*/, '');
        overlay.style.background = 'rgba(255, 50, 50, 0.95)';
        overlay.style.border = '2px solid #ff0000';
        overlay.style.boxShadow = '0 0 50px rgba(255, 0, 0, 0.8)';
        if (icon) icon.className = "fas fa-exclamation-triangle";
    } else {
        overlay.style.background = 'rgba(0, 210, 255, 0.2)'; // Bardziej czytelne tło
        overlay.style.backdropFilter = 'blur(10px)';
        overlay.style.border = '1px solid #00d2ff';
        overlay.style.boxShadow = '0 0 20px rgba(0, 210, 255, 0.3)';
        if (icon) icon.className = "fas fa-comment-alt";
    }

    if (authorEl) authorEl.innerText = `Od: ${currentMsg.author}`;
    if (contentEl) contentEl.innerText = displayText;

    if (counterEl) {
        if (notificationQueue.length > 1) {
            counterEl.style.display = 'inline-block';
            counterEl.innerText = `+${notificationQueue.length - 1}`;
        } else {
            counterEl.style.display = 'none';
        }
    }

    if (overlay.style.display === 'none') {
        overlay.style.display = 'block';
        overlay.style.animation = 'none';
        overlay.offsetHeight; // Trigger reflow
        overlay.style.animation = 'slideIn 0.5s ease-out';
    }
}

// --- GLOBALNE FUNKCJE (Dostępne dla HTML) ---

// 1. Zamykanie notatki (Główne okienko)
window.closeNote = function() {
    // a) Usuń z lokalnej kolejki
    notificationQueue.shift();
    updateNotificationUI();

    // b) WAŻNE: Powiedz serwerowi, żeby przestał to pokazywać!
    fetch('/api/notes/clear', { method: 'POST' })
        .then(() => console.log("Notatka zamknięta na serwerze."))
        .catch(err => console.error("Błąd zamykania notatki na serwerze:", err));
};

// 2. Otwieranie historii (Poprawa logiki)
window.openHistoryPopup = async function() {
    const overlay = document.getElementById('history-overlay');
    const listEl = document.getElementById('history-list');

    if (overlay) {
        // Resetujemy style, żeby na pewno się pokazało
        overlay.classList.remove('hidden');
        overlay.style.display = 'flex';
    }

    if (!listEl) return;
    listEl.innerHTML = '<p style="text-align:center; color:#888; padding: 20px;">Ładowanie...</p>';

    try {
        const res = await fetch('/api/notes/history');
        const history = await res.json();

        listEl.innerHTML = '';

        if (!history || history.length === 0) {
            listEl.innerHTML = '<p style="text-align:center; color:#888; padding: 20px;">Brak historii wiadomości.</p>';
            return;
        }

        history.forEach(item => {
            const date = new Date(item.timestamp).toLocaleString('pl-PL', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            const isUrgent = item.text.trim().startsWith('!');
            const div = document.createElement('div');

            // Używamy nowych klas CSS zdefiniowanych wyżej
            div.className = isUrgent ? 'history-item urgent' : 'history-item';

            div.innerHTML = `
                <div class="history-meta">
                    <span class="history-author">${item.author}</span>
                    <span>${date}</span>
                </div>
                <div class="history-text">
                    ${item.text}
                </div>
            `;
            listEl.appendChild(div);
        });

    } catch (e) {
        console.error(e);
        listEl.innerHTML = '<p style="color:red; text-align:center; padding: 20px;">Błąd pobierania historii.</p>';
    }
};

// 3. Zamykanie historii
window.closeHistoryPopup = function() {
    const overlay = document.getElementById('history-overlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
};