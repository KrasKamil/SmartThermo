// src/routes/notes.ts
import { Router } from 'express';
import { Telegraf } from 'telegraf';
import dns from 'dns';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

dotenv.config();

// Wymuszenie IPv4 (częsty problem z Node 17+ i Telegramem)
try { dns.setDefaultResultOrder('ipv4first'); } catch(e) {}

const router = Router();
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'Brak tokena';
const HISTORY_DIR = path.join(process.cwd(), 'jsons');
const HISTORY_FILE = path.join(HISTORY_DIR, 'history.json');

// --- KONFIGURACJA API ---
// Jeśli masz blokadę, możesz tu wpisać adres proxy, np. własny serwer
const TELEGRAM_API_ROOT = process.env.TELEGRAM_API_ROOT || 'https://api.telegram.org';

if (TELEGRAM_TOKEN === 'Brak tokena') {
    console.error('❌ Błąd: Brak tokena Telegrama w zmiennych środowiskowych.');
    process.exit(1);
}

// Konfiguracja bota (Telegraf) z opcjonalnym API Root
const bot = new Telegraf(TELEGRAM_TOKEN, {
    telegram: {
        apiRoot: TELEGRAM_API_ROOT // To naprawia wysyłanie wiadomości jeśli API jest zmienione
    }
});

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
function loadHistory() {
    try {
        if (fs.existsSync(HISTORY_FILE)) {
            const rawData = fs.readFileSync(HISTORY_FILE, 'utf-8');
            if (!rawData.trim()) {
                history = [];
                return;
            }
            history = JSON.parse(rawData);
            console.log(`📂 Wczytano ${history.length} wiadomości z historii.`);
        } else {
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

function saveHistory() {
    try {
        if (!fs.existsSync(HISTORY_DIR)) {
            fs.mkdirSync(HISTORY_DIR, { recursive: true });
        }
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8');
    } catch (error) {
        console.error("❌ Błąd zapisu historii:", error);
    }
}

loadHistory();

// --- API ---
router.get('/', (req, res) => res.json(activeNote));

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
        // Używamy zdefiniowanego API ROOT (domyślnie oficjalny, ale można zmienić w .env)
        const url = `${TELEGRAM_API_ROOT}/bot${TELEGRAM_TOKEN}/getUpdates?offset=${offset}&timeout=10`;
        
        const response = await axios.get(url);
        const data = response.data as { ok: boolean, result: any[] };

        if (data.ok && data.result.length > 0) {
            for (const update of data.result) {
                offset = update.update_id + 1;

                if (update.message && update.message.text) {
                    const text = update.message.text;
                    const author = update.message.from.first_name;
                    const chatId = update.message.chat.id;

                    console.log(`📩 Nowa wiadomość od ${author} (${chatId}): ${text}`);

                    if (ALLOWED_USERS.length > 0 && !ALLOWED_USERS.includes(chatId)) {
                        console.log(`⛔ Blokada dostępu dla: ${chatId}`);
                        bot.telegram.sendMessage(chatId, "⛔ Brak dostępu.").catch((err) => console.error("Błąd wysyłania (Auth):", err));
                        continue;
                    }

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

                    bot.telegram.sendMessage(chatId, "✅ Zapisano!")
                        .catch((err) => console.error("❌ Błąd wysyłania potwierdzenia:", err));
                }
            }
        }
    } catch (e: any) { 
        // Obsługa błędów Axios/Sieci
        const errorMsg = e.message || e;
        
        // Ignoruj timeouty (to normalne przy long-polling), ale loguj inne
        if (e.code === 'ETIMEDOUT' || e.code === 'ECONNRESET') {
             // cicho sza, to normalne przy przerwaniu połączenia
        } else if (e.response && e.response.status === 401) {
             console.error("🔥 BŁĄD 401: Zły TOKEN Telegrama! Sprawdź plik .env");
        } else {
             console.error("🔥 Błąd połączenia z Telegramem (Loop):", errorMsg);
        }
    }
    
    // Krótkie opóźnienie przed kolejnym zapytaniem
    setTimeout(runLoop, 100);
}

console.log("🚀 Bot wystartował. Próbuję nawiązać połączenie...");
runLoop();

export default router;