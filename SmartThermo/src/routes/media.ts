// src/routes/media.ts
import { Router, Request, Response } from 'express';
import * as loudness from 'loudness';
import { getIO } from '../helpers/socket';
import { isWindows, getLineInStatus, serverRadioState, setServerRadio, RADIO_STATIONS } from '../helpers/system';
import path from 'path';
import fs from 'fs';

const router = Router();

// --- PAMIĘĆ SERWERA ---
let mediaState = {
    source: "System", 
    status: "Stopped",
    title: "",
    artist: "",
    streamUrl: "",
    cover: ""
};

// ZMIENNE OCHRONNE
let lastControlTime = 0; 
// Czas (w ms), przez który ignorujemy monitor po włączeniu radia (żeby uniknąć auto-pauzy)
const MONITOR_LOCK_TIME = 4000; 

// --- GET: Listy Radiowe ---
router.get('/radio/list', (req, res) => {
    const frontendList = RADIO_STATIONS.map(s => ({
        id: s.id, title: s.title, subtitle: s.subtitle, streamUrl: s.streamUrl
    }));
    res.json(frontendList);
});

// --- GET: Aktualny Stan ---
router.get('/media/now-playing', async (req: Request, res: Response) => {
    if (mediaState.source === 'Radio' && mediaState.status === 'Playing') {
        return res.json(mediaState);
    }
    if (!isWindows) {
        try {
            const lineDevice = await getLineInStatus();
            if (lineDevice) {
                return res.json({
                    title: "Audio Bluetooth",
                    artist: lineDevice,
                    status: "Playing",
                    source: "Bluetooth",
                    type: "bluetooth"
                });
            }
        } catch (e) {}
    }
    res.json(mediaState);
});

// --- POST: Aktualizacja z Pythona (Monitor Systemowy) ---
router.post('/media/update-system', (req: Request, res: Response) => {
    const data = req.body;
    const now = Date.now();

    // 🛡️ 1. BLOKADA CZASOWA (Cool-down)
    // Jeśli włączyliśmy radio mniej niż 4 sekundy temu, ignorujemy Pythona.
    if (now - lastControlTime < MONITOR_LOCK_TIME) {
        return res.json({ success: true, ignored: true, reason: "Cooldown" });
    }

    // 🛡️ 2. OCHRONA PRZED PĘTLĄ RADIA (Loop Protection)
    // Jeśli Radio gra, a Python mówi "System Playing" (bez zmiany tytułu na np. Spotify),
    // to znaczy, że Python słyszy nasze radio w przeglądarce. Ignorujemy to.
    if (mediaState.source === 'Radio' && mediaState.status === 'Playing') {
        if (data.status === 'Playing') {
             // Ignorujemy, żeby nie wyłączyć radia
             return res.json({ success: true, ignored: true, reason: "Radio Loop detected" });
        }
        // Jeśli system się zatrzymał (Stopped/Paused), też ignorujemy, bo Radio ma priorytet
        if (data.status !== 'Playing') {
             return res.json({ success: true, ignored: true });
        }
    }

    // W przeciwnym razie (np. ktoś włączył Spotify ręcznie), aktualizujemy stan
    mediaState = {
        source: "System",
        status: data.status,
        title: data.title,
        artist: data.artist,
        streamUrl: "",
        cover: data.cover || ""
    };
    getIO().emit('media_update', mediaState);
    
    res.json({ success: true });
});

// --- POST: Sterowanie Radiem ---
router.post('/media/radio/status', (req: Request, res: Response) => {
    // To jest fallback, ale główna logika jest w /control
    res.json({ success: true });
});

// --- GET: Głośność ---
router.get('/media/volume', async (req: Request, res: Response) => {
    try {
        const vol = await loudness.getVolume();
        const muted = await loudness.getMuted();
        res.json({ volume: muted ? 0 : vol, muted: muted });
    } catch { 
        res.json({ volume: 50 }); 
    }
});

