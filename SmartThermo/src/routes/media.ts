// src/routes/media.ts
import { Router, Request, Response } from 'express';
import * as loudness from 'loudness';
import { getIO } from '../helpers/socket';
import { 
    isWindows, 
    serverRadioState, 
    setServerRadio, 
    RADIO_STATIONS,
    isRadioProtected
} from '../helpers/system';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';

const router = Router();

// ════════════════════════════════════════════════════════════════════════════
// STAN SERWERA (PAMIĘĆ TRWAŁA)
// ════════════════════════════════════════════════════════════════════════════
let mediaState = {
    source: "System", 
    status: "Stopped",
    title: "",
    artist: "",
    streamUrl: "",
    cover: ""
};

// ✅ BLOKADA MONITORA (TTL - Time To Live)
let lastControlTime = 0; 
const MONITOR_LOCK_TTL = 4000; // 4 sekundy blokady po akcji użytkownika

// ════════════════════════════════════════════════════════════════════════════
// ENDPOINT 1: LISTA STACJI RADIOWYCH
// ════════════════════════════════════════════════════════════════════════════
router.get('/radio/list', (req, res) => {
    const frontendList = RADIO_STATIONS.map(s => ({
        id: s.id, 
        title: s.title, 
        subtitle: s.subtitle, 
        streamUrl: s.streamUrl
    }));
    res.json(frontendList);
});

// ════════════════════════════════════════════════════════════════════════════
// ENDPOINT 2: AKTUALNY STAN ODTWARZACZA
// ════════════════════════════════════════════════════════════════════════════
router.get('/media/now-playing', (req, res) => {
    res.json(mediaState);
});

// ════════════════════════════════════════════════════════════════════════════
// ENDPOINT 3: UPDATE Z PYTHONA (MONITOR MEDIÓW) - NAPRAWIONY
// ════════════════════════════════════════════════════════════════════════════
router.post('/media/update-system', (req: Request, res: Response) => {
    const data = req.body;
    const now = Date.now();

    // ────────────────────────────────────────────────────────────────────────
    // BLOKADA 1: Interakcja użytkownika (ignoruj monitor przez 4s)
    // ────────────────────────────────────────────────────────────────────────
    if (now - lastControlTime < MONITOR_LOCK_TTL) {
        return res.json({ 
            success: true, 
            ignored: true, 
            reason: "User Interaction Lock (TTL)" 
        });
    }

    // ────────────────────────────────────────────────────────────────────────
    // BLOKADA 2: PRIORYTET RADIA (Tarcza Ochronna - 6 sekund)
    // ────────────────────────────────────────────────────────────────────────
    if (serverRadioState.isPlaying) {
        // ✅ NOWOŚĆ: Jeśli radio jest chronione (0-6s), ignoruj TYLKO Playing
        if (isRadioProtected() && data.status === 'Playing') {
            console.log("🛡️ [MEDIA] Radio Shield Active - ignoruję Playing (TTL: 6s)");
            return res.json({ 
                success: true, 
                ignored: true, 
                reason: "Radio Shield (Playing blocked for 6s)" 
            });
        }
        
        // ✅ PO UPŁYWIE OCHRONY: Jeśli coś zaczęło grać, wyłącz radio
        if (data.status === 'Playing') {
            console.log("🎵 [MEDIA] Zewnętrzne źródło przejęło kontrolę - wyłączam Radio");
            setServerRadio(false, "", "", "");
            // KONTYNUUJ przetwarzanie (nie return!)
        }
        // Jeśli system stoi (Paused/Stopped), a radio gra -> ignoruj
        else {
            return res.json({ 
                success: true, 
                ignored: true,
                reason: "Radio ma priorytet (system stoi)" 
            });
        }
    }

    // ────────────────────────────────────────────────────────────────────────
    // AKTUALIZACJA STANU (Spotify/Bluetooth/System)
    // ────────────────────────────────────────────────────────────────────────
    const previousState = JSON.stringify(mediaState);
    
    mediaState = {
        source: data.source || "System", 
        status: data.status || "Stopped",
        title: data.title || "",
        artist: data.artist || "",
        streamUrl: "",
        cover: data.cover || ""
    };
    
    // ✅ NOWOŚĆ: Loguj tylko ZMIANY stanu (nie spam co sekundę)
    if (JSON.stringify(mediaState) !== previousState) {
        console.log(`🎵 [MEDIA] Update: ${mediaState.source} | ${mediaState.status} | ${mediaState.title || 'Brak tytułu'}`);
        getIO().emit('media_update', mediaState);
    }
    
    res.json({ success: true });
});

