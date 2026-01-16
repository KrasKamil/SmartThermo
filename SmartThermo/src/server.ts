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
        exec(command, { encoding: 'utf8' }, (error, stdout, stderr) => {
            resolve(stdout ? stdout.trim() : "");
        });
    });
};

//// 1. Sprawdzanie Sesji Mediów (Spotify, Chrome, Appki)
const getWindowsMedia = async () => {
    const psScript = `
    $ErrorActionPreference = 'SilentlyContinue';
    [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media,ContentType=WindowsRuntime] | Out-Null;
    $g = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync().GetAwaiter().GetResult();
    
    $sessions = $g.GetSessions();
    $results = @();

    foreach ($s in $sessions) {
        $props = $s.TryGetMediaPropertiesAsync().GetAwaiter().GetResult();
        $info = $s.GetPlaybackInfo();
        
        $item = @{
            Type = "Session";
            Title = $props.Title;
            Artist = $props.Artist;
            Status = $info.PlaybackStatus; # 4=Playing, 5=Paused
        }
        $results += $item;
    }
    $results | ConvertTo-Json -Compress
    `;
    
    const command = `chcp 65001 >NUL & powershell -Command "${psScript.replace(/\s+/g, ' ').trim()}"`;
    try {
        const output = await runCommand(command);
        const match = output.match(/\[.*\]|{.*}/);
        if (match) {
            const parsed = JSON.parse(match[0]);
            return Array.isArray(parsed) ? parsed : [parsed];
        }
    } catch (e) {}
    return [];
};

// 2. Metoda (NOWA - POPRAWIONA): Wykrywanie sprzętu "Linia A2DP"
const getLineInStatus = async () => {
    // Szukamy czegokolwiek co ma w nazwie A2DP, SNK, Linia lub MI 9
    // Status="OK" oznacza, że sterownik działa poprawnie (jest połączony)
    const psCmd = `Get-CimInstance Win32_PnPEntity | Where-Object { ($_.Name -match 'A2DP' -or $_.Name -match 'SNK' -or $_.Name -match 'Linia' -or $_.Name -match 'MI 9') -and $_.Status -eq 'OK' } | Select-Object Name, Description | ConvertTo-Json -Compress`;
    
    try {
        const output = await runCommand(`powershell -Command "${psCmd}"`);
        
        if (output && output.includes("Name")) {
            // Znaleziono!
            let parsed;
            try {
                 parsed = JSON.parse(output);
            } catch(e) {
                // Czasem PowerShell zwraca dziwny format, fallback:
                return "Urządzenie A2DP";
            }

            const device = Array.isArray(parsed) ? parsed[0] : parsed;
            const name = device.Name || device.Description || "Nieznane urządzenie";
            
            // console.log(`✅ ZNALEZIONO SPRZĘT: ${name}`); // Debug
            return name; 
        }
    } catch (e) {
        console.error("Błąd skanowania PnP:", e);
    }
    return null;
};

