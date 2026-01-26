// src/routes/notes.ts
import { Router } from 'express';
import { Telegraf } from 'telegraf';
import dns from 'dns';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

try { dns.setDefaultResultOrder('ipv4first'); } catch(e) {}

const router = Router();
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN|| 'Brak tokena';
const HISTORY_DIR = path.join(process.cwd(), 'jsons');
const HISTORY_FILE = path.join(HISTORY_DIR, 'history.json');

if (TELEGRAM_TOKEN === 'Brak tokena') {
    console.error('❌ Błąd: Brak tokena Telegrama w zmiennych środowiskowych.');
    process.exit(1);
}
const bot = new Telegraf(TELEGRAM_TOKEN);

// 👇 WPISZ SWOJE ID 👇
const ALLOWED_USERS: number[] = [
    8290453013 
];

// --- STRUKTURY DANYCH ---
interface Note {
    text: string;
    author: string;
    timestamp: number;
    visible: boolean;
}

let activeNote: Note = {
    text: "",
    author: "",
    timestamp: 0,
    visible: false
};

let history: Note[] = [];

// --- FUNKCJE PLIKOWE (Persistence) ---

// 1. Wczytywanie historii przy starcie
function loadHistory() {
    try {
        if (fs.existsSync(HISTORY_FILE)) {
            const rawData = fs.readFileSync(HISTORY_FILE, 'utf-8');
            // Zabezpieczenie przed pustym plikiem
            if (!rawData.trim()) {
                history = [];
                return;
            }
            history = JSON.parse(rawData);
            console.log(`📂 Wczytano ${history.length} wiadomości z historii.`);
        } else {
            // Jeśli plik nie istnieje, upewnij się, że folder istnieje (na przyszłość)
            if (!fs.existsSync(HISTORY_DIR)) {
                fs.mkdirSync(HISTORY_DIR, { recursive: true });
            }
            history = [];
        }
    } catch (error) {
        console.error("⚠️ Błąd wczytywania historii (tworzę nową):", error);
        history = [];
    }
}

// 2. Zapisywanie historii na dysk
function saveHistory() {
    try {
        // NAPRAWA: Najpierw upewnij się, że folder 'jsons' istnieje!
        if (!fs.existsSync(HISTORY_DIR)) {
            fs.mkdirSync(HISTORY_DIR, { recursive: true });
        }

        // Zapisz ładnie sformatowany JSON
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8');
    } catch (error) {
        console.error("❌ Błąd zapisu historii:", error);
    }
}

// Uruchom wczytywanie przy starcie skryptu
loadHistory();


// --- API ---
router.get('/', (req, res) => res.json(activeNote));

// Endpoint historii (czyta z pamięci RAM, która jest zsynchronizowana z plikiem)
router.get('/history', (req, res) => {
    res.json(history);
});

router.post('/clear', (req, res) => {
    activeNote.visible = false;
    res.json({ success: true });
});


// --- LOGIKA BOTA ---
let offset = 0;

async function runLoop() {
    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/getUpdates?offset=${offset}&timeout=10`;
        const response = await fetch(url);
        const data = await response.json() as { ok: boolean, result: any[] };

        if (data.ok && data.result.length > 0) {
            for (const update of data.result) {
                offset = update.update_id + 1;

                if (update.message && update.message.text) {
                    const text = update.message.text;
                    const author = update.message.from.first_name;
                    const chatId = update.message.chat.id;

                    // Blokada dostępu
                    if (ALLOWED_USERS.length > 0 && !ALLOWED_USERS.includes(chatId)) {
                        bot.telegram.sendMessage(chatId, "⛔ Brak dostępu.").catch(() => {});
                        continue;
                    }

                    const noteObj: Note = {
                        text: text,
                        author: author,
                        timestamp: Date.now(),
                        visible: true
                    };

                    // 1. Ustaw jako aktywną
                    activeNote = noteObj;

                    // 2. Dodaj do historii (na początek listy)
                    history.unshift(noteObj);
                    
                    // Limit 100 ostatnich wiadomości
                    if (history.length > 100) history.pop();

                    // 3. ZAPISZ DO PLIKU
                    saveHistory();

                    bot.telegram.sendMessage(chatId, "✅ Zapisano!")
                       .catch(() => {});
                }
            }
        }
    } catch (e) { }
    
    setTimeout(runLoop, 100);
}

runLoop();

export default router;