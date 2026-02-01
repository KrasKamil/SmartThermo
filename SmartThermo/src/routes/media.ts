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

    // 🛡️ 1. BLOKADA CZASOWA (Cool-down po kliknięciu przycisku)
    if (now - lastControlTime < MONITOR_LOCK_TIME) {
        return res.json({ success: true, ignored: true, reason: "Cooldown active" });
    }

    // 🛡️ 2. FILTR "ECHA" (Gdy gra Radio, ignorujemy przeglądarkę)
    if (mediaState.source === 'Radio' && mediaState.status === 'Playing') {
        
        const incomingTitle = (data.title || "").toLowerCase();
        const incomingArtist = (data.artist || "").toLowerCase();
        const currentRadioTitle = (mediaState.title || "").toLowerCase();

        // Słowa, które oznaczają, że Windows widzi naszą własną aplikację
        const blackList = [
            "thermo", 
            "assistant", 
            "chrome", 
            "edge", 
            "firefox", 
            "opera",
            "browser",
            currentRadioTitle // np. "rmf fm" - jeśli windows widzi to samo co my gramy, to też echo
        ];

        // Sprawdź czy przychodzące dane zawierają zakazane słowa
        const isSelfEcho = blackList.some(word => 
            incomingTitle.includes(word) || incomingArtist.includes(word)
        );

        // Jeśli gra, ale to tylko echo naszej aplikacji -> IGNORUJ
        if (data.status === 'Playing' && isSelfEcho) {
             console.log(`🛡️ Ignoruję echo systemowe: ${data.title} (${data.artist})`);
             return res.json({ success: true, ignored: true, reason: "Radio Loop detected" });
        }
        
        // Jeśli Windows zgłasza "Paused", a my mamy Radio Playing -> IGNORUJ
        // (Bo często przeglądarka zgłasza pauzę innych kart, gdy jedna gra)
        if (data.status === 'Paused') {
            return res.json({ success: true, ignored: true, reason: "Ignore system pause while radio plays" });
        }
    }

    // Jeśli przeszło filtry (czyli np. włączyłeś Spotify, a nie echo), aktualizujemy stan
    mediaState = {
        source: "System",
        status: data.status,
        title: data.title,
        artist: data.artist,
        streamUrl: "",
        cover: data.cover || ""
    };
    
    // Jeśli system faktycznie gra (np. Spotify), wyłącz flagę Radia w pamięci pomocniczej
    if (data.status === 'Playing') {
        setServerRadio(false, "", "", "");
    }

    getIO().emit('media_update', mediaState);
    
    res.json({ success: true });
});

// --- POST: Sterowanie Radiem ---
router.post('/media/radio/status', (req: Request, res: Response) => {
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
        lastControlTime = Date.now(); // Aktywuj blokadę monitora na 4 sekundy

        // 1. Głośność
        if (action === 'set_volume') {
            const vol = parseInt(value);
            await loudness.setVolume(vol);
            if (vol === 0) await loudness.setMuted(true);
            else await loudness.setMuted(false);
        } else if (action === 'volume_up') {
            const v = await loudness.getVolume();
            await loudness.setVolume(Math.min(v + 5, 100));
            await loudness.setMuted(false);
        } else if (action === 'volume_down') {
            const v = await loudness.getVolume();
            const newVol = Math.max(v - 5, 0);
            await loudness.setVolume(newVol);
        }
        
        // 2. Start Radia
        if (action === 'play_radio' && value) {
            console.log(`📻 Start Radia: ${value.title}`);
            
            // NAJWAŻNIEJSZE: Najpierw pauzujemy Spotify/System, żeby się nie gryzło
            if (isWindows) {
                executePythonControl('pause');
            }

            mediaState = {
                source: "Radio",
                status: "Playing",
                title: value.title,
                artist: "Live Stream",
                streamUrl: value.url,
                cover: "style-css/img/radio.svg" 
            };
            setServerRadio(true, value.title, "Live", value.url);
            
            getIO().emit('media_update', mediaState);
        }
        
        // 3. Pauza Radia
        else if (action === 'pause' && mediaState.source === 'Radio') {
            mediaState.status = 'Paused';
            getIO().emit('media_update', mediaState);
        }

        // 4. Sterowanie Systemem (Spotify/YouTube)
        else if (isWindows && ['play', 'pause', 'playpause', 'next', 'prev'].includes(action)) {
             
             // Jeśli sterujemy systemem, to znaczy że chcemy wyjść z trybu Radia
             if (mediaState.source === 'Radio' && action === 'play') {
                 setServerRadio(false, "", "", "");
                 mediaState.source = 'System';
             }

             let newStatus = mediaState.status;
             if (action === 'pause') newStatus = 'Paused';
             if (action === 'play') newStatus = 'Playing';
             if (action === 'playpause') {
                 newStatus = (mediaState.status === 'Playing') ? 'Paused' : 'Playing';
             }
             
             if (mediaState.source !== 'Radio') {
                 mediaState.source = 'System';
                 mediaState.status = newStatus;
             }

             getIO().emit('media_update', mediaState);
             executePythonControl(action);
        }

        res.json({ status: 'success' });
    } catch (e) {
        console.error("Control Error:", e);
        res.status(500).json({ error: 'Control Error' });
    }
});

// Helper do uruchamiania Pythona
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

router.get('/config', (req, res) => {
    res.json({ clockFormat: process.env.CLOCK_FORMAT || '12' });
});

export default router;