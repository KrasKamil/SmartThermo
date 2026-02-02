// src/routes/notes.ts
import { Router } from 'express';
import { Telegraf, Markup } from 'telegraf';
import dns from 'dns';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { exec } from 'child_process';
import * as loudness from 'loudness';
import { setServerRadio, playRadioById, RADIO_STATIONS, serverRadioState } from '../helpers/system';
import { getIO } from '../helpers/socket';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';

dotenv.config();

// Wymuszenie IPv4
try { dns.setDefaultResultOrder('ipv4first'); } catch(e) {}

const router = Router();
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'Brak tokena';

// Ścieżki
const HISTORY_DIR = path.join(process.cwd(), 'jsons');
const HISTORY_FILE = path.join(HISTORY_DIR, 'history.json');
const SCRIPTS_DIR = path.join(process.cwd(), 'scripts');
const VENV_PYTHON_PATH = path.join(process.cwd(), 'env-media', 'Scripts', 'python.exe');
const CONTROL_MEDIA_SCRIPT = path.join(SCRIPTS_DIR, 'control_media.py');
const PYTHON_SCRIPT_PATH = path.join(SCRIPTS_DIR, 'get_media.py');
const NIRCMD_PATH = path.join(SCRIPTS_DIR, 'nircmd.exe');
const TELEGRAM_API_ROOT = process.env.TELEGRAM_API_ROOT || 'https://api.telegram.org';

if (TELEGRAM_TOKEN === 'Brak tokena') {
    console.error('❌ Błąd: Brak tokena Telegrama.');
}

const bot = new Telegraf(TELEGRAM_TOKEN, {
    telegram: { apiRoot: TELEGRAM_API_ROOT }
});

const ALLOWED_USERS: number[] = [
    8290453013,
    8504057899 
];

// --- POMOCNICZE: Sleep ---
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- POMOCNICZE: Przywracanie Okna (AGRESYWNE) ---
const focusWindow = () => {
    if (fs.existsSync(NIRCMD_PATH)) {
        // ZMIANA: Kolejność: Activate -> Maximize -> SetTopMost
        // Używamy 'win max' zamiast 'win restore', żeby uniknąć pół-okien.
        const cmd = `
            "${NIRCMD_PATH}" win activate stitle "Your Thermo Assistant"
            && "${NIRCMD_PATH}" win max stitle "Your Thermo Assistant"
            && "${NIRCMD_PATH}" win settopmost stitle "Your Thermo Assistant" 1
            && "${NIRCMD_PATH}" win settopmost stitle "Your Thermo Assistant" 0
        `.replace(/\n/g, ' ');
        
        exec(cmd, (err) => {
            if (err) console.log("⚠️ Focus warn:", err.message);
        });
    }
};

const runMediaControl = (action: string) => {
    if (!fs.existsSync(VENV_PYTHON_PATH) || !fs.existsSync(CONTROL_MEDIA_SCRIPT)) return;
    exec(`"${VENV_PYTHON_PATH}" "${CONTROL_MEDIA_SCRIPT}" ${action}`, { cwd: SCRIPTS_DIR }, () => {});
};