// ════════════════════════════════════════════════════════════════════════════
// ENDPOINT 4: GŁOŚNOŚĆ (GET)
// ════════════════════════════════════════════════════════════════════════════
router.get('/media/volume', async (req, res) => {
    try {
        const vol = await loudness.getVolume();
        const muted = await loudness.getMuted();
        res.json({ volume: muted ? 0 : vol, muted: muted });
    } catch (e) { 
        console.error("❌ [VOLUME] Błąd odczytu:", e);
        res.json({ volume: 50 }); 
    }
});

// ════════════════════════════════════════════════════════════════════════════
// ENDPOINT 5: STEROWANIE MEDIAMI (POST)
// ════════════════════════════════════════════════════════════════════════════
router.post('/media/control', async (req: Request, res: Response) => {
    const { action, value } = req.body;
    
    // ✅ NOWOŚĆ: Aktualizujemy blokadę monitora (TTL)
    lastControlTime = Date.now();

    try {
        // ──────────────────────────────────────────────────────────────────
        // AKCJA: GŁOŚNOŚĆ
        // ──────────────────────────────────────────────────────────────────
        if (action === 'set_volume') {
            await loudness.setVolume(parseInt(value));
        } 
        else if (action === 'volume_up') {
            const v = await loudness.getVolume();
            await loudness.setVolume(Math.min(v + 5, 100));
        } 
        else if (action === 'volume_down') {
            const v = await loudness.getVolume();
            await loudness.setVolume(Math.max(v - 5, 0));
        }
        
        // ──────────────────────────────────────────────────────────────────
        // AKCJA: WŁĄCZ RADIO
        // ──────────────────────────────────────────────────────────────────
        else if (action === 'play_radio' && value) {
            // 1. Zatrzymaj systemowy player (Spotify/YouTube)
            if (isWindows) executePythonControl('pause');
            
            // 2. Ustaw stan radia (+ aktywuj TTL w system.ts)
            setServerRadio(true, value.title, "Live", value.url);
            
            // 3. Aktualizuj pamięć serwera
            mediaState = {
                source: "Radio", 
                status: "Playing",
                title: value.title, 
                artist: "Radio Internetowe",
                streamUrl: value.url, 
                cover: "style-css/img/radio.svg"
            };
            
            // 4. Wyślij do frontendu
            getIO().emit('media_update', mediaState);
            console.log(`📻 [MEDIA] Radio START: ${value.title}`);
        }
        
        // ──────────────────────────────────────────────────────────────────
        // AKCJA: PAUZA RADIA
        // ──────────────────────────────────────────────────────────────────
        else if (action === 'pause' && mediaState.source === 'Radio') {
            mediaState.status = 'Paused';
            setServerRadio(false, mediaState.title, "Paused", mediaState.streamUrl);
            getIO().emit('media_update', mediaState);
            console.log(`⏸️ [MEDIA] Radio PAUSED`);
        }

        // ──────────────────────────────────────────────────────────────────
        // AKCJA: SYSTEM (PLAY/PAUSE/NEXT)
        // ──────────────────────────────────────────────────────────────────
        else {
            // Jeśli grało Radio -> wychodzimy z trybu Radio
            if (mediaState.source === 'Radio') {
                setServerRadio(false, "", "", "");
                mediaState.source = 'System';
                console.log(`🔄 [MEDIA] Przełączam na System (z Radia)`);
            }
            
            // Wysyłamy komendę do Pythona (Windows)
            if (isWindows) executePythonControl(action);
        }

        res.json({ status: 'success' });
    } catch (e) {
        console.error("❌ [CONTROL] Błąd:", e);
        res.status(500).json({ error: 'Control Error' });
    }
});

// ════════════════════════════════════════════════════════════════════════════
// ENDPOINT 6: KONFIGURACJA (FORMAT ZEGARA)
// ════════════════════════════════════════════════════════════════════════════
router.get('/config', (req, res) => {
    res.json({ clockFormat: process.env.CLOCK_FORMAT || '12' });
});

// ════════════════════════════════════════════════════════════════════════════
// HELPER: PYTHON CONTROL (Windows)
// ════════════════════════════════════════════════════════════════════════════
function executePythonControl(action: string) {
    const venvPython = path.join(process.cwd(), 'env-media/Scripts/python.exe');
    const script = path.join(process.cwd(), 'scripts/control_media.py');
    
    if (!fs.existsSync(venvPython) || !fs.existsSync(script)) {
        console.warn("⚠️ [PYTHON] Brak skryptu lub VENV");
        return;
    }
    
    const cmd = `"${venvPython}" "${script}" ${action}`;
    exec(cmd, { cwd: path.join(process.cwd(), 'scripts') }, (err) => {
        if (err) console.error(`❌ [PYTHON] Error: ${err.message}`);
    });
}

export default router;