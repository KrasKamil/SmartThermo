// src/routes/media.ts
import { Router, Request, Response } from 'express';
import * as loudness from 'loudness';
import { getIO } from '../helpers/socket';
import { isWindows, serverRadioState, setServerRadio, RADIO_STATIONS } from '../helpers/system';
import path from 'path';
import fs from 'fs';

const router = Router();

// PAMIĘĆ SERWERA
let mediaState = {
    source: "System", 
    status: "Stopped",
    title: "",
    artist: "",
    streamUrl: "",
    cover: ""
};

let lastControlTime = 0; 
let radioStartTime = 0; 
const MONITOR_LOCK_TIME = 4000;
const RADIO_SHIELD_TIME = 6000;

// --- GET: Listy Radiowe ---
router.get('/radio/list', (req, res) => {
    const frontendList = RADIO_STATIONS.map(s => ({
        id: s.id, title: s.title, subtitle: s.subtitle, streamUrl: s.streamUrl
    }));
    res.json(frontendList);
});

// --- GET: Aktualny Stan ---
router.get('/media/now-playing', (req, res) => {
    res.json(mediaState);
});

// --- POST: Główny update z Pythona (Monitor) ---
router.post('/media/update-system', (req: Request, res: Response) => {
    const data = req.body;
    const now = Date.now();

    // 1. Jeśli właśnie coś klikaliśmy w UI, ignorujemy update przez chwilę
    if (now - lastControlTime < MONITOR_LOCK_TIME) {
        return res.json({ success: true, ignored: true, reason: "User Interaction Lock" });
    }

    // 2. LOGIKA RADIA (TARCZA OCHRONNA)
    if (mediaState.source === 'Radio' && mediaState.status === 'Playing') {
        
        // 🔥 NOWOŚĆ: TARCZA RADIA 🔥
        // Jeśli Radio zostało włączone mniej niż X sekund temu, ignorujemy Bluetooth/Spotify
        // nawet jeśli Python krzyczy, że "coś tam gra".
        if (now - radioStartTime < RADIO_SHIELD_TIME) {
             console.log("🛡️ Radio Shield: Ignoruję sygnał z systemu (Bluetooth/Spotify) podczas rozruchu radia.");
             return res.json({ success: true, ignored: true, reason: "Radio Shield Active" });
        }

        // Jeśli Python wykrył, że coś gra (Spotify lub Bluetooth) PO upływie czasu ochronnego
        if (data.status === 'Playing') {
            
            // Opcjonalnie: Dodatkowe zabezpieczenie - jeśli to Bluetooth, upewnij się, że nie jest to "duch"
            // Ale na razie prosta logika: jeśli coś nowego weszło po 6 sekundach -> wyłączamy radio
            console.log("🎵 Wykryto zewnętrzne źródło - zatrzymuję Radio serwerowe.");
            setServerRadio(false, "", "", "");
        } else {
            // Jeśli system stoi, a my gramy Radio -> ignoruj update z Pythona
            return res.json({ success: true, ignored: true });
        }
    }

    // 3. Aktualizacja stanu
    mediaState = {
        source: data.source || "System", 
        status: data.status,
        title: data.title,
        artist: data.artist,
        streamUrl: "",
        cover: data.cover || ""
    };
    
    getIO().emit('media_update', mediaState);
    res.json({ success: true });
});

// --- GET: Głośność ---
router.get('/media/volume', async (req, res) => {
    try {
        const vol = await loudness.getVolume();
        const muted = await loudness.getMuted();
        res.json({ volume: muted ? 0 : vol, muted: muted });
    } catch { res.json({ volume: 50 }); }
});