const getNowPlaying = (): Promise<string> => {
    return new Promise((resolve) => {
        // Jeśli gra Radio z naszego serwera, zwróć info o radiu
        if (serverRadioState.isPlaying) {
             return resolve(`📻 Radio: ${serverRadioState.name}`);
        }

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

const generateTempChart = async (): Promise<Buffer | null> => {
    try {
        // 1. Pobierz dane z własnego API (zakładamy, że serwer działa lokalnie)
        const port = process.env.PORT || 8888;
        const apiUrl = `http://localhost:${port}/api/weather/history`;
        const { data } = await axios.get(apiUrl);

        if (!data || !Array.isArray(data) || data.length === 0) return null;

        // 2. Konfiguracja renderera (wymiary obrazka)
        const width = 800; 
        const height = 400;
        const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height, backgroundColour: '#1a1a1a' });

        // 3. Konfiguracja wykresu (taka sama jak w Chart.js)
        const configuration: any = {
            type: 'line',
            data: {
                labels: data.map((d: any) => d.time),
                datasets: [{
                    label: 'Temperatura (°C)',
                    data: data.map((d: any) => d.temp),
                    borderColor: '#00d2ff',       // Kolor linii (cyan z Twojego UI)
                    backgroundColor: 'rgba(0, 210, 255, 0.2)', // Wypełnienie pod wykresem
                    borderWidth: 3,
                    pointRadius: 0,               // Ukrywamy punkty dla czystości
                    fill: true,
                    tension: 0.4                  // Wygładzanie linii
                }]
            },
            options: {
                plugins: {
                    legend: { labels: { color: 'white', font: { size: 18 } } }
                },
                scales: {
                    y: {
                        ticks: { color: '#aaaaaa', font: { size: 14 } },
                        grid: { color: '#333333' }
                    },
                    x: {
                        ticks: { color: '#aaaaaa', font: { size: 14 }, maxTicksLimit: 8 },
                        grid: { display: false }
                    }
                }
            }
        };

        return await chartJSNodeCanvas.renderToBuffer(configuration);
    } catch (e) {
        console.error("Błąd generowania wykresu:", e);
        return null;
    }
};

// --- LOGIKA NOTATEK ---
interface Note { text: string; author: string; timestamp: number; visible: boolean; }
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

router.get('/', (req, res) => res.json(activeNote));
router.get('/history', (req, res) => res.json(history));
router.post('/clear', (req, res) => {
    activeNote.visible = false;
    res.json({ success: true });
});

// ==========================================
// 🎮 INTERFEJS BUTTONOWY (INLINE KEYBOARD)
// ==========================================

// 1. MENU GŁÓWNE (/start)
bot.command(['start', 'menu'], (ctx) => {
    ctx.reply('🎛️ *Centrum Sterowania*', {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🎵 Muzyka', 'menu_music'), Markup.button.callback('🌡️ Termostat', 'menu_thermo')],
            [Markup.button.callback('⚙️ System', 'menu_system')]
        ])
    });
});

// 2. PODMENU: MUZYKA (Z nowym przyciskiem Track)
bot.action('menu_music', (ctx) => {
    ctx.editMessageText('🎵 *Panel Muzyczny*\nWybierz akcję:', {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🚀 Spotify Start', 'cmd_playspoti')],
            [Markup.button.callback('📻 Radio FM', 'menu_radio')],
            [Markup.button.callback('🎵 Co gra?', 'cmd_track')], // <--- NOWY PRZYCISK
            [Markup.button.callback('⏯️ Play/Pause', 'cmd_playpause'), Markup.button.callback('⏭️ Next', 'cmd_next')],
            [Markup.button.callback('🔉 Vol -', 'vol_down'), Markup.button.callback('🔊 Vol +', 'vol_up')],
            [Markup.button.callback('🔙 Powrót', 'menu_main')]
        ])
    });
});

// 3. PODMENU: RADIO
bot.action('menu_radio', (ctx) => {
    const stationButtons = RADIO_STATIONS.map(s => [Markup.button.callback(`📻 ${s.title}`, `radio_${s.id}`)]);
    stationButtons.push([Markup.button.callback('🔙 Wróć do Muzyki', 'menu_music')]);

    ctx.editMessageText('📻 *Wybierz stację:*', {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(stationButtons)
    });
});

// 4. PODMENU: TERMOSTAT
bot.action('menu_thermo', (ctx) => {
    ctx.editMessageText('🌡️ *Termostat*\nObecna temp: 21.5°C\nCel: 22.0°C', {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🔥 Grzanie', 'mode_heat'), Markup.button.callback('🍃 Eco', 'mode_eco')],
            [Markup.button.callback('📉 Wykres 24h', 'cmd_chart')],
            [Markup.button.callback('🔙 Powrót', 'menu_main')]
        ])
    });
});

