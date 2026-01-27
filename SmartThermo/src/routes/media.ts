// src/routes/media.ts
import { Router, Request, Response } from 'express';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import * as loudness from 'loudness';
import { 
    isWindows, 
    getLineInStatus, 
    RADIO_STATIONS, 
    serverRadioState, 
    setServerRadio 
} from '../helpers/system';

const router = Router();
const SCRIPTS_DIR = path.join(process.cwd(), 'scripts');


const NIRCMD_PATH = path.join(SCRIPTS_DIR, 'nircmd.exe');
const PYTHON_SCRIPT_PATH = path.join(SCRIPTS_DIR, 'get_media.py');
const CONTROL_MEDIA_SCRIPT = path.join(SCRIPTS_DIR, 'control_media.py');


const VENV_PYTHON_PATH = path.join(process.cwd(), 'env-media', 'Scripts', 'python.exe');


// Funkcja wykonująca polecenie nircmd
const runNirCmd = (args: string) => {
    if (!fs.existsSync(NIRCMD_PATH)) {
        console.error(`❌ BŁĄD: Nie znaleziono pliku: ${NIRCMD_PATH}`);
        return;
    }

    // Dodajemy cwd: SCRIPTS_DIR, choć dla nircmd to mniej istotne, to dobra praktyka
    exec(`"${NIRCMD_PATH}" ${args}`, { cwd: SCRIPTS_DIR }, (error) => {
        if (error) console.error(`Błąd NirCmd (${args}):`, error.message);
    });
};

// Funkcja uruchamiająca Pythona do sterowania (Play/Pause/Next)
const runPythonControl = (action: string) => {
    if (!fs.existsSync(VENV_PYTHON_PATH) || !fs.existsSync(CONTROL_MEDIA_SCRIPT)) {
        console.error("❌ Brak środowiska Python lub skryptu control_media.py");
        return;
    }
    
    // 👇 ZMIANA 3: Dodajemy { cwd: SCRIPTS_DIR }
    // Dzięki temu Python widzi "universal_logger.py" leżący obok
    exec(
        `"${VENV_PYTHON_PATH}" "${CONTROL_MEDIA_SCRIPT}" ${action}`, 
        { cwd: SCRIPTS_DIR }, 
        (error, stdout, stderr) => {
            if (error) console.error(`Błąd sterowania (${action}):`, stderr);
            else console.log(`🐍 Python Control: ${action} - OK`);
        }
    );
};

const getMediaFromPython = (): Promise<any> => {
    return new Promise((resolve) => {
        
        if (!fs.existsSync(VENV_PYTHON_PATH)) {
            console.error(`❌ BŁĄD: Nie znaleziono Pythona w venv: ${VENV_PYTHON_PATH}`);
            resolve(null);
            return;
        }

        // 👇 ZMIANA 4: Dodajemy cwd oraz maxBuffer
        exec(
            `"${VENV_PYTHON_PATH}" "${PYTHON_SCRIPT_PATH}"`, 
            { 
                cwd: SCRIPTS_DIR,           // <-- Kluczowe dla importów w Pythonie
                maxBuffer: 1024 * 1024 * 5  // 5MB bufora na okładki
            }, 
            (error, stdout, stderr) => {
                if (error) {
                    console.error("Błąd skryptu Python:", error.message);
                    if (stderr) console.error("Python stderr:", stderr);
                    resolve(null);
                    return;
                }
                try {
                    const data = JSON.parse(stdout.trim());
                    resolve(data);
                } catch (e) {
                    console.error("Błąd parsowania JSON:", e);
                    resolve(null);
                }
            }
        );
    });
};


// --- ENDPOINTY ---

// Teraz endpoint API bierze dane z tej samej listy co Telegram!
router.get('/radio/list', (req, res) => {
    // Frontend potrzebuje streamUrl jako directUrl do odtwarzania w <audio>
    // Mapujemy dane, żeby pasowały do starego formatu frontendu
    const frontendList = RADIO_STATIONS.map(s => ({
        id: s.id,
        title: s.title,
        subtitle: s.subtitle,
        streamUrl: s.directUrl // Frontend woli bezpośrednie linki mp3/aac
    }));
    res.json(frontendList);
});

// 2. Config
router.get('/config', (req, res) => {
    res.json({ clockFormat: process.env.CLOCK_FORMAT || '12' });
});

// Służy do pobierania aktualnego stanu głośności z systemu dzięki bibliotece loudness
router.get('/media/volume', async (req: Request, res: Response) => {
    try {
        const vol = await loudness.getVolume();
        const muted = await loudness.getMuted();
        
        res.json({ 
            volume: muted ? 0 : vol,
            muted: muted
        });
    } catch (error) {
        console.error("Błąd odczytu głośności:", error);
        res.json({ volume: 50 });
    }
});

router.post('/media/control', async (req: Request, res: Response) => {
    try {
        const { action, value } = req.body;
        console.log(`🎛️ Action: ${action}`);

        if (action === 'pause' || action === 'stop') {
            setServerRadio(false, "", "");
        }

        if (isWindows) {
            switch (action) {
                case 'playpause':
                case 'play':
                case 'pause':
                case 'next':
                case 'prev':
                case 'stop': runPythonControl(action); break;
                case 'set_volume': 
                    if (value !== undefined) {
                        const vol = Math.floor((parseInt(value) / 100) * 65535);
                        runNirCmd(`setsysvolume ${vol}`);
                    }
                    break;
                case 'volume_up': runNirCmd('changesysvolume 2000'); break;
                case 'volume_down': runNirCmd('changesysvolume -2000'); break;
            }
        } 
        res.json({ status: 'success' });
    } catch { res.status(500).json({ error: 'Error' }); }
});

// 4. Now Playing
router.get('/media/now-playing', async (req: Request, res: Response) => {
    // 1. Radio wymuszone (Telegram)
    if (serverRadioState.isPlaying) {
        return res.json({
            title: serverRadioState.name,
            artist: serverRadioState.description,
            status: "Playing",
            source: "Radio (Telegram)", 
            cover: "style-css/img/radio.svg"
        });
    }

    // 2. Windows / BT
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