// --- POST: Sterowanie ---
router.post('/media/control', async (req: Request, res: Response) => {
    const { action, value } = req.body;
    lastControlTime = Date.now(); // Blokujemy monitor na chwilę

    try {
        // Głośność
        if (action === 'set_volume') await loudness.setVolume(parseInt(value));
        else if (action === 'volume_up') {
             const v = await loudness.getVolume();
             await loudness.setVolume(Math.min(v + 5, 100));
        } 
        else if (action === 'volume_down') {
             const v = await loudness.getVolume();
             await loudness.setVolume(Math.max(v - 5, 0));
        }
        
        // Radio START
        else if (action === 'play_radio' && value) {
            if (isWindows) executePythonControl('pause'); // Zatrzymaj Spotify

            // 🔥 USTAWIAMY CZAS STARTU RADIA (AKTYWACJA TARCZY)
            radioStartTime = Date.now(); 
            
            mediaState = {
                source: "Radio", status: "Playing",
                title: value.title, artist: "Live Stream",
                streamUrl: value.url, cover: "style-css/img/radio.svg"
            };
            setServerRadio(true, value.title, "Live", value.url);
            getIO().emit('media_update', mediaState);
        }
        // Radio PAUSE
        else if (action === 'pause' && mediaState.source === 'Radio') {
            mediaState.status = 'Paused';
            setServerRadio(false, mediaState.title, "Paused", mediaState.streamUrl);
            
            getIO().emit('media_update', mediaState);
        }

        // System Control (Play/Pause/Next)
        else {
             // Jeśli gramy Radio i wciskamy Play/Next (Systemowe) -> Wychodzimy z Radia
             if (mediaState.source === 'Radio') {
                 setServerRadio(false, "", "", "");
                 mediaState.source = 'System';
             }
             if (isWindows) executePythonControl(action);
        }

        res.json({ status: 'success' });
    } catch (e) {
        res.status(500).json({ error: 'Control Error' });
    }
});

// --- GET: Głośność ---
router.get('/media/volume', async (req, res) => {
    try {
        const vol = await loudness.getVolume();
        const muted = await loudness.getMuted();
        res.json({ volume: muted ? 0 : vol, muted: muted });
    } catch { res.json({ volume: 50 }); }
});

// --- POST: Sterowanie ---
router.post('/media/control', async (req: Request, res: Response) => {
    const { action, value } = req.body;
    lastControlTime = Date.now(); // Blokujemy monitor na chwilę

    try {
        // Głośność
        if (action === 'set_volume') await loudness.setVolume(parseInt(value));
        else if (action === 'volume_up') {
             const v = await loudness.getVolume();
             await loudness.setVolume(Math.min(v + 5, 100));
        } 
        else if (action === 'volume_down') {
             const v = await loudness.getVolume();
             await loudness.setVolume(Math.max(v - 5, 0));
        }
        
        // Radio
        else if (action === 'play_radio' && value) {
            if (isWindows) executePythonControl('pause'); // Zatrzymaj Spotify
            
            mediaState = {
                source: "Radio", status: "Playing",
                title: value.title, artist: "Live Stream",
                streamUrl: value.url, cover: "style-css/img/radio.svg"
            };
            setServerRadio(true, value.title, "Live", value.url);
            getIO().emit('media_update', mediaState);
        }
        else if (action === 'pause' && mediaState.source === 'Radio') {
            mediaState.status = 'Paused';
            getIO().emit('media_update', mediaState);
        }

        // System Control (Play/Pause/Next)
        else {
             if (mediaState.source === 'Radio') {
                 setServerRadio(false, "", "", "");
                 mediaState.source = 'System';
             }
             if (isWindows) executePythonControl(action);
             
             // Opcjonalnie: optymistyczny update UI
             // getIO().emit('media_update', ...);
        }

        res.json({ status: 'success' });
    } catch (e) {
        res.status(500).json({ error: 'Control Error' });
    }
});

router.get('/config', (req, res) => {
    res.json({ clockFormat: process.env.CLOCK_FORMAT || '12' });
});

function executePythonControl(action: string) {
    const exec = require('child_process').exec;
    const cmd = `"${path.join(process.cwd(), 'env-media/Scripts/python.exe')}" "${path.join(process.cwd(), 'scripts/control_media.py')}" ${action}`;
    exec(cmd, { cwd: path.join(process.cwd(), 'scripts') }, () => {});
}

export default router;