// 5. PODMENU: SYSTEM
bot.action('menu_system', async (ctx) => {
    const up = process.uptime();
    const h = Math.floor(up / 3600);
    const m = Math.floor((up % 3600) / 60);
    
    ctx.editMessageText(`⚙️ *System Info*\n⏱️ Uptime: ${h}h ${m}m`, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Odśwież', 'menu_system')],
            [Markup.button.callback('⏹️ STOP ALL', 'cmd_stop')],
            [Markup.button.callback('🔙 Powrót', 'menu_main')]
        ])
    });
});

bot.action('menu_main', (ctx) => {
    ctx.editMessageText('🎛️ *Centrum Sterowania*', {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🎵 Muzyka', 'menu_music'), Markup.button.callback('🌡️ Termostat', 'menu_thermo')],
            [Markup.button.callback('⚙️ System', 'menu_system')]
        ])
    });
});


// ==========================================
// ⚡ OBSŁUGA AKCJI
// ==========================================

// --- TRACK INFO (NOWE) ---
bot.action('cmd_track', async (ctx) => {
    const info = await getNowPlaying();
    // Odpisujemy wiadomością (nie edytujemy menu, żeby zostało)
    ctx.reply(info); 
    ctx.answerCbQuery();
});

// --- SPOTIFY ---
bot.action('cmd_playspoti', async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    ctx.answerCbQuery("Uruchamiam Spotify...");
    
    const isRadioMode = serverRadioState.isPlaying || serverRadioState.url !== "";
    if (isRadioMode) {
        setServerRadio(false, "", "", "");
        getIO().emit('media_update', { source: "System", status: "Stopped" });
    }

    exec('start spotify:', (err) => { if (err) console.error(err); });
    
    // Wielokrotne przywracanie okna (bo Spotify lubi kraść fokus podczas ładowania)
    setTimeout(() => focusWindow(), 2000); // Po 2s
    setTimeout(() => {
        runMediaControl('play');
        getIO().emit('media_update', {
            source: "System",
            status: "Playing",
            title: "Spotify Connect",
            artist: "Odtwarzanie...",
            cover: "style-css/img/spotify.png"
        });
        focusWindow(); // Po 5s (kluczowe)
    }, 5000);
    setTimeout(() => focusWindow(), 8000); // Po 8s (dla pewności)

    ctx.reply("🚀 Spotify uruchomione w tle.");
});

// --- RADIO ---
bot.action(/radio_(.+)/, async (ctx) => {
    const stationId = ctx.match[1];
    const station = RADIO_STATIONS.find(s => s.id === stationId);
    
    if (station) {
        ctx.answerCbQuery(`Odpalam ${station.title}...`);
        
        runMediaControl('pause');
        await sleep(1000);

        playRadioById(stationId);
        
        getIO().emit('media_update', {
            source: "Radio",
            status: "Playing",
            title: station.title,
            artist: "Radio Internetowe",
            cover: "style-css/img/radio.svg",
            streamUrl: station.streamUrl
        });
        
        // Wymuś focus po odpaleniu radia
        focusWindow();
        setTimeout(() => focusWindow(), 1000);
        
        ctx.reply(`📻 Gramy: ${station.title}`);
    }
});

// --- PLAY / PAUSE ---
bot.action('cmd_playpause', async (ctx) => {
    // Sprawdzamy, czy jesteśmy w "trybie radia" po URL, a nie tylko po isPlaying.
    // Dzięki temu, jak zapauzujesz radio, to przycisk dalej steruje radiem (wznawia je),
    // a nie odpala nagle Spotify w tle.
    const isRadioMode = serverRadioState.url !== "";
    
    if (isRadioMode) {
        // Jeśli gra -> zapauzuj. Jeśli stoi -> wznów.
        const shouldPlay = !serverRadioState.isPlaying;
        
        // Aktualizujemy stan
        setServerRadio(
            shouldPlay, 
            serverRadioState.name, 
            serverRadioState.description, 
            serverRadioState.url
        );
        
        // Jeśli wznawiamy, ustawiamy czas startu dla "Tarczy Ochronnej"
        if (shouldPlay) {
             // Jeśli zmienna radioStartTime nie jest eksportowana z media.ts, 
             // to tarcza zadziała przy następnym "play_radio", ale dla play/pause 
             // telegramowym najważniejsze jest wysłanie socketu.
             // (Opcjonalnie można przenieść radioStartTime do system.ts, ale tu wystarczy update socketu)
        }
        
        getIO().emit('media_update', {
            source: "Radio",
            status: shouldPlay ? "Playing" : "Paused",
            title: serverRadioState.name,
            artist: "Radio Internetowe",
            cover: "style-css/img/radio.svg",
            streamUrl: serverRadioState.url
        });
        
        ctx.answerCbQuery(shouldPlay ? "▶️ Wznawiam Radio" : "⏸️ Pauza Radia");
    } else {
        // Tryb Systemowy (Spotify/Bluetooth)
        runMediaControl('playpause');
        ctx.answerCbQuery("⏯️ Play/Pause System");
    }
});

