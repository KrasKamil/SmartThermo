import { Telegraf, Markup } from 'telegraf';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';

// Helpery
import { RADIO_STATIONS } from '../helpers/system';
import { addNote } from '../routes/notes'; 

// Konfiguracja
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'Brak tokena';
const TELEGRAM_API_ROOT = process.env.TELEGRAM_API_ROOT || 'https://api.telegram.org';
const ALLOWED_USERS: number[] = [8290453013, 8504057899];

// Ścieżki
const SCRIPTS_DIR = path.join(process.cwd(), 'scripts');
const NIRCMD_PATH = path.join(SCRIPTS_DIR, 'nircmd.exe');

let bot: Telegraf | null = null;
if (TELEGRAM_TOKEN !== 'Brak tokena') {
    bot = new Telegraf(TELEGRAM_TOKEN, { telegram: { apiRoot: TELEGRAM_API_ROOT } });
}

// ════════════════════════════════════════════════════════════════════════════
// HELPERY
// ════════════════════════════════════════════════════════════════════════════

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 🔥 Bezpieczne odpowiadanie na przyciski (Ignoruje błędy "query is too old")
const safeAnswer = async (ctx: any, text?: string) => {
    try {
        await ctx.answerCbQuery(text);
    } catch (e: any) {
        // Ignorujemy błąd 400 (Bad Request: query is too old), bo to tylko kosmetyka
        if (!e.message.includes('query is too old')) {
            console.error("Telegram CB Error:", e.message);
        }
    }
};

const triggerApiAction = async (action: string, value: any = null) => {
    try {
        const port = process.env.PORT || 8888;
        await axios.post(`http://localhost:${port}/api/media/control`, { action, value });
    } catch (e) {
        console.error("Telegram API trigger fail:", e);
    }
};

const getNowPlaying = async (): Promise<string> => {
    try {
        const port = process.env.PORT || 8888;
        const res = await axios.get(`http://localhost:${port}/api/media/now-playing`);
        const data = res.data;

        if (data.source === 'Radio' && data.status === 'Playing') {
            return `📻 Radio: ${data.title}`;
        }
        if (data.status === 'Playing') {
            return `🎵 ${data.artist || ''} - ${data.title || ''}`;
        }
        return "Cisza (Pauza/Stop)";
    } catch {
        return "Błąd pobierania info";
    }
};

const generateTempChart = async (): Promise<Buffer | null> => {
    try {
        const port = process.env.PORT || 8888;
        const { data } = await axios.get(`http://localhost:${port}/api/weather/history`);
        if (!data || !Array.isArray(data) || data.length === 0) return null;

        const width = 800; 
        const height = 400;
        const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height, backgroundColour: '#1a1a1a' });

        const configuration: any = {
            type: 'line',
            data: {
                labels: data.map((d: any) => d.time),
                datasets: [{
                    label: 'Temperatura (°C)',
                    data: data.map((d: any) => d.temp),
                    borderColor: '#00d2ff',
                    backgroundColor: 'rgba(0, 210, 255, 0.2)',
                    borderWidth: 3,
                    pointRadius: 0,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                plugins: { legend: { labels: { color: 'white', font: { size: 18 } } } },
                scales: {
                    y: { ticks: { color: '#aaaaaa', font: { size: 14 } }, grid: { color: '#333333' } },
                    x: { ticks: { color: '#aaaaaa', font: { size: 14 }, maxTicksLimit: 8 }, grid: { display: false } }
                }
            }
        };
        return await chartJSNodeCanvas.renderToBuffer(configuration);
    } catch (e) {
        return null;
    }
};

// ════ LOGIKA BOTA ════

