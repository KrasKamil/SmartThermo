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
    setInterval(checkNotes, 5000);
    checkNotes();
}

async function checkNotes() {
    try {
        const res = await fetch('/api/notes');
        const data = await res.json();

        // Jeśli nowa notatka
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
    const isUrgent = text.trim().startsWith('!');
    const soundToPlay = isUrgent ? audioAlert : audioNormal;

    soundToPlay.currentTime = 0;
    soundToPlay.play().catch(e => console.warn("Audio zablokowane - kliknij stronę.", e));
}

function addNotificationToQueue(note) {
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
    const icon = overlay.querySelector('i'); // szukamy ikony wewnątrz

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

        overlay.style.background = 'rgba(255, 50, 50, 0.85)';
        overlay.style.border = '2px solid #ff0000';
        overlay.style.boxShadow = '0 0 50px rgba(255, 0, 0, 0.8)';

        if (icon) icon.className = "fas fa-exclamation-triangle";
    } else {
        overlay.style.background = 'rgba(0, 210, 255, 0.15)';
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
        overlay.offsetHeight;
        overlay.style.animation = 'slideIn 0.5s ease-out';
    }
}

// Globalne funkcje przypisujemy do window, aby działały w HTML onclick="..."

window.closeNote = function() {
    notificationQueue.shift();
    updateNotificationUI();
};

window.openHistoryPopup = async function() {
    const overlay = document.getElementById('history-overlay');
    const listEl = document.getElementById('history-list');

    // Z-index 4000 sprawi, że historia przykryje Settings (które ma 3000)
    if (overlay) overlay.style.display = 'flex';

    if (!listEl) return;
    listEl.innerHTML = '<p style="text-align:center; color:#888;">Ładowanie...</p>';

    try {
        const res = await fetch('/api/notes/history');
        const history = await res.json();

        listEl.innerHTML = '';

        if (!history || history.length === 0) {
            listEl.innerHTML = '<p style="text-align:center; color:#888;">Brak historii.</p>';
            return;
        }

        history.forEach(item => {
            const date = new Date(item.timestamp).toLocaleString();
            const isUrgent = item.text.trim().startsWith('!');
            const color = isUrgent ? '#ff4757' : '#e056fd'; // Czerwony dla alertów, Fiolet dla zwykłych

            const div = document.createElement('div');
            div.style.padding = "12px";
            div.style.marginBottom = "8px";
            div.style.background = "rgba(255,255,255,0.08)";
            div.style.borderRadius = "8px";
            div.style.borderLeft = `4px solid ${color}`;

            div.innerHTML = `
                <div style="font-size: 0.75em; color: #aaa; display: flex; justify-content: space-between; margin-bottom: 4px;">
                    <span style="font-weight:bold; color: ${color}">${item.author}</span>
                    <span>${date}</span>
                </div>
                <div style="font-size: 1em; color: #eee; word-wrap: break-word;">
                    ${item.text}
                </div>
            `;
            listEl.appendChild(div);
        });

    } catch (e) {
        console.error(e);
        listEl.innerHTML = '<p style="color:red; text-align:center;">Błąd pobierania historii.</p>';
    }
};

window.closeHistoryPopup = function() {
    const overlay = document.getElementById('history-overlay');
    if (overlay) overlay.style.display = 'none';
};