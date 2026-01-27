// src/routes/notes.ts
import { Router } from 'express';
import { Telegraf } from 'telegraf';
import dns from 'dns';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { exec } from 'child_process';
import * as loudness from 'loudness';
import os from 'os';
import { setServerRadio, playRadioById, RADIO_STATIONS } from '../helpers/system';

dotenv.config();

// Wymuszenie IPv4
try { dns.setDefaultResultOrder('ipv4first'); } catch(e) {}

const router = Router();
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'Brak tokena';

// Ścieżki do historii
const HISTORY_DIR = path.join(process.cwd(), 'jsons');
const HISTORY_FILE = path.join(HISTORY_DIR, 'history.json');

// Ścieżki do skryptów Media (zgodne z Twoim media.ts)
const SCRIPTS_DIR = path.join(process.cwd(), 'scripts');
const VENV_PYTHON_PATH = path.join(process.cwd(), 'env-media', 'Scripts', 'python.exe');
const CONTROL_MEDIA_SCRIPT = path.join(SCRIPTS_DIR, 'control_media.py');
const PYTHON_SCRIPT_PATH = path.join(SCRIPTS_DIR, 'get_media.py');

// API Root
const TELEGRAM_API_ROOT = process.env.TELEGRAM_API_ROOT || 'https://api.telegram.org';

if (TELEGRAM_TOKEN === 'Brak tokena') {
    console.error('❌ Błąd: Brak tokena Telegrama w zmiennych środowiskowych.');
    // Nie zabijamy procesu exit(1), żeby reszta serwera wstała, ale bot nie zadziała
}

// Inicjalizacja Telegraf (do wysyłania wiadomości)
const bot = new Telegraf(TELEGRAM_TOKEN, {
    telegram: { apiRoot: TELEGRAM_API_ROOT }
});

// 👇 WPISZ SWOJE ID
const ALLOWED_USERS: number[] = [
    8290453013,
    8504057899 
];

// --- STAN TERMOSTATU (MOCK) ---
// Docelowo podepnij tu import zmiennych globalnych, jeśli masz je w innym pliku
let thermoState = {
    temp: 21.5,
    humidity: 45,
    target: 22.0,
    mode: 'eco', // heat, eco, off
    heating: false
};

// --- FUNKCJE POMOCNICZE MULTIMEDIA ---
const runMediaControl = (action: string) => {
    if (!fs.existsSync(VENV_PYTHON_PATH) || !fs.existsSync(CONTROL_MEDIA_SCRIPT)) return;
    exec(`"${VENV_PYTHON_PATH}" "${CONTROL_MEDIA_SCRIPT}" ${action}`, { cwd: SCRIPTS_DIR }, () => {});
};

const getNowPlaying = (): Promise<string> => {
    return new Promise((resolve) => {
        if (!fs.existsSync(VENV_PYTHON_PATH)) return resolve("Błąd środowiska Python");
        exec(`"${VENV_PYTHON_PATH}" "${PYTHON_SCRIPT_PATH}"`, { cwd: SCRIPTS_DIR }, (err, stdout) => {
            if (err) return resolve("Nieznany");
            try {
                const data = JSON.parse(stdout.trim());
                if (data && data.status === 'Playing') {
                    return resolve(`🎵 ${data.artist} - ${data.title}`);
                }
                return resolve("Cisza (Pauza/Stop)");
            } catch { resolve("Błąd odczytu"); }
        });
    });
};

// --- LOGIKA NOTATEK (Twoja stara) ---
interface Note {
    text: string; author: string; timestamp: number; visible: boolean;
}
let activeNote: Note = { text: "", author: "", timestamp: 0, visible: false };
let history: Note[] = [];

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
loadHistory();

// --- API EXPRESS (dla frontendu) ---
router.get('/', (req, res) => res.json(activeNote));
router.get('/history', (req, res) => res.json(history));
router.post('/clear', (req, res) => {
    activeNote.visible = false;
    res.json({ success: true });
});

