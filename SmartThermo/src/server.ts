import app from "./app";
import dotenv from "dotenv";
import fs from "fs";
import http from "http";
import path from "path";
import { spawn } from "child_process";

import { isWindows } from './helpers/system';
import { connectDB } from './helpers/db';
import { initSocket } from './helpers/socket';
import { initTelegramBot } from './services/telegramService';

dotenv.config();

const PORT = process.env.PORT || 8888;
const IS_DOCKER = !isWindows && fs.existsSync('/.dockerenv');

// 1. WYKRYWANIE TRYBU (DEV vs PROD)
// Sprawdza czy plik ma rozszerzenie .ts (ts-node) lub czy skrypt to 'dev'
const isDevMode = __filename.endsWith('.ts') || process.env.npm_lifecycle_event === 'dev';

// Wybór właściwego interpretera Pythona dla danego środowiska
const getPythonCommand = (): string => {
    if (isWindows) {
        const winVenvPython = path.join(__dirname, '../env-media/Scripts/python.exe');
        return fs.existsSync(winVenvPython) ? winVenvPython : 'python';
    }
    // W kontenerze Docker korzystamy z /opt/venv/bin/python, na hoście Linux z python3
    if (fs.existsSync('/opt/venv/bin/python')) {
        return '/opt/venv/bin/python';
    }
    return 'python3';
};

// Bezpieczne uruchamianie skryptów Pythona w tle (nie wywala serwera przy braku Pythona/pliku)
const spawnPythonScript = (label: string, scriptName: string) => {
    const scriptPath = path.join(__dirname, '../scripts', scriptName);

    if (!fs.existsSync(scriptPath)) {
        console.warn(`⚠️ [${label}] Pomijam — nie znaleziono pliku: ${scriptPath}`);
        return;
    }

    const pythonCmd = getPythonCommand();
    console.log(`${label} Start procesu tła (${pythonCmd} ${scriptName})...`);

    const pyProcess = spawn(pythonCmd, [scriptPath]);

    pyProcess.on('error', (err) => {
        console.error(`⚠️ [${label}] Nie udało się uruchomić procesu (${pythonCmd}):`, err.message);
    });

    pyProcess.stderr.on('data', (data) => {
        console.error(`[${label} ERR] ${data}`);
    });

    pyProcess.on('exit', (code) => {
        if (code !== 0 && code !== null) {
            console.warn(`⚠️ [${label}] Proces zakończył pracę z kodem: ${code}`);
        }
    });

    const kill = () => {
        if (!pyProcess.killed) pyProcess.kill();
    };
    process.on('SIGINT', kill);
    process.on('SIGTERM', kill);
    process.on('exit', kill);
};

// --- A. LOGGER (Python) ---
const startPythonLogger = () => {
    spawnPythonScript('🐍 [LOGGER]', 'universal_logger.py');
};

// --- B. MONITOR MEDIÓW (Python) ---
const startMediaMonitor = () => {
    if (IS_DOCKER) {
        console.log('🐳 [MONITOR] Wykryto kontener Docker — pomijam lokalny monitor mediów pulpitu.');
        return;
    }
    spawnPythonScript('🎵 [MONITOR]', 'media_monitor.py');
};

// --- START SERWERA ---
const startServer = async () => {
    try {
        await connectDB();
        const httpServer = http.createServer(app);
        initSocket(httpServer);

        // 1. Telegram działa zawsze (jest bezpieczny przy restartach)
        initTelegramBot();

        if (isDevMode) {
            // startPythonLogger();
            startMediaMonitor();
            // --- TRYB DEVELOPERSKI ---
            console.log("");
            console.log("🟡 URUCHOMIONO W TRYBIE DEV");
            console.log("🚫 Skrypty Python (Logger, Monitor) są WYŁĄCZONE z automatu.");
            console.log("👉 Aby je testować, uruchom w osobnych terminalach:");
            console.log(`   python scripts/media_monitor.py`);
            console.log(`   python scripts/universal_logger.py`);
            console.log("");
        } else {
            // --- TRYB PRODUKCYJNY ---
            console.log("");
            console.log("🟢 URUCHOMIONO W TRYBIE PROD");
            console.log("🚀 Uruchamiam automatycznie procesy tła (Python)...");
            startPythonLogger();
            startMediaMonitor();
        }

        const systemLabel = isWindows
            ? 'Windows 🪟'
            : IS_DOCKER
                ? 'Docker (Linux) 🐳'
                : 'Linux/Raspberry Pi 🍓';

        httpServer.listen(PORT, () => {
            console.log("===================================================");
            console.log(`🚀 SERWER HTTP: http://localhost:${PORT}`);
            console.log(`💻 System:      ${systemLabel}`);
            console.log(`📡 Socket.io:   AKTYWNE`);
            console.log(`🤖 Telegram:    AKTYWNY`);
            console.log("===================================================");
        });
    } catch (error) {
        console.error("❌ Krytyczny błąd startu:", error);
    }
};

startServer();