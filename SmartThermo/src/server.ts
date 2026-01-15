import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import axios from 'axios';
import querystring from 'querystring';
import { MongoClient } from 'mongodb'; 
import { exec } from 'child_process';
import os from 'os';

// Ładowanie zmiennych środowiskowych
dotenv.config();

// Sprawdzamy system
const isWindows = os.platform() === 'win32';

const app = express();
const PORT = process.env.PORT || 8888;
const MONGO_URL = process.env.MONGO_URL || ""; 

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI;

// Middleware
app.use(cors());
app.use(express.json()); 
app.use(express.static(path.join(__dirname, '../')));


// --- FUNKCJE POMOCNICZE (SYSTEMOWE) ---

// 1. Uniwersalny wykonawca komend
const runCommand = (command: string): Promise<string> => {
    return new Promise((resolve) => {
        // Używamy kodowania utf8 i ignorujemy błędy, żeby nie wywalać serwera
        exec(command, { encoding: 'utf8' }, (error, stdout, stderr) => {
            if (error) {
                // console.warn(`Cmd Warning: ${stderr || error.message}`); 
                resolve(""); 
            } else {
                resolve(stdout.trim());
            }
        });
    });
};

// 2. Pobieranie "Co teraz gra?" z Windowsa (PowerShell)
// To działa bez instalowania dodatkowych bibliotek!
const getWindowsMedia = async () => {
    const psScript = `
    $ErrorActionPreference = 'SilentlyContinue';
    [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media,ContentType=WindowsRuntime] | Out-Null;
    $g = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync().GetAwaiter().GetResult();
    $s = $g.GetCurrentSession();
    if($s){
        $m = $s.TryGetMediaPropertiesAsync().GetAwaiter().GetResult();
        $stat = $s.GetPlaybackInfo().PlaybackStatus.ToString();
        @{Title=$m.Title; Artist=$m.Artist; Status=$stat} | ConvertTo-Json -Compress
    } else {
        @{Status="Stopped"} | ConvertTo-Json -Compress
    }
    `;
    
    // Trick na polskie znaki w konsoli Windows (chcp 65001)
    const oneLiner = psScript.replace(/\s+/g, ' ').trim();
    const command = `chcp 65001 >NUL & powershell -Command "${oneLiner}"`;

    try {
        const output = await runCommand(command);
        const jsonStr = output.match(/\{.*\}/); 
        if (jsonStr) {
            return JSON.parse(jsonStr[0]);
        }
    } catch (e) {}
    return { Title: "", Artist: "", Status: "Stopped" };
};


// --- 1. ENDPOINT POGODOWY (PEŁNA LOGIKA Z BAZĄ) ---

app.get('/api/weather', async (req: Request, res: Response) => {
    console.log("👉 Otrzymano zapytanie GET /api/weather"); 

    // Dane zastępcze (Offline)
    const offlineData = {
        city: "Offline City",
        temp_ins: "21.5 °C",
        hum_ins: "42 %",
        pressure: "1010 hPa",
        temp_out: "12 °C",
        wind: "8 km/h",
        due_date: new Date().toLocaleString()
    };

    // Jeśli brak URL do bazy lub jest on domyślny/zły
    if (!MONGO_URL || MONGO_URL.includes("your_password")) {
        console.log("⚠️ Brak poprawnego MONGO_URL. Zwracam dane OFFLINE.");
        return res.json(offlineData);
    }

    const client = new MongoClient(MONGO_URL);

    try {
        await client.connect();
        
        // Użycie zmiennych środowiskowych (z fallbackiem na sztywno, jeśli brak w .env)
        const dbName = process.env.DB_NAME || "smartthermodatabase";
        const collName = process.env.COLLECTION_NAME || "weatherdata";

        const database = client.db(dbName);
        const collection = database.collection(collName);
        
        const result = await collection.findOne({}); 

        if (result) {
            console.log("✅ Pobrano dane z MongoDB");
            res.json(result);
        } else {
            console.log("⚠️ Baza połączona, ale pusta. Zwracam dane OFFLINE.");
            res.json(offlineData);
        }
    } catch (error: any) {
        console.error("❌ Błąd połączenia z MongoDB:", error.message);
        console.log("👉 Przełączam na tryb awaryjny (Offline Data).");
        res.json(offlineData); 
    } finally {
        try { await client.close(); } catch(e) {}
    }
});


