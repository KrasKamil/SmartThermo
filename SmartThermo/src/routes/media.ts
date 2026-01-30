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

    // 1. BLOKADA CZASOWA (Cool-down po kliknięciu)
    if (now - lastControlTime < MONITOR_LOCK_TIME) {
        return res.json({ success: true, ignored: true });
    }

    // 🛑 2. OCHRONA PRZED PĘTLĄ RADIA (Radio Loop Protection)
    // Jeśli Radio gra, a System zgłasza "Playing", to na 99% przeglądarka raportuje nasze własne radio.
    // Ignorujemy to, żeby nie przełączyć źródła na "System" (co wyłączyłoby radio).
    if (mediaState.source === 'Radio' && mediaState.status === 'Playing') {
        if (data.status === 'Playing') {
             // To jest "Echo" naszego radia -> Ignoruj.
             return res.json({ success: true, ignored: true, reason: "Radio Loop" });
        }
    }

    // Aktualizujemy stan TYLKO jeśli to faktycznie system (Spotify/YT) przejął kontrolę
    // lub jeśli wszystko ucichło.
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
    const { status, stationName, streamUrl } = req.body;
    
    // Blokujemy monitor na chwilę
    lastControlTime = Date.now();

    if (status === 'Playing') {
        mediaState = {
            source: "Radio",
            status: "Playing",
            title: stationName || "Radio Internetowe",
            artist: "Live Stream",
            streamUrl: streamUrl,
            cover: "style-css/img/radio.svg"
        };
        setServerRadio(true, stationName, "Live", streamUrl);
        
        // Pauzujemy Spotify w tle
        if (isWindows) executePythonControl('pause');

    } else {
        mediaState = { ...mediaState, status: "Stopped", source: "Radio" };
        setServerRadio(false, "", "", "");
    }

    getIO().emit('media_update', mediaState);
    res.json({ success: true, state: mediaState });
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

// --- POST: Sterowanie ---
router.post('/media/control', async (req: Request, res: Response) => {
    const { action, value } = req.body;
    
    try {
        lastControlTime = Date.now();

        // 1. Głośność
        if (action === 'set_volume') {
            await loudness.setVolume(parseInt(value));
            await loudness.setMuted(false);
        } else if (action === 'volume_up') {
            const v = await loudness.getVolume();
            await loudness.setVolume(Math.min(v + 5, 100));
        } else if (action === 'volume_down') {
            const v = await loudness.getVolume();
            await loudness.setVolume(Math.max(v - 5, 0));
        }
        
        // 2. Play Radio
        if (action === 'play_radio' && value) {
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
            
            if (isWindows) executePythonControl('pause');
        }
        
        // 3. System Control
        else if (isWindows && ['play', 'pause', 'playpause', 'next', 'prev'].includes(action)) {
             
             // Optymistyczna aktualizacja
             if (action === 'pause') mediaState.status = 'Paused';
             if (action === 'play') mediaState.status = 'Playing';
             if (action === 'playpause') {
                 mediaState.status = (mediaState.status === 'Playing') ? 'Paused' : 'Playing';
             }
             // Tu zmieniamy na System, bo użytkownik jawnie steruje systemem
             mediaState.source = 'System';

             getIO().emit('media_update', mediaState);
             executePythonControl(action);
        }

        res.json({ status: 'success' });
    } catch (e) {
        console.error("Control Error:", e);
        res.status(500).json({ error: 'Control Error' });
    }
});

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