// 3. Sprawdzanie statusu sprzętu Bluetooth (Windows)
const getBluetoothHardwareStatus = async () => {
    // Szukamy urządzenia, które ma w nazwie 'A2DP' (profil audio) i jest włączone (Status 'OK')
    const psCmd = `Get-PnpDevice | Where-Object { $_.FriendlyName -like "*A2DP*" -and $_.Status -eq "OK" } | Select-Object FriendlyName | ConvertTo-Json -Compress`;
    
    try {
        const output = await runCommand(`powershell -Command "${psCmd}"`);
        if (output && output.includes("FriendlyName")) {
            // Znaleziono aktywne urządzenie audio bluetooth!
            // Wyciągamy nazwę (np. "Linia (MI 9 lite A2DP SNK)")
            const json = JSON.parse(output);
            const name = Array.isArray(json) ? json[0].FriendlyName : json.FriendlyName;
            return name; 
        }
    } catch (e) {}
    return null;
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

// --- STEROWANIE (WERSJA HARDWARE INPUT + VOLUME) ---
app.post('/api/media/control', async (req: Request, res: Response) => {
    const { action } = req.body; 
    
    if (!isWindows) return res.json({ status: "ignored" });

    // Kody klawiszy wirtualnych (Virtual-Key Codes)
    // 0xB3 = Play/Pause
    // 0xB0 = Next
    // 0xB1 = Prev
    // 0xB2 = Stop
    // 0xAD = Volume Mute
    // 0xAE = Volume Down
    // 0xAF = Volume Up
    
    let keyCode = "";
    
    // Media
    if (action === 'playpause' || action === 'play' || action === 'pause') keyCode = "0xB3"; 
    else if (action === 'next') keyCode = "0xB0";
    else if (action === 'prev') keyCode = "0xB1";
    else if (action === 'stop') keyCode = "0xB2";
    
    // Głośność (NOWOŚĆ)
    else if (action === 'mute') keyCode = "0xAD";
    else if (action === 'vol_down') keyCode = "0xAE";
    else if (action === 'vol_up') keyCode = "0xAF";

    if (keyCode) {
        // console.log(`⏯️ Wysyłanie sygnału: ${action} (${keyCode})`);

        const psScript = `
        $code = @'
        [DllImport("user32.dll")]
        public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);
        '@
        $win32 = Add-Type -MemberDefinition $code -Name "Win32" -Namespace Win32 -PassThru
        
        # Wciśnij
        $win32::keybd_event(${keyCode}, 0, 0, 0)
        # Puść
        $win32::keybd_event(${keyCode}, 0, 2, 0)
        `;

        const command = `powershell -Command "${psScript.replace(/\r?\n/g, '; ')}"`;
        await runCommand(command);
        res.json({ status: "success" });
    } else {
        res.json({ status: "error", message: "Unknown action" });
    }
});


// --- 5. SYSTEMOWE MEDIA (Endpoint zaktualizowany) ---
// --- GŁÓWNA LOGIKA WYKRYWANIA ---
app.get('/api/media/now-playing', async (req: Request, res: Response) => {
    if (isWindows) {
        // KROK 1: Sprawdź czy grają normalne aplikacje (Spotify)
        const allSessions = await getWindowsMedia();
        let activeSession = allSessions.find((s: any) => s.Status === 4);

        if (activeSession) {
            console.log(`🎵 Aplikacja: ${activeSession.Title}`);
            return res.json({
                title: activeSession.Title,
                artist: activeSession.Artist,
                status: "Playing"
            });
        }

        // KROK 2: Jeśli nic nie gra, sprawdź czy telefon jest podłączony jako sprzęt
        const lineDevice = await getLineInStatus();
        
        if (lineDevice) {
            // Mamy podłączony telefon!
            // Zakładamy że gra (bo jest połączony), tytułu nie znamy
            return res.json({
                title: "Audio Bluetooth", // Tytuł na sztywno
                artist: lineDevice,       // Nazwa urządzenia z systemu
                status: "Playing"         // Wymuszamy status Playing
            });
        }

        // KROK 3: Cisza
        res.json({ title: "", artist: "", status: "Paused" });

    } else {
        res.json({ title: "Linux", artist: "", status: "Paused" });
    }
});

// --- DIAGNOSTYKA (Nowy Endpoint) ---
// Wejdź tutaj, żeby zobaczyć co widzi system: http://localhost:8888/api/debug/devices
app.get('/api/debug/devices', async (req, res) => {
    if (!isWindows) return res.json({ msg: "Linux - brak debugu PnP" });
    
    // Pobiera WSZYSTKIE urządzenia zawierające słowa kluczowe
    const cmd = `Get-CimInstance Win32_PnPEntity | Where-Object { $_.Name -match 'Bluetooth' -or $_.Name -match 'Audio' -or $_.Name -match 'A2DP' -or $_.Name -match 'MI 9' } | Select-Object Name, Status, Service | ConvertTo-Json`;
    
    try {
        const output = await runCommand(`powershell -Command "${cmd}"`);
        // Próba parsowania JSON, ale jak się nie uda to wyślij tekst
        try {
            res.json(JSON.parse(output));
        } catch (e) {
            res.send(`<pre>${output}</pre>`); // Wyświetl jako tekst
        }
    } catch(e: any) {
        res.status(500).send(e.message);
    }
});

// --- START SERWERA ---
app.listen(PORT, () => {
    console.log(`✅ Serwer działa na http://localhost:${PORT}`);
    console.log(`🔗 Frontend: http://localhost:${PORT}/vapage.html`);
    console.log(`📡 API Pogodowe: http://localhost:${PORT}/api/weather`);
    console.log(`💻 Tryb systemu: ${isWindows ? 'Windows 🪟' : 'Linux/Raspberry Pi 🍓'}`);
    console.log(`🎵 Tryb diagnostyki mediów włączony.`);
});