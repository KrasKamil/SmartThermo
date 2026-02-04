import { Router, Request, Response } from 'express';
import * as loudness from 'loudness';
import { getIO } from '../helpers/socket';
import { isWindows, serverRadioState, setServerRadio, RADIO_STATIONS } from '../helpers/system';
import path from 'path';

const router = Router();

// PAMIĘĆ SERWERA
export let mediaState = {
    source: "System", 
    status: "Stopped",
    title: "",
    artist: "",
    streamUrl: "",
    cover: ""
};

let lastControlTime = 0; 
let radioStartTime = 0; 
const MONITOR_LOCK_TIME = 2000; 
const RADIO_SHIELD_TIME = 6000;

// --- GET: Listy Radiowe ---
// URL: /api/media/radio/list
router.get('/radio/list', (req, res) => {
    const frontendList = RADIO_STATIONS.map(s => ({
        id: s.id, title: s.title, subtitle: s.subtitle, streamUrl: s.streamUrl
    }));
    res.json(frontendList);
});

// --- GET: Aktualny Stan ---
// URL: /api/media/now-playing
router.get('/now-playing', (req, res) => {
    if (serverRadioState.isPlaying) {
        res.json({
            source: "Radio",
            status: "Playing",
            title: serverRadioState.name,
            artist: "Radio Internetowe",
            cover: "style-css/img/radio.svg",
            streamUrl: serverRadioState.url
        });
    } else {
        res.json(mediaState);
    }
});

// --- POST: Update z Pythona (Monitor) ---
// URL: /api/media/update-system
router.post('/update-system', (req: Request, res: Response) => {
    const data = req.body;
    const now = Date.now();

    // 1. User Lock
    if (now - lastControlTime < MONITOR_LOCK_TIME) {
        return res.json({ success: true, ignored: true });
    }

    // 2. Radio Protection
    if (serverRadioState.isPlaying) {
        if (now - radioStartTime < RADIO_SHIELD_TIME) {
            return res.json({ success: true, ignored: true });
        }
        
        const isSelfEcho = data.title && serverRadioState.name && 
                           (data.title.includes(serverRadioState.name) || 
                            data.artist.includes('Radio') || 
                            data.title.includes('SmartThermo'));

        if (isSelfEcho) return res.json({ success: true, ignored: true });

        // Jeśli wykryto Spotify -> STOP RADIO
        if (data.status === 'Playing' && (data.source === 'Spotify' || data.source === 'System')) {
            const sourceLower = (data.source || "").toLowerCase();
            if (!sourceLower.includes('chrome') && !sourceLower.includes('edge')) {
                 console.log(`🎵 Wykryto ${data.source} - zatrzymuję Radio.`);
                 setServerRadio(false, "", "", "");
            }
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

// --- POST: Sterowanie ---
// URL: /api/media/control
router.post('/control', async (req: Request, res: Response) => {
    const { action, value } = req.body;
    lastControlTime = Date.now(); 

    try {
        if (action === 'set_volume') await loudness.setVolume(parseInt(value));
        else if (action === 'volume_up') {
             const v = await loudness.getVolume();
             await loudness.setVolume(Math.min(v + 5, 100));
        } 
        else if (action === 'volume_down') {
             const v = await loudness.getVolume();
             await loudness.setVolume(Math.max(v - 5, 0));
        }
        
        // --- START RADIA ---
        else if (action === 'play_radio' && value) {
            if (isWindows) executePythonControl('pause_spotify'); 
            radioStartTime = Date.now(); 
            setServerRadio(true, value.title, "Live", value.url);
            
            const newState = {
                source: "Radio", status: "Playing",
                title: value.title, artist: "Radio Internetowe",
                streamUrl: value.url, cover: "style-css/img/radio.svg"
            };
            getIO().emit('media_update', newState);
        }

        // --- STOP RADIA ---
        else if (action === 'stop_radio') {
            setServerRadio(false, "", "", "");
            mediaState = { source: "System", status: "Stopped", title: "", artist: "", streamUrl: "", cover: "" };
            executePythonControl('pause'); 
            getIO().emit('media_update', mediaState);
        }
        
        // --- START SPOTIFY (Tylko Play w tle) ---
        else if (action === 'start_spotify') {
            // 1. Zabijamy Radio
            if (serverRadioState.isPlaying) setServerRadio(false, "", "", "");
            
            // 2. Wysyłamy komendę do Pythona: "Znajdź sesję i graj"
            executePythonControl('play_spotify');
            
            // 3. Aktualizujemy UI natychmiast
            mediaState = {
                source: "System", status: "Playing",
                title: "Spotify", artist: "Odtwarzanie...", 
                cover: "style-css/img/spotify.png", streamUrl: ""
            };
            getIO().emit('media_update', mediaState);
        }
        
        // --- PAUSE ---
        else if (action === 'pause') {
            if (serverRadioState.isPlaying) {
                setServerRadio(false, serverRadioState.name, "Paused", serverRadioState.url);
                getIO().emit('media_update', { source: "Radio", status: "Paused" });
            } else {
                executePythonControl('pause');
                mediaState.status = 'Paused';
                getIO().emit('media_update', mediaState);
            }
        }

        // --- PLAY/PAUSE TOGGLE ---
        else if (action === 'playpause' || action === 'play') {
            const isSystemPlaying = mediaState.status === 'Playing' && (mediaState.source === 'System' || mediaState.source === 'Spotify');
            
            if (isSystemPlaying) {
                executePythonControl('playpause');
                mediaState.status = 'Paused';
                getIO().emit('media_update', mediaState);
                return res.json({ status: 'success' });
            }

            if (serverRadioState.isPlaying) {
                setServerRadio(false, serverRadioState.name, "Paused", serverRadioState.url);
                getIO().emit('media_update', { source: "Radio", status: "Paused" });
            }
            else if (serverRadioState.url !== "" && action === 'playpause') {
                if (isWindows) executePythonControl('pause_spotify');
                radioStartTime = Date.now(); 
                setServerRadio(true, serverRadioState.name, "Live", serverRadioState.url);
                getIO().emit('media_update', { 
                    source: "Radio", status: "Playing", title: serverRadioState.name, streamUrl: serverRadioState.url, cover: "style-css/img/radio.svg" 
                });
            }
            else {
                if (serverRadioState.isPlaying) setServerRadio(false, "", "", "");
                executePythonControl(action === 'play' ? 'play' : 'playpause');
                
                mediaState.status = 'Playing';
                getIO().emit('media_update', mediaState);
            }
        }

        // --- NEXT / PREV ---
        else {
             if (serverRadioState.isPlaying) {
                 setServerRadio(false, "", "", "");
                 mediaState.source = 'System';
             }
             executePythonControl(action);
        }

        res.json({ status: 'success' });
    } catch (e) {
        res.status(500).json({ error: 'Control Error' });
    }
});

// ADRES: /api/media/volume
router.get('/volume', async (req, res) => {
    try { const v = await loudness.getVolume(); res.json({ volume: v }); } catch { res.json({ volume: 50 }); }
});

router.get('/config', (req, res) => res.json({ clockFormat: process.env.CLOCK_FORMAT || '12' }));

function executePythonControl(action: string) {
    const exec = require('child_process').exec;
    const cmd = `"${path.join(process.cwd(), 'env-media/Scripts/python.exe')}" "${path.join(process.cwd(), 'scripts/control_media.py')}" ${action}`;
    exec(cmd, { cwd: path.join(process.cwd(), 'scripts') }, () => {});
}

export default router;