// src/routes/media.ts
import { Router, Request, Response } from 'express';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import * as loudness from 'loudness';
import { isWindows, getWindowsMedia, getLineInStatus } from '../helpers/system';

const router = Router();

// Ścieżka do nircmd.exe w głównym folderze projektu
// process.cwd() zwraca folder, w którym uruchamiasz serwer
const NIRCMD_PATH = path.join(process.cwd(), 'nircmd.exe');
const VENV_PYTHON_PATH = path.join(process.cwd(), 'env-media', 'Scripts', 'python.exe');
const PYTHON_SCRIPT_PATH = path.join(process.cwd(), 'get_media.py');



// Funkcja wykonująca polecenie nircmd
const runNirCmd = (args: string) => {
    // Sprawdzamy czy plik istnieje, żeby nie sypać błędami w konsoli
    if (!fs.existsSync(NIRCMD_PATH)) {
        console.error(`❌ BŁĄD: Nie znaleziono pliku: ${NIRCMD_PATH}`);
        console.error("   Upewnij się, że nircmd.exe jest w folderze obok package.json!");
        return;
    }

    // Uruchamiamy nircmd z odpowiednimi argumentami
    exec(`"${NIRCMD_PATH}" ${args}`, (error) => {
        if (error) console.error(`Błąd NirCmd (${args}):`, error.message);
    });
};

const getMediaFromPython = (): Promise<any> => {
    return new Promise((resolve) => {
        
        if (!fs.existsSync(VENV_PYTHON_PATH)) {
            console.error(`❌ BŁĄD: Nie znaleziono Pythona w venv: ${VENV_PYTHON_PATH}`);
            resolve(null);
            return;
        }

        // --- ZMIANA TUTAJ: Dodajemy opcję { maxBuffer: 5 * 1024 * 1024 } (5MB) ---
        exec(
            `"${VENV_PYTHON_PATH}" "${PYTHON_SCRIPT_PATH}"`, 
            { maxBuffer: 1024 * 1024 * 5 }, // Zwiększamy limit bufora dla exec
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
        // Pobierz aktualną głośność (0-100)
        const vol = await loudness.getVolume();
        // Pobierz status wyciszenia (true/false)
        const muted = await loudness.getMuted();
        
        // Zwracamy 0 jeśli jest wyciszony systemowo, w przeciwnym razie aktualną wartość
        res.json({ 
            volume: muted ? 0 : vol,
            muted: muted
        });
    } catch (error) {
        console.error("Błąd odczytu głośności:", error);
        res.json({ volume: 50 }); // Fallback w razie błędu
    }
});

// 3. STEROWANIE (NIRCMD) - TU DZIEJE SIĘ MAGIA
router.post('/media/control', async (req: Request, res: Response) => {
    const { action, value } = req.body;
    
    if (!isWindows) return res.json({ status: "ignored_not_windows" });

    console.log(`🎛️ Akcja: ${action}`);

    switch (action) {
        // --- GŁOŚNOŚĆ ---
        // Skala NirCmd to 0 - 65535.
        // Zmiana o 4000 to ok. 6% paska głośności Windowsa
        case 'vol_up':
            runNirCmd('changesysvolume 2000');
            break;
        case 'vol_down':
            runNirCmd('changesysvolume -2000');
            break;
        case 'mute':
            // '2' oznacza przełączanie (toggle) wyciszenia
            runNirCmd('mutesysvolume 2');
            break;

        // --- MEDIA (Play/Pause/Next/Prev) ---
        // Używamy kodów wirtualnych klawiszy:
        // 0xB3 = Play/Pause, 0xB0 = Next, 0xB1 = Prev
        case 'playpause': 
        case 'pause':
            runNirCmd('sendkeypress 0xB3'); 
            break;
        case 'next':      
            runNirCmd('sendkeypress 0xB0'); 
            break;
        case 'prev':      
            runNirCmd('sendkeypress 0xB1'); 
            break;
        case 'stop':      
            runNirCmd('sendkeypress 0xB2'); 
            break;
            
        case 'set_volume':
        if (typeof value === 'number') {
            // Konwersja 0-100 na skalę nircmd (0-65535)
            const nircmdVal = Math.floor(value * 655.35);
            runNirCmd(`setsysvolume ${nircmdVal}`);
        }
        break;
        
        default:
            console.warn("Nieznana akcja:", action);
            return res.json({ status: "unknown" });
    }

    res.json({ status: "success", action });
});

// 4. Now Playing
router.get('/media/now-playing', async (req: Request, res: Response) => {
    if (isWindows) {
        try {
            // A. POBIERAMY DANE Z PYTHONA
            const pyData = await getMediaFromPython();

            // Jeśli Python zwrócił dane o grającej muzyce
            if (pyData && pyData.found && pyData.title) {
                return res.json({
                    title: pyData.title,
                    artist: pyData.artist,
                    status: pyData.status,
                    // ZMIANA: Przekazujemy źródło z Pythona (np. "Spotify.exe"), a jak brak to "System"
                    source: pyData.source || "System", 
                    // ZMIANA: Przekazujemy okładkę z Pythona (Base64)
                    cover: pyData.cover || ""          
                });
            }

            // B. Jeśli system Windows nic nie zwrócił, sprawdź wejście liniowe (Bluetooth)
            // (Zachowujemy Twoją starą logikę jako fallback)
            const lineDevice = await getLineInStatus();
            if (lineDevice) {
                return res.json({
                    title: "Audio Bluetooth",
                    artist: lineDevice,
                    status: "Playing",
                    source: "Bluetooth"
                });
            }

            // C. Nic nie gra
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