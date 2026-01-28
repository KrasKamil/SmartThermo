// src/routes/media.ts
import { Router, Request, Response } from 'express';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import * as loudness from 'loudness';
import { 
    isWindows, 
    serverRadioState,
    setServerRadio,
    RADIO_STATIONS,   
    getLineInStatus
} from '../helpers/system';

const router = Router();
const SCRIPTS_DIR = path.join(process.cwd(), 'scripts');
const VENV_PYTHON_PATH = path.join(process.cwd(), 'env-media', 'Scripts', 'python.exe');
const PYTHON_SCRIPT_PATH = path.join(SCRIPTS_DIR, 'get_media.py');
const CONTROL_MEDIA_SCRIPT = path.join(SCRIPTS_DIR, 'control_media.py');
const NIRCMD_PATH = path.join(SCRIPTS_DIR, 'nircmd.exe');

const runNirCmd = (args: string) => {
    if (!fs.existsSync(NIRCMD_PATH)) return;
    exec(`"${NIRCMD_PATH}" ${args}`, { cwd: SCRIPTS_DIR }, () => {});
};

const runPythonControl = (action: string) => {
    if (!fs.existsSync(VENV_PYTHON_PATH) || !fs.existsSync(CONTROL_MEDIA_SCRIPT)) return;
    exec(`"${VENV_PYTHON_PATH}" "${CONTROL_MEDIA_SCRIPT}" ${action}`, { cwd: SCRIPTS_DIR }, () => {});
};

const getMediaFromPython = (): Promise<any> => {
    return new Promise((resolve) => {
        if (!fs.existsSync(VENV_PYTHON_PATH)) return resolve(null);
        exec(`"${VENV_PYTHON_PATH}" "${PYTHON_SCRIPT_PATH}"`, 
            { cwd: SCRIPTS_DIR, maxBuffer: 1024 * 1024 * 5 }, 
            (error, stdout) => {
                if (error) return resolve(null);
                try { resolve(JSON.parse(stdout.trim())); } catch { resolve(null); }
            }
        );
    });
};

// --- ENDPOINTY ---

router.get('/radio/list', (req, res) => {
    const frontendList = RADIO_STATIONS.map(s => ({
        id: s.id, title: s.title, subtitle: s.subtitle, streamUrl: s.streamUrl
    }));
    res.json(frontendList);
});

router.get('/config', (req, res) => {
    res.json({ clockFormat: process.env.CLOCK_FORMAT || '12' });
});

router.get('/media/volume', async (req: Request, res: Response) => {
    try {
        const vol = await loudness.getVolume();
        const muted = await loudness.getMuted();
        res.json({ volume: muted ? 0 : vol, muted: muted });
    } catch { res.json({ volume: 50 }); }
});

router.post('/media/control', async (req: Request, res: Response) => {
    try {
        const { action, value } = req.body;
        console.log(`[DEBUG] Akcja: ${action}`);

        // 1. WŁĄCZENIE RADIA (Priorytet)
        if (action === 'play_radio' && value) {
            console.log("📻 Start Radia -> Wyciszam Spotify");
            // Pauzujemy system raz, żeby nie grały na raz
            if (isWindows) runPythonControl('pause');
            setServerRadio(true, value.title, "Web Player", value.url);
            return res.json({ status: 'success' });
        }

        // 2. STOP (Globalny Wyłącznik - zgodnie z Twoim życzeniem)
        if (action === 'stop') {
            console.log("🛑 Global STOP -> Radio OFF + System STOP");
            setServerRadio(false, "", "", ""); // Czyścimy Radio
            if (isWindows) runPythonControl('stop'); // Czyścimy Spotify
            return res.json({ status: 'success' });
        }

        // 3. SPRAWDZAMY KTO RZĄDZI: RADIO CZY SYSTEM?
        // Radio rządzi, jeśli gra LUB jeśli jest załadowane (ma URL)
        const isRadioMode = serverRadioState.isPlaying || (serverRadioState.url !== "");

        if (isRadioMode) {
            // === TRYB RADIA ===
            console.log("Tryb Radia: Ignoruję Pythona dla Play/Pause");
            
            if (action === 'pause' || action === 'playpause') {
                // Tylko pauza stanu serwera, zachowujemy URL
                setServerRadio(false, serverRadioState.name, serverRadioState.description, serverRadioState.url);
            } 
            else if (action === 'play') {
                setServerRadio(true, serverRadioState.name, serverRadioState.description, serverRadioState.url);
            }
            // Głośność działa zawsze
            handleVolume(action, value);

        } else {
            // === TRYB SYSTEMOWY (Spotify) ===
            console.log("Tryb System: Wysyłam do Pythona");
            
            if (isWindows) {
                switch (action) {
                    case 'playpause': case 'play': case 'pause': case 'next': case 'prev': 
                        runPythonControl(action); 
                        break;
                    default:
                        handleVolume(action, value);
                }
            }
        }

        res.json({ status: 'success' });
    } catch (e: any) { 
        res.status(500).json({ error: 'Error' }); 
    }
});

function handleVolume(action: string, value: any) {
    if (!isWindows) return;
    if (action === 'set_volume' && value !== undefined) {
        const vol = Math.floor((parseInt(value) / 100) * 65535);
        runNirCmd(`setsysvolume ${vol}`);
    } else if (action === 'volume_up') runNirCmd('changesysvolume 2000');
    else if (action === 'volume_down') runNirCmd('changesysvolume -2000');
}

router.get('/media/now-playing', async (req: Request, res: Response) => {
    // 1. DEBUG STANU SERWERA
    // console.log(`[DEBUG] Stan Radia: isPlaying=${serverRadioState.isPlaying}, URL=${serverRadioState.url}`);

    if (serverRadioState.isPlaying) {
        return res.json({
            title: serverRadioState.name,
            artist: serverRadioState.description,
            status: "Playing",
            source: "Radio",
            cover: "style-css/img/radio.svg",
            streamUrl: serverRadioState.url
        });
    }

    if (isWindows) {
        try {
            const pyData = await getMediaFromPython();
            const lineDevice = await getLineInStatus(); 

            if (pyData && pyData.found && pyData.status === 'Playing') {
                return res.json({
                    title: pyData.title,
                    artist: pyData.artist,
                    status: "Playing",
                    source: pyData.source || "System", 
                    cover: pyData.cover || ""          
                });
            }
            if (lineDevice) {
                return res.json({
                    title: "Audio Bluetooth",
                    artist: lineDevice, 
                    status: "Playing",  
                    source: "Bluetooth",
                    type: "bluetooth"
                });
            }
            if (pyData && pyData.found) {
                 return res.json({
                    title: pyData.title,
                    artist: pyData.artist,
                    status: pyData.status, 
                    source: pyData.source || "System", 
                    cover: pyData.cover || ""          
                });
            }
            res.json({ title: "", artist: "", status: "Paused", source: "None" });
        } catch {
            res.json({ title: "", artist: "", status: "Error", source: "None" });
        }
    } else {
        res.json({ title: "Linux Audio", artist: "Unknown", status: "Paused" });
    }
});

export default router;