export const initTelegramBot = () => {
    if (!bot) return;
    console.log("🚀 Telegram Bot Ready");

    // --- MENU GŁÓWNE ---
    bot.command(['start', 'menu'], (ctx) => {
        ctx.reply('🎛️ *Panel Sterowania*', {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🎵 Muzyka', 'menu_music'), Markup.button.callback('🌡️ Termostat', 'menu_thermo')],
                [Markup.button.callback('⚙️ System', 'menu_system')]
            ])
        });
    });

    // --- SUBMENU: MUZYKA ---
    bot.action('menu_music', (ctx) => {
        ctx.editMessageText('🎵 *Muzyka*', {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🚀 Spotify Play', 'cmd_playspoti')],
                [Markup.button.callback('📻 Radio', 'menu_radio')],
                [Markup.button.callback('🎵 Co gra?', 'cmd_track')],
                [Markup.button.callback('⏯️ Play/Pause', 'cmd_playpause'), Markup.button.callback('⏭️ Next', 'cmd_next')],
                [Markup.button.callback('🔉 Vol -', 'vol_down'), Markup.button.callback('🔊 Vol +', 'vol_up')],
                [Markup.button.callback('🔙 Powrót', 'menu_main')]
            ])
        });
    });

    // --- SUBMENU: RADIO ---
    bot.action('menu_radio', (ctx) => {
        const buttons = RADIO_STATIONS.map(s => [Markup.button.callback(`📻 ${s.title}`, `radio_${s.id}`)]);
        buttons.push([Markup.button.callback('🔙 Powrót', 'menu_music')]);
        ctx.editMessageText('📻 *Wybierz stację:*', { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
    });

    // --- SUBMENU: TERMOSTAT (TU JEST WYKRES!) ---
    bot.action('menu_thermo', (ctx) => {
        ctx.editMessageText('🌡️ *Termostat*\nTemp: 21.5°C | Cel: 22.0°C', {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🔥 Grzanie', 'mode_heat'), Markup.button.callback('🍃 Eco', 'mode_eco')],
                [Markup.button.callback('📉 Wykres 24h', 'cmd_chart')], // <-- TUTAJ PRZYWRÓCIŁEM WYKRES
                [Markup.button.callback('🔙 Powrót', 'menu_main')]
            ])
        });
    });

    // --- SUBMENU: SYSTEM ---
    bot.action('menu_system', (ctx) => {
        const uptime = Math.floor(process.uptime() / 60);
        ctx.editMessageText(`⚙️ *System Info*\nUptime: ${uptime} min`, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('⏹️ STOP ALL', 'cmd_stop')],
                [Markup.button.callback('🔙 Powrót', 'menu_main')]
            ])
        });
    });

    // --- POWRÓT DO MENU ---
    bot.action('menu_main', (ctx) => {
        ctx.editMessageText('🎛️ *Panel Sterowania*', {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🎵 Muzyka', 'menu_music'), Markup.button.callback('🌡️ Termostat', 'menu_thermo')],
                [Markup.button.callback('⚙️ System', 'menu_system')]
            ])
        });
    });
    // --- AKCJE (Wszystkie używają safeAnswer) ---

    bot.action('cmd_playpause', async (ctx) => { 
        safeAnswer(ctx, "⏯️ Play/Pause");
        await triggerApiAction('playpause'); 
    });

    bot.action('cmd_next', async (ctx) => { 
        safeAnswer(ctx, "⏭️ Next");
        await triggerApiAction('next'); 
    });

    bot.action(/radio_(.+)/, async (ctx) => {
        const id = ctx.match[1];
        const station = RADIO_STATIONS.find(s => s.id === id);
        if (station) {
            safeAnswer(ctx, `Start: ${station.title}`);
            await triggerApiAction('play_radio', { title: station.title, url: station.streamUrl });
            ctx.reply(`📻 Gramy: ${station.title}`);
        }
    });

    // Spotify Start
    bot.action('cmd_playspoti', async (ctx) => {
        safeAnswer(ctx, "Wznawiam Spotify...");
        await triggerApiAction('start_spotify');
        ctx.reply("🎵 Wznawiam odtwarzanie Spotify...");
    });

    bot.action('cmd_track', async (ctx) => {
        const txt = await getNowPlaying();
        ctx.reply(txt); 
        safeAnswer(ctx);
    });

    bot.action('cmd_chart', async (ctx) => {
        safeAnswer(ctx, "Generuję wykres...");
        const buf = await generateTempChart();
        if (buf) await ctx.replyWithPhoto({ source: buf }, { caption: '📉 *Wykres Temperatury*' });
        else ctx.reply("⚠️ Błąd generowania wykresu.");
    });

    bot.action('cmd_stop', async (ctx) => { 
        safeAnswer(ctx, "Stop");
        await triggerApiAction('pause'); 
    });

    bot.action('vol_up', async (ctx) => { 
        safeAnswer(ctx, "Vol +");
        await triggerApiAction('volume_up'); 
    });
    
    bot.action('vol_down', async (ctx) => { 
        safeAnswer(ctx, "Vol -");
        await triggerApiAction('volume_down'); 
    });

    runLoop();
};

let offset = 0;
async function runLoop() {
    if (!bot) return;
    try {
        const url = `${TELEGRAM_API_ROOT}/bot${TELEGRAM_TOKEN}/getUpdates?offset=${offset}&timeout=10`;
        const res = await axios.get(url);
        if (res.data.ok && res.data.result.length > 0) {
            for (const u of res.data.result) {
                offset = u.update_id + 1;
                
                if (u.callback_query) {
                    try {
                        bot.handleUpdate(u);
                    } catch (err) { console.error("Błąd obsługi przycisku:", err); }
                }

                if (u.message && u.message.text) {
                    const chatId = u.message.chat.id;
                    if (ALLOWED_USERS.includes(chatId)) {
                        try {
                            bot.handleUpdate(u);
                            const text = u.message.text.trim();
                            const author = u.message.from.first_name;
                            
                            if (!text.startsWith('/')) {
                                if (addNote) {
                                    addNote(text, author);
                                    bot.telegram.sendMessage(chatId, "📝 Notatka wyświetlona!");
                                }
                            }
                        } catch (err) { console.error("Błąd obsługi wiadomości:", err); }
                    }
                }
            }
        }
    } catch (e: any) {
        // Ignoruj błędy sieciowe (timeouty są normalne)
    }
    setTimeout(runLoop, 100);
}