// --- POST: Sterowanie (Play/Pause/Vol/PlayRadio) ---
router.post('/media/control', async (req: Request, res: Response) => {
    const { action, value } = req.body;
    
    try {
        // 🔥 Ustawiamy czas ostatniej akcji -> Aktywuje BLOKADĘ MONITORA
        lastControlTime = Date.now();

        // 1. Głośność
        if (action === 'set_volume') {
            const vol = parseInt(value); // Zamiana na liczbę
            await loudness.setVolume(vol);
            
            // POPRAWKA: Jeśli 0% -> Włącz Mute, w przeciwnym razie -> Wyłącz Mute
            if (vol === 0) {
                await loudness.setMuted(true);
            } else {
                await loudness.setMuted(false);
            }
        } else if (action === 'volume_up') {
            const v = await loudness.getVolume();
            await loudness.setVolume(Math.min(v + 5, 100));
            await loudness.setMuted(false); // Przy pogłaśnianiu zawsze odmutuj
        } else if (action === 'volume_down') {
            const v = await loudness.getVolume();
            const newVol = Math.max(v - 5, 0);
            await loudness.setVolume(newVol);
            
            // Tu też warto dodać logikę dla przycisku:
            if (newVol === 0) await loudness.setMuted(true);
        }
        
        // 2. Obsługa Radia (Start)
        if (action === 'play_radio' && value) {
             mediaState = {
                source: "Radio",
                status: "Playing",
                title: value.title,
                artist: "Live Stream",
                streamUrl: value.url,
                cover: "style-css/img/radio.svg" //
            };
            setServerRadio(true, value.title, "Live", value.url);
            
            // Natychmiast powiadamiamy frontend, żeby pokazał widget
            getIO().emit('media_update', mediaState);
            
            // Jeśli jesteśmy na Windows, pauzujemy Spotify w tle (żeby nie grały na raz)
           //  if (isWindows) executePythonControl('pause');
        }
        
        // 3. Pauza Radia
        else if (action === 'pause' && mediaState.source === 'Radio') {
            mediaState.status = 'Paused';
            getIO().emit('media_update', mediaState);
        }

        // 4. Sterowanie Systemem (Spotify/YouTube)
        else if (isWindows && ['play', 'pause', 'playpause', 'next', 'prev'].includes(action)) {
             
             // Ustalmy nowy status optymistycznie
             let newStatus = mediaState.status;
             if (action === 'pause') newStatus = 'Paused';
             if (action === 'play') newStatus = 'Playing';
             if (action === 'playpause') {
                 newStatus = (mediaState.status === 'Playing') ? 'Paused' : 'Playing';
             }
             
             // Jeśli gra Radio, zostawiamy 'Radio', żeby interfejs się nie pogubił.
             if (mediaState.source !== 'Radio') {
                 mediaState.source = 'System';
             }

             // Aktualizujemy status
             mediaState.status = newStatus;

             // Wysyłamy aktualizację do frontendu
             getIO().emit('media_update', mediaState);
            
             executePythonControl(action);
        }

        res.json({ status: 'success' });
    } catch (e) {
        console.error("Control Error:", e);
        res.status(500).json({ error: 'Control Error' });
    }
});

// Helper do uruchamiania Pythona (Control Media)
function executePythonControl(action: string) {
    const exec = require('child_process').exec;
    const SCRIPTS_DIR = path.join(process.cwd(), 'scripts');
    const CONTROL_SCRIPT = path.join(SCRIPTS_DIR, 'control_media.py');
    const VENV_DIR = path.join(process.cwd(), 'env-media');
    
    let pythonExe = isWindows 
        ? path.join(VENV_DIR, 'Scripts', 'python.exe')
        : path.join(VENV_DIR, 'bin', 'python');

    if (!fs.existsSync(pythonExe)) {
        pythonExe = isWindows ? 'python' : 'python3';
    }

    const cmd = `"${pythonExe}" "${CONTROL_SCRIPT}" ${action}`;
    exec(cmd, { cwd: SCRIPTS_DIR }, () => {});
}

// Konfiguracja
router.get('/config', (req, res) => {
    res.json({ clockFormat: process.env.CLOCK_FORMAT || '12' });
});

export default router;