// src/server.ts
import app from "./app";
import dotenv from "dotenv";
import { isWindows } from './helpers/system';

dotenv.config();

const PORT = process.env.PORT || 8888;

// Sprawdzamy, czy uruchomiono przez "npm run dev"
const isDevMode = __filename.endsWith('.ts') || process.env.npm_lifecycle_event === 'dev';

app.listen(PORT, () => {
    console.clear(); // Opcjonalne
    console.log("===================================================");
    console.log(`🚀 SERWER URUCHOMIONY NA PORTCIE: ${PORT}`);
    console.log("===================================================");
    console.log(`💻 System: ${isWindows ? 'Windows 🪟' : 'Linux/Raspberry Pi 🍓'}`);
    console.log(`🔧 Tryb:   ${isDevMode ? '\x1b[33mDEVELOPMENT (Pełne logi)\x1b[0m 🛠️' : '\x1b[32mPRODUCTION (Czysty start)\x1b[0m 🚀'}`);
    console.log("");
    
    console.log("🔗 --- INTERFEJS ---");
    console.log(`   🏠 Home:     http://localhost:${PORT}/`);
    console.log("");

    if (isDevMode) {
        // 👇 Twoja zaktualizowana lista endpointów
        console.log("📡 --- ENDPOINTY (Tylko w trybie DEV) ---");
        console.log(`   🌧️  Pogoda:      http://localhost:${PORT}/api/weather`);
        console.log(`   🎵  Co gra?:     http://localhost:${PORT}/api/media/now-playing`);
        console.log(`   📻  Radio Lista: http://localhost:${PORT}/api/radio/list`);
        console.log(`   🐛  Debug BT:    http://localhost:${PORT}/api/debug/devices`);
        console.log(`   🦷  Scan BT:     http://localhost:${PORT}/api/bluetooth/scan`);
        console.log(`   ⚙️  Config:      http://localhost:${PORT}/api/config`);
        console.log(`   📝  Notatki:     http://localhost:${PORT}/api/notes`);
        console.log(`   🔊  Głośność:    http://localhost:${PORT}/api/media/volume`);
        console.log("");
    } else {
        console.log("🙈 Szczegóły API ukryte. Miłego korzystania!");
        console.log("");
    }

    console.log("===================================================");
    console.log("📝 Oczekiwanie na zapytania...");
});