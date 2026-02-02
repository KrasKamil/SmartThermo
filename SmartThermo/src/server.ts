// src/server.ts
import app from "./app";
import dotenv from "dotenv";
import http from "http";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";


import { isWindows } from './helpers/system';
import { connectDB } from './helpers/db';
import { initSocket } from './helpers/socket';


dotenv.config();

const PORT = process.env.PORT || 8888;

// Sprawdzamy, czy uruchomiono przez "npm run dev"
const isDevMode = __filename.endsWith('.ts') || process.env.npm_lifecycle_event === 'dev';

// --- FUNKCJA URUCHAMIAJĄCA PYTHONA ---
const startPythonLogger = () => {
    // 1. Ścieżka do skryptu loggera
    const scriptPath = path.join(__dirname, '../scripts/universal_logger.py');

    // 2. Ścieżka do folderu venv (zakładamy, że env-media jest w głównym folderze projektu)
    const venvPath = path.join(__dirname, '../env-media');

    // 3. Ustalamy ścieżkę do pliku wykonywalnego Python wewnątrz venv
    let pythonCmd = "";
    
    if (isWindows) {
        // Windows: env-media/Scripts/python.exe
        pythonCmd = path.join(venvPath, 'Scripts', 'python.exe');
    } else {
        // Linux/Raspberry Pi: env-media/bin/python
        pythonCmd = path.join(venvPath, 'bin', 'python');
    }

    // 4. Sprawdzenie czy VENV w ogóle istnieje (dla bezpieczeństwa)
    if (!fs.existsSync(pythonCmd)) {
        console.warn("⚠️  UWAGA: Nie znaleziono venv 'env-media'!");
        console.warn(`   Szukano tutaj: ${pythonCmd}`);
        console.warn("   Próbuję użyć domyślnego systemowego 'python'...");
        pythonCmd = isWindows ? 'python' : 'python3';
    }

    console.log(`🐍 Uruchamiam proces Python: ${pythonCmd}`);
    console.log(`   Skrypt: ${scriptPath}`);

    // 5. Uruchomienie procesu
    const pyProcess = spawn(pythonCmd, [scriptPath]);

    // 6. Przekierowanie logów
    pyProcess.stdout.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg) console.log(`[PY] ${msg}`);
    });

    pyProcess.stderr.on('data', (data) => {
        // Ignorujemy komunikaty o błędach, które nie są krytyczne (np. ostrzeżenia bibliotek)
        const msg = data.toString().trim();
        if (msg) console.error(`[PY ERR] ${msg}`);
    });

    pyProcess.on('close', (code) => {
        console.log(`🐍 Proces Python zakończył się z kodem: ${code}`);
    });

    // 7. Sprzątanie przy zamykaniu Node.js
    const killPython = () => {
        if (!pyProcess.killed) {
            console.log("💀 Zamykanie procesu Python...");
            pyProcess.kill();
        }
    };

    process.on('SIGINT', killPython);
    process.on('exit', killPython);
    process.on('SIGTERM', killPython);
};


const startMediaMonitor = () => {
    const scriptPath = path.join(__dirname, '../scripts/media_monitor.py');
    const venvPath = path.join(__dirname, '../env-media');
    
    // Szukamy Pythona w VENV
    let pythonCmd = isWindows 
        ? path.join(venvPath, 'Scripts', 'python.exe')
        : path.join(venvPath, 'bin', 'python');

    if (!fs.existsSync(pythonCmd)) {
        pythonCmd = isWindows ? 'python' : 'python3';
    }

    console.log(`🎵 Uruchamiam Monitor Mediów: ${pythonCmd}`);
    
    const pyProcess = spawn(pythonCmd, ['-u', scriptPath]);

    pyProcess.stdout.on('data', (data) => {
        const msg = data.toString().trim();
        // Filtrujemy logi, żeby nie śmiecić, pokazujemy tylko zmiany
        if (msg && msg.startsWith('🎵')) console.log(`[MEDIA] ${msg}`);
        // DEBUG BLUETOOTH
        //if (msg) console.log(`[MEDIA RAW] ${msg}`);
    });

    pyProcess.stderr.on('data', (data) => {
        // console.error(`[MEDIA ERR] ${data}`); // Opcjonalnie odkomentuj do debugowania
    });

    // Zabij proces przy wyjściu
    const killMedia = () => { if (!pyProcess.killed) pyProcess.kill(); };
    process.on('SIGINT', killMedia);
    process.on('exit', killMedia);
};

// --- START SERWERA ---
const startServer = async () => {
    try {
        // A. Połącz z bazą
        await connectDB();
        
        // B. Utwórz serwer HTTP
        const httpServer = http.createServer(app);
        
        // C. Zainicjuj Socket.io
        initSocket(httpServer);

        // D. Uruchom Pythona w tle 🚀
        startPythonLogger();
        startMediaMonitor();

        // E. Nasłuchiwanie
        httpServer.listen(PORT, () => {
            console.clear();
            console.log("===================================================");
            console.log(`🚀 SERWER URUCHOMIONY NA PORTCIE: ${PORT}`);
            console.log("===================================================");
            console.log(`💻 System: ${isWindows ? 'Windows 🪟' : 'Linux/Raspberry Pi 🍓'}`);
            console.log("📡 Socket.io: AKTYWNE");
            console.log("🐍 Python Logger: URUCHOMIONY W TLE");
            console.log("");
            console.log(`   🏠 Home:     http://localhost:${PORT}/`);
            console.log("");
        });
    } catch (error) {
        console.error("❌ Błąd krytyczny startu serwera:", error);
    }
};

startServer();