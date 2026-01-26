// src/routes/media.ts
import { Router, Request, Response } from 'express';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import * as loudness from 'loudness';
import { isWindows, getWindowsMedia, getLineInStatus } from '../helpers/system';

const router = Router();

// 👇 ZMIANA 1: Definiujemy folder ze skryptami
const SCRIPTS_DIR = path.join(process.cwd(), 'scripts');

// 👇 ZMIANA 2: Aktualizujemy ścieżki do plików wewnątrz folderu scripts
const NIRCMD_PATH = path.join(SCRIPTS_DIR, 'nircmd.exe');
const PYTHON_SCRIPT_PATH = path.join(SCRIPTS_DIR, 'get_media.py');
const CONTROL_MEDIA_SCRIPT = path.join(SCRIPTS_DIR, 'control_media.py');

// 👇 WAŻNE: Środowisko wirtualne (env-media) zostało w głównym folderze, więc tu bez zmian
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

// 1. Lista stacji radiowych
router.get('/radio/list', (req, res) => {
    const stations = [
        { id: "rmf", title: "RMF FM", subtitle: "Muzyka", streamUrl: "http://217.74.72.12:8000/rmf_fm" },
        { id: "rmfclassic", title: "RMF Classic", subtitle: "Filmowa", streamUrl: "http://217.74.72.12:8000/rmf_classic" },
        { id: "zet", title: "Radio ZET", subtitle: "Rozrywka", streamUrl: "http://zet-net-01.cdn.eurozet.pl:8400/listen.pls" },
        { id: "eskarock", title: "Eska Rock", subtitle: "Rock/Alt", streamUrl: "http://ic2.smcdn.pl:8000/2380-1.mp3" },
        { id: "vox", title: "VOX FM", subtitle: "Disco", streamUrl: "http://ic2.smcdn.pl:8000/3990-1.mp3" },
        { id: "tok", title: "TOK FM", subtitle: "News", streamUrl: "http://ic2.smcdn.pl:8000/2400-1.mp3" },
        { id: "antyradio", title: "Antyradio", subtitle: "Rock", streamUrl: "http://ant-kat.cdn.eurozet.pl:8604/listen.pls" }
    ];
    res.json(stations);
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

        if (isWindows) {
            switch (action) {
                // --- KATEGORIA 1: Odtwarzanie (Python WinSDK) ---
                case 'playpause':
                case 'play':
                case 'pause':
                case 'next':
                case 'prev':
                case 'stop':
                    runPythonControl(action);
                    break;

                // --- KATEGORIA 2: Głośność (NirCmd / Loudness) ---
                case 'set_volume':
                    if (value !== undefined) {
                        const vol = Math.floor((parseInt(value) / 100) * 65535);
                        runNirCmd(`setsysvolume ${vol}`);
                    }
                    break;
                
                case 'volume_up':
                    runNirCmd('changesysvolume 2000');
                    break;
                case 'volume_down':
                    runNirCmd('changesysvolume -2000');
                    break;
            }
        } else {
            // Linux (bez zmian)
            const runLinux = (cmd: string) => exec(cmd, () => {});
            if (action === 'playpause') runLinux('xdotool key XF86AudioPlay');
            if (action === 'next') runLinux('xdotool key XF86AudioNext');
            if (action === 'prev') runLinux('xdotool key XF86AudioPrev');
            if (action === 'set_volume' && value) runLinux(`amixer set Master ${value}%`);
        }

        res.json({ status: 'success' });

    } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ error: 'Error' });
    }
});

// 4. Now Playing
router.get('/media/now-playing', async (req: Request, res: Response) => {
    if (isWindows) {
        try {
            // 1. Pobierz statusy z obu źródeł
            const pyData = await getMediaFromPython();
            const lineDevice = await getLineInStatus(); 

            // 2. LOGIKA PRIORYTETÓW
            
            // A. Jeśli Windows GRA -> Windows ma priorytet
            if (pyData && pyData.found && pyData.status === 'Playing') {
                return res.json({
                    title: pyData.title,
                    artist: pyData.artist,
                    status: "Playing",
                    source: pyData.source || "System", 
                    cover: pyData.cover || ""          
                });
            }

            // B. Jeśli Windows NIE GRA, ale mamy BLUETOOTH
            if (lineDevice) {
                return res.json({
                    title: "Audio Bluetooth",
                    artist: lineDevice, 
                    status: "Playing",  
                    source: "Bluetooth",
                    type: "bluetooth"
                });
            }

            // C. Windows zapauzowany
            if (pyData && pyData.found) {
                 return res.json({
                    title: pyData.title,
                    artist: pyData.artist,
                    status: pyData.status, 
                    source: pyData.source || "System", 
                    cover: pyData.cover || ""          
                });
            }

            // D. Nic nie gra
            res.json({ title: "", artist: "", status: "Paused", source: "None" });

        } catch (error) {
            console.error(error);
            res.json({ title: "", artist: "", status: "Error", source: "None" });
        }
    } else {
        res.json({ title: "Linux Audio", artist: "Unknown", status: "Paused" });
    }
});

export default router;