// --- OBSŁUGA KOMEND (NOWOŚĆ) ---
async function handleCommand(commandLine: string, chatId: number) {
    const [cmd, ...args] = commandLine.split(' ');
    const arg = args.join(' '); // np. dla "/set 22.5" -> "22.5"

    switch (cmd.toLowerCase()) {
        // === 1. TERMOSTAT ===
        case '/status':
            const icon = thermoState.heating ? '🔥' : '❄️';
            const msg = `🌡️ *Termostat*\nObecna: ${thermoState.temp}°C\nCel: ${thermoState.target}°C\nWilgoć: ${thermoState.humidity}%\nTryb: ${thermoState.mode}\nStan: ${icon}`;
            await bot.telegram.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
            break;

        case '/set':
            const newTemp = parseFloat(arg);
            if (!isNaN(newTemp)) {
                thermoState.target = newTemp;
                await bot.telegram.sendMessage(chatId, `✅ Ustawiono cel: ${newTemp}°C`);
            } else {
                await bot.telegram.sendMessage(chatId, "❌ Użycie: /set 22.5");
            }
            break;

        case '/mode':
            if (['heat', 'eco', 'off'].includes(arg.toLowerCase())) {
                thermoState.mode = arg.toLowerCase();
                await bot.telegram.sendMessage(chatId, `⚙️ Tryb: ${arg.toUpperCase()}`);
            } else {
                await bot.telegram.sendMessage(chatId, "Dostępne: heat, eco, off");
            }
            break;

        case '/boost':
            thermoState.heating = true;
            await bot.telegram.sendMessage(chatId, "🚀 BOOST włączony na 30 min!");
            setTimeout(() => { thermoState.heating = false; }, 30 * 60 * 1000);
            break;

        // === 2. MEDIA ===

       case '/radio':
            if (!arg) {
                const available = RADIO_STATIONS.map(s => s.id).join(', ');
                await bot.telegram.sendMessage(chatId, `ℹ️ Podaj stację: ${available}`);
                return;
            }
            const success = playRadioById(arg);
            if (success) {
                await bot.telegram.sendMessage(chatId, `📻 Odpalam: ${arg.toUpperCase()}`);
            } else {
                await bot.telegram.sendMessage(chatId, `❌ Nieznana stacja.`);
            }
            break;

        case '/stop':
            // Resetujemy status radia
            setServerRadio(false, "", "");
            // Można tu dodać próbę zabicia przeglądarki, ale to ryzykowne (taskkill chrome)
            // Lepiej po prostu dać pauzę systemową:
            exec(`"${process.cwd()}/env-media/Scripts/python.exe" "${process.cwd()}/scripts/control_media.py" pause`);
            
            await bot.telegram.sendMessage(chatId, "⏹️ Zatrzymano.");
            break;
        case '/play':
        case '/pause':
            runMediaControl('playpause'); // lub 'play' / 'pause' w zależności od skryptu
            await bot.telegram.sendMessage(chatId, "⏯️ Play/Pause");
            break;
        
        case '/next':
            runMediaControl('next');
            await bot.telegram.sendMessage(chatId, "⏭️ Next");
            break;

        case '/track':
            const trackInfo = await getNowPlaying();
            await bot.telegram.sendMessage(chatId, trackInfo);
            break;

        case '/volume':
            const vol = parseInt(arg);
            if (!isNaN(vol) && vol >= 0 && vol <= 100) {
                await loudness.setVolume(vol);
                await bot.telegram.sendMessage(chatId, `🔊 Głośność: ${vol}%`);
            } else {
                await bot.telegram.sendMessage(chatId, "❌ Użycie: /volume 0-100");
            }
            break;

        // === 3. SYSTEM ===
        case '/uptime':
            const up = process.uptime();
            const h = Math.floor(up / 3600);
            const m = Math.floor((up % 3600) / 60);
            await bot.telegram.sendMessage(chatId, `⏱️ Uptime: ${h}h ${m}m`);
            break;

        case '/logs':
            // Tu możesz wczytać ostatnie linie z pliku .log jeśli masz
            await bot.telegram.sendMessage(chatId, "📜 Logi: (funkcja w budowie)");
            break;
        
        // Menu pomocy
        case '/help':
        case '/start':
            const help = `🤖 *SmartThermo Bot*
/status - Stan pieca
/set [temp] - Ustaw temp
/mode [eco/heat/off] - Tryb
/play, /pause, /next - Muzyka
/volume [0-100] - Głośność
/track - Co gra?
/uptime - Czas pracy
*Każda inna wiadomość zostanie zapisana jako Notatka.*`;
            await bot.telegram.sendMessage(chatId, help, { parse_mode: 'Markdown' });
            break;

        default:
            await bot.telegram.sendMessage(chatId, `❌ Nieznana komenda: ${cmd}`);
            break;
    }
}

// --- GŁÓWNA PĘTLA (Long Polling ręczny via Axios) ---
let offset = 0;

async function runLoop() {
    try {
        const url = `${TELEGRAM_API_ROOT}/bot${TELEGRAM_TOKEN}/getUpdates?offset=${offset}&timeout=10`;
        const response = await axios.get(url);
        const data = response.data as { ok: boolean, result: any[] };

        if (data.ok && data.result.length > 0) {
            for (const update of data.result) {
                offset = update.update_id + 1;

                if (update.message && update.message.text) {
                    const text = update.message.text.trim();
                    const author = update.message.from.first_name;
                    const chatId = update.message.chat.id;

                    console.log(`📩 [Telegram] ${author}: ${text}`);

                    // Auth check
                    if (ALLOWED_USERS.length > 0 && !ALLOWED_USERS.includes(chatId)) {
                        console.log(`⛔ Blokada: ${chatId}`);
                        continue;
                    }

                    // 👉 DECYZJA: KOMENDA CZY NOTATKA?
                    if (text.startsWith('/')) {
                        // To jest komenda
                        await handleCommand(text, chatId);
                    } else {
                        // To jest notatka (stara logika)
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

                        await bot.telegram.sendMessage(chatId, "📝 Notatka zapisana!");
                    }
                }
            }
        }
    } catch (e: any) { 
        if (e.code !== 'ETIMEDOUT' && e.code !== 'ECONNRESET') {
             console.error("🔥 Błąd pętli Telegrama:", e.message || e);
        }
    }
    setTimeout(runLoop, 100);
}

// Start pętli tylko jeśli jest token
if (TELEGRAM_TOKEN !== 'Brak tokena') {
    console.log("🚀 Moduł Notatek i Komend Telegrama uruchomiony.");
    runLoop();
}

export default router;