// --- 2. ENDPOINTY SPOTIFY ---

app.get('/login', (req: Request, res: Response) => {
    const scope = 'user-read-private user-read-email user-read-playback-state user-modify-playback-state streaming';
    const state = Math.random().toString(36).substring(7);
    res.redirect('https://accounts.spotify.com/authorize?' +
        querystring.stringify({
            response_type: 'code', client_id: CLIENT_ID, scope: scope, redirect_uri: REDIRECT_URI, state: state
        }));
});

app.get('/callback', async (req: Request, res: Response) => {
    const code = req.query.code || null;
    const state = req.query.state || null;

    if (state === null) {
        res.redirect('/#' + querystring.stringify({ error: 'state_mismatch' }));
    } else {
        try {
            const response = await axios({
                method: 'post', url: 'https://accounts.spotify.com/api/token',
                data: querystring.stringify({ code: code as string, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code' }),
                headers: { 'content-type': 'application/x-www-form-urlencoded', 'Authorization': 'Basic ' + (Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')) },
            });
            const { access_token, refresh_token } = response.data;
            res.redirect(`http://localhost:${PORT}/vapage.html#` + querystring.stringify({ access_token, refresh_token }));
        } catch (error) {
            console.error('Błąd autoryzacji:', error);
            res.redirect(`http://localhost:${PORT}/vapage.html#error=invalid_token`);
        }
    }
});

app.get('/refresh_token', async (req: Request, res: Response) => {
    const refresh_token = req.query.refresh_token as string;
    try {
        const response = await axios({
            method: 'post', url: 'https://accounts.spotify.com/api/token',
            data: querystring.stringify({ grant_type: 'refresh_token', refresh_token: refresh_token }),
            headers: { 'content-type': 'application/x-www-form-urlencoded', 'Authorization': 'Basic ' + (Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')) },
        });
        res.send({ 'access_token': response.data.access_token });
    } catch (error) { res.status(500).send('Could not refresh token'); }
});


// --- 3. RADIO & CONFIG ---

app.get('/api/radio/list', (req: Request, res: Response) => {
    const stations = [
        { id: "rmf", title: "RMF FM", subtitle: "Muzyka", streamUrl: "http://217.74.72.12:8000/rmf_fm" },
        { id: "rmfclassic", title: "RMF Classic", subtitle: "Filmowa", streamUrl: "http://217.74.72.12:8000/rmf_classic" },
        { id: "zet", title: "Radio ZET", subtitle: "Rozrywka", streamUrl: "http://zet-net-01.cdn.eurozet.pl:8400/listen.pls" },
        { id: "eskarock", title: "Eska Rock", subtitle: "Rock/Alt", streamUrl: "http://ic2.smcdn.pl:8000/2380-1.mp3" },
        { id: "vox", title: "VOX FM", subtitle: "Disco", streamUrl: "http://ic2.smcdn.pl:8000/3990-1.mp3" },
        { id: "tok", title: "TOK FM", subtitle: "News", streamUrl: "http://ic2.smcdn.pl:8000/2400-1.mp3" }
    ];
    res.json(stations);
});

app.get('/api/config', (req: Request, res: Response) => {
    res.json({ clockFormat: process.env.CLOCK_FORMAT || '12' });
});


// --- 4. BLUETOOTH (Z DETEKCJĄ SYSTEMU) ---

app.get('/api/bluetooth/scan', async (req: Request, res: Response) => {
    if (isWindows) {
        console.log("💻 Skanowanie Bluetooth (Windows Real)...");
        // Używamy PowerShell do pobrania listy urządzeń (tych sparowanych i widocznych)
        const psCmd = `Get-PnpDevice -Class Bluetooth | Where-Object {$_.Status -eq 'OK'} | Select-Object FriendlyName, InstanceId | ConvertTo-Json`;
        try {
            const raw = await runCommand(`powershell -Command "${psCmd}"`);
            const data = JSON.parse(raw || "[]");
            const list = Array.isArray(data) ? data : [data];
            
            const devices = list
                .filter((d: any) => d.FriendlyName && !d.FriendlyName.includes("Bluetooth"))
                .map((d: any) => ({ 
                    name: d.FriendlyName, 
                    mac: d.InstanceId // Na Windows ID zamiast MAC
                }));
            res.json(devices);
        } catch (e) {
            // Fallback na wypadek błędu PowerShell - pusta lista zamiast błędu 500
            console.error("Błąd skanowania PS:", e);
            res.json([]);
        }
    } else {
        // LOGIKA DLA LINUXA / RASPBERRY PI
        try {
            runCommand('bluetoothctl scan on'); 
            const output = await runCommand('bluetoothctl devices');
            const devices = output.split('\n')
                .filter(line => line.includes("Device"))
                .map(line => {
                    const parts = line.split(' ');
                    const mac = parts[1];
                    const name = parts.slice(2).join(' ');
                    return { mac, name };
                });
            res.json(devices);
        } catch (e) {
            res.status(500).json({ error: "Błąd Bluetooth" });
        }
    }
});

app.post('/api/bluetooth/connect', async (req: Request, res: Response) => {
    const { mac } = req.body;
    
    if (isWindows) {
        // Windows blokuje programowe łączenie. Otwieramy okno ustawień, żeby użytkownik kliknął.
        console.log(`🔌 Windows: Otwieranie ustawień dla MAC/ID: ${mac}`);
        runCommand("start ms-settings:bluetooth");
        res.json({ status: "success", message: "Otwarto ustawienia. Kliknij 'Połącz' w oknie Windows." });
    } else {
        // LOGIKA DLA LINUXA / RASPBERRY PI
        console.log(`🔌 Linux: Próba połączenia z: ${mac}`);
        try {
            await runCommand(`bluetoothctl trust ${mac}`);
            await runCommand(`bluetoothctl pair ${mac}`);
            const result = await runCommand(`bluetoothctl connect ${mac}`);

            if (result.includes("Connection successful")) {
                res.json({ status: "success", message: "Połączono pomyślnie!" });
            } else {
                res.json({ status: "warning", message: "Wysłano żądanie, sprawdź telefon.", details: result });
            }
        } catch (e) {
            res.status(500).json({ error: "Błąd łączenia" });
        }
    }
});


// --- 5. SYSTEMOWE MEDIA (NOWOŚĆ - CO GRA?) ---

app.get('/api/media/now-playing', async (req: Request, res: Response) => {
    if (isWindows) {
        // Używa naszej funkcji bez npm!
        const info = await getWindowsMedia();
        // Statusy Windowsa: 4 = Playing, 5 = Paused
        let isPlaying = info.Status === "Playing" || info.Status === "4"; 
        
        res.json({
            title: info.Title || "Brak tytułu",
            artist: info.Artist || "Nieznany",
            status: isPlaying ? "Playing" : "Paused"
        });
    } else {
        // Linux Placeholder (można rozwinąć o 'playerctl' w przyszłości)
        res.json({ title: "Brak danych (Linux)", artist: "", status: "Paused" });
    }
});


// --- START SERWERA ---
app.listen(PORT, () => {
    console.log(`✅ Serwer działa na http://localhost:${PORT}`);
    console.log(`🔗 Frontend: http://localhost:${PORT}/vapage.html`);
    console.log(`📡 API Pogodowe: http://localhost:${PORT}/api/weather`);
    console.log(`💻 Tryb systemu: ${isWindows ? 'Windows 🪟' : 'Linux/Raspberry Pi 🍓'}`);
});