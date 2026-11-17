// src/routes/notes.ts
import { Router } from 'express';
import fs from 'fs';
import path from 'path';

const router = Router();

// Ścieżki
const HISTORY_DIR = path.join(process.cwd(), 'jsons');
const HISTORY_FILE = path.join(HISTORY_DIR, 'history.json');

// Struktura danych
interface Note { text: string; author: string; timestamp: number; visible: boolean; }
let activeNote: Note = { text: "", author: "", timestamp: 0, visible: false };
let history: Note[] = [];

// Ładowanie historii
function loadHistory() {
    try {
        if (fs.existsSync(HISTORY_FILE)) {
            const raw = fs.readFileSync(HISTORY_FILE, 'utf-8');
            history = raw.trim() ? JSON.parse(raw) : [];
        } else {
            if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });
            history = [];
        }
    } catch (e) { history = []; }
}

function saveHistory() {
    try { fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8'); } catch (e) {}
}

// Inicjalizacja
loadHistory();

// --- ENDPOINTY API ---

// 1. Pobierz aktywną notatkę (dla popupu)
router.get('/', (req, res) => {
    res.json(activeNote);
});

// 2. Pobierz historię
router.get('/history', (req, res) => {
    res.json(history);
});

// 3. Wyczyść aktywną notatkę (zamknij popup)
router.post('/clear', (req, res) => {
    activeNote.visible = false;
    res.json({ success: true });
});

// 4. Dodaj notatkę (opcjonalnie, jeśli chcesz dodawać z poziomu innego serwisu/telegrama)
// Tę funkcję eksportujemy, aby TelegramService mógł jej użyć!
export const addNote = (text: string, author: string) => {
    const noteObj: Note = {
        text: text,
        author: author,
        timestamp: Date.now(),
        visible: true
    };
    activeNote = noteObj;
    history.unshift(noteObj);
    if (history.length > 100) history.pop();
    saveHistory();
    return noteObj;
};

export default router;