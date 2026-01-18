// src/server.ts
import app from "./app";
import dotenv from "dotenv";
import { isWindows } from './helpers/system';

dotenv.config();

const PORT = process.env.PORT || 8888;

app.listen(PORT, () => {
    console.clear(); // Czyści konsolę przy restarcie (opcjonalne)
    console.log("===================================================");
    console.log(`🚀 SERWER URUCHOMIONY NA PORTCIE: ${PORT}`);
    console.log("===================================================");
    console.log(`💻 System: ${isWindows ? 'Windows 🪟' : 'Linux/Raspberry Pi 🍓'}`);
    console.log("");
    
    console.log("🔗 --- INTERFEJS ---");
    console.log(`   http://localhost:${PORT}/vapage.html`);
    console.log("");

    console.log("📡 --- ENDPOINTY (Kliknij, aby sprawdzić) ---");
    console.log(`   🌧️  Pogoda:      http://localhost:${PORT}/api/weather`);
    console.log(`   🎵  Co gra?:     http://localhost:${PORT}/api/media/now-playing`);
    console.log(`   📻  Radio Lista: http://localhost:${PORT}/api/radio/list`);
    console.log(`   🐛  Debug BT:    http://localhost:${PORT}/api/debug/devices`);
    console.log(`   🦷  Scan BT:     http://localhost:${PORT}/api/bluetooth/scan`);
    console.log("");
    console.log("===================================================");
    console.log("📝 Oczekiwanie na zapytania...");
});