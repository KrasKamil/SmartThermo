import app from "./app";
import dotenv from "dotenv";
import http from "http";
import path from "path";
import { spawn } from "child_process";

import { isWindows } from './helpers/system';
import { connectDB } from './helpers/db';
import { initSocket } from './helpers/socket';
import { initTelegramBot } from './services/telegramService';

dotenv.config();

const PORT = process.env.PORT || 8888;

// 1. WYKRYWANIE TRYBU (DEV vs PROD)
// Sprawdza czy plik ma rozszerzenie .ts (ts-node) lub czy skrypt to 'dev'
const isDevMode = __filename.endsWith('.ts') || process.env.npm_lifecycle_event === 'dev';

// --- A. LOGGER (Python) ---
const startPythonLogger = () => {
    const scriptPath = path.join(__dirname, '../scripts/universal_logger.py');
    const venvPath = path.join(__dirname, '../env-media');
    
    let pythonCmd = "python";
    if (isWindows) pythonCmd = path.join(venvPath, 'Scripts', 'python.exe');

    console.log(`🐍 [LOGGER] Start procesu tła...`);
    const pyProcess = spawn(pythonCmd, [scriptPath]);
    
    // Logowanie błędów loggera
    pyProcess.stderr.on('data', (data) => console.error(`[LOG ERR] ${data}`));
    
    // Zabijanie przy wyjściu
    const kill = () => !pyProcess.killed && pyProcess.kill();
    process.on('SIGINT', kill);
    process.on('exit', kill);
};

// --- B. MONITOR MEDIÓW (Python) ---
const startMediaMonitor = () => {
    const scriptPath = path.join(__dirname, '../scripts/media_monitor.py');
    const venvPath = path.join(__dirname, '../env-media');
    
    let pythonCmd = "python";
    if (isWindows) pythonCmd = path.join(venvPath, 'Scripts', 'python.exe');

    console.log(`🎵 [MONITOR] Start procesu tła...`);
    const pyProcess = spawn(pythonCmd, [scriptPath]);

    // Logowanie błędów monitora
    pyProcess.stderr.on('data', (data) => console.error(`[MEDIA ERR] ${data}`));

    // Zabijanie przy wyjściu
    const kill = () => !pyProcess.killed && pyProcess.kill();
    process.on('SIGINT', kill);
    process.on('exit', kill);
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
            //startPythonLogger();
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

        httpServer.listen(PORT, () => {
            console.log("===================================================");
            console.log(`🚀 SERWER HTTP: http://localhost:${PORT}`);
            console.log(`💻 System:      ${isWindows ? 'Windows 🪟' : 'Linux/Raspberry Pi 🍓'}`);
            console.log(`📡 Socket.io:   AKTYWNE`);
            console.log(`🤖 Telegram:    AKTYWNY`);
            console.log("===================================================");
        });

    } catch (error) {
        console.error("❌ Krytyczny błąd startu:", error);
    }
};

startServer();