bot.action('cmd_next', (ctx) => {
    runMediaControl('next');
    ctx.answerCbQuery("⏭️ Następny");
});

bot.action('vol_up', async (ctx) => {
    const v = await loudness.getVolume();
    const newV = Math.min(v + 10, 100);
    await loudness.setVolume(newV);
    ctx.answerCbQuery(`🔊 Głośność: ${newV}%`);
});

bot.action('vol_down', async (ctx) => {
    const v = await loudness.getVolume();
    const newV = Math.max(v - 10, 0);
    await loudness.setVolume(newV);
    ctx.answerCbQuery(`🔉 Głośność: ${newV}%`);
});

bot.action('cmd_stop', (ctx) => {
    setServerRadio(false, "", "", ""); 
    getIO().emit('media_update', { source: "System", status: "Stopped" });
    runMediaControl('stop');
    ctx.answerCbQuery("⏹️ Zatrzymano wszystko");
    ctx.reply("⏹️ Full Stop.");
});

// --- AKCJA: WYSŁANIE WYKRESU ---
bot.action('cmd_chart', async (ctx) => {
    // Informujemy Telegram, że "pracujemy" (kręciołek na przycisku)
    ctx.answerCbQuery("Generuję wykres...");

    const imageBuffer = await generateTempChart();

    if (imageBuffer) {
        // Wysyłamy zdjęcie. 
        // UWAGA: Nie używamy editMessageText, bo nie da się zamienić tekstu na zdjęcie w edycji.
        // Wysyłamy nową wiadomość.
        await ctx.replyWithPhoto({ source: imageBuffer }, {
            caption: '📉 *Wykres temperatury (Ostatnie dane)*',
            parse_mode: 'Markdown'
        });
    } else {
        ctx.reply("⚠️ Nie udało się wygenerować wykresu (brak danych lub błąd API).");
    }
});

// --- OBSŁUGA NOTATEK ---
async function handleMessage(text: string, author: string, chatId: number) {
    if (text === '/start' || text === '/menu') return;

    if (!text.startsWith('/')) {
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

// --- PĘTLA ---
let offset = 0;

async function runLoop() {
    try {
        const url = `${TELEGRAM_API_ROOT}/bot${TELEGRAM_TOKEN}/getUpdates?offset=${offset}&timeout=10`;
        const response = await axios.get(url);
        const data = response.data as { ok: boolean, result: any[] };

        if (data.ok && data.result.length > 0) {
            for (const update of data.result) {
                offset = update.update_id + 1;
                
                if (update.callback_query) {
                    bot.handleUpdate(update);
                }

                if (update.message && update.message.text) {
                    const text = update.message.text.trim();
                    const author = update.message.from.first_name;
                    const chatId = update.message.chat.id;

                    console.log(`📩 [Telegram] ${author}: ${text}`);

                    if (ALLOWED_USERS.length > 0 && !ALLOWED_USERS.includes(chatId)) {
                        console.log(`⛔ Blokada: ${chatId}`);
                        continue;
                    }
                    
                    bot.handleUpdate(update);

                    if (!text.startsWith('/')) {
                        handleMessage(text, author, chatId);
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

if (TELEGRAM_TOKEN !== 'Brak tokena') {
    console.log("🚀 Moduł Notatek i MENU Telegrama uruchomiony.");
    runLoop();
}

export default router;