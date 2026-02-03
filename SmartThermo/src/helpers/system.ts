// src/helpers/system.ts
import { exec } from 'child_process';
import os from 'os';

export const isWindows = os.platform() === 'win32';

// ════════════════════════════════════════════════════════════════════════════
// SEKCJA 1: LISTA STACJI RADIOWYCH
// ════════════════════════════════════════════════════════════════════════════
export const RADIO_STATIONS = [
    { 
        id: "rmf", 
        title: "RMF FM", 
        subtitle: "Najlepsza muzyka", 
        streamUrl: "http://217.74.72.12:8000/rmf_fm"
    },
    { 
        id: "rmfclassic", 
        title: "RMF Classic", 
        subtitle: "Muzyka filmowa", 
        streamUrl: "http://217.74.72.12:8000/rmf_classic"
    },
    { 
        id: "zet", 
        title: "Radio ZET", 
        subtitle: "Siła muzyki", 
        streamUrl: "http://zet-net-01.cdn.eurozet.pl:8400/listen.pls"
    },
    { 
        id: "eskarock", 
        title: "Eska Rock", 
        subtitle: "Gramy co chcemy", 
        streamUrl: "http://ic2.smcdn.pl:8000/2380-1.mp3"
    },
    { 
        id: "vox", 
        title: "VOX FM", 
        subtitle: "W rytmie hitów", 
        streamUrl: "http://ic2.smcdn.pl:8000/3990-1.mp3"
    },
    { 
        id: "antyradio", 
        title: "Antyradio", 
        subtitle: "Rockowa siła", 
        streamUrl: "http://ant-kat.cdn.eurozet.pl:8604/listen.pls"
    }
];

// ════════════════════════════════════════════════════════════════════════════
// SEKCJA 2: STAN RADIA (GLOBALNY)
// ════════════════════════════════════════════════════════════════════════════
export let serverRadioState = {
    isPlaying: false,
    name: "",
    description: "",
    url: "",
    startTimestamp: 0  // ✅ NOWOŚĆ: Timestamp startu (dla Time-To-Live)
};

export const setServerRadio = (
    playing: boolean, 
    name: string, 
    desc: string, 
    url: string = ""
) => {
    serverRadioState.isPlaying = playing;
    serverRadioState.name = name;
    serverRadioState.description = desc;
    serverRadioState.url = url;
    
    // ✅ NOWOŚĆ: Ustawiamy timestamp przy starcie radia
    if (playing && url) {
        serverRadioState.startTimestamp = Date.now();
        console.log(`📻 [SYSTEM] Radio START: ${name} (Ochrona: 6s)`);
    } else if (!playing) {
        serverRadioState.startTimestamp = 0;
        console.log(`📻 [SYSTEM] Radio STOP`);
    }
};

// ✅ NOWOŚĆ: Sprawdzanie czy Radio jest chronione (TTL)
export const isRadioProtected = (): boolean => {
    if (!serverRadioState.isPlaying || !serverRadioState.startTimestamp) {
        return false;
    }
    const elapsed = Date.now() - serverRadioState.startTimestamp;
    return elapsed < 6000; // 6 sekund ochrony
};

// ════════════════════════════════════════════════════════════════════════════
// SEKCJA 3: ODTWARZANIE RADIA
// ════════════════════════════════════════════════════════════════════════════
export const playRadioById = (stationId: string): boolean => {
    const station = RADIO_STATIONS.find(s => s.id === stationId.toLowerCase());
    
    if (station) {
        console.log(`📻 [SYSTEM] Ustawiam stację: ${station.title}`);
        setServerRadio(true, station.title, "Radio Internetowe", station.streamUrl);
        return true;
    }
    
    console.warn(`⚠️ [SYSTEM] Nieznana stacja: ${stationId}`);
    return false;
};

// ════════════════════════════════════════════════════════════════════════════
// SEKCJA 4: KOMENDY SYSTEMOWE
// ════════════════════════════════════════════════════════════════════════════
export const runCommand = (command: string): Promise<string> => {
    return new Promise((resolve) => {
        exec(command, { 
            encoding: 'utf8', 
            maxBuffer: 1024 * 1024 * 2 
        }, (error, stdout, stderr) => {
            if (error) {
                console.error(`❌ [CMD] Error: ${error.message}`);
            }
            resolve(stdout ? stdout.trim() : "");
        });
    });
};

// ════════════════════════════════════════════════════════════════════════════
// SEKCJA 5: WINDOWS MEDIA (SPOTIFY/YOUTUBE)
// ════════════════════════════════════════════════════════════════════════════
export const getWindowsMedia = async () => {
    const psScript = `
    $ErrorActionPreference = 'SilentlyContinue';
    [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media, ContentType=WindowsRuntime] | Out-Null;
    $manager = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync().GetAwaiter().GetResult();
    $results = @();
    foreach ($s in $manager.GetSessions()) {
        $props = $s.TryGetMediaPropertiesAsync().GetAwaiter().GetResult();
        if ($props) {
            $results += @{
                Title = $props.Title;
                Artist = $props.Artist;
                Status = [int]$s.GetPlaybackInfo().PlaybackStatus;
            };
        }
    }
    $results | ConvertTo-Json -Compress
    `;

    const command = `pwsh -NoProfile -ExecutionPolicy Bypass -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${psScript.replace(/\s+/g, ' ').trim()}"`;

    try {
        const output = await runCommand(command);
        if (!output) return [];
        const parsed = JSON.parse(output);
        return Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {
        return [];
    }
};

// ════════════════════════════════════════════════════════════════════════════
// SEKCJA 6: BLUETOOTH (LINE-IN)
// ════════════════════════════════════════════════════════════════════════════
export const getLineInStatus = async () => {
    const psCmd = `Get-CimInstance Win32_PnPEntity | Where-Object { ($_.Name -match 'A2DP' -or $_.Name -match 'SNK') -and $_.Name -notmatch 'Hands-Free' -and $_.Status -eq 'OK' -and $_.ConfigManagerErrorCode -eq 0 } | Select-Object Name, Description, Status | ConvertTo-Json -Compress`;
    
    try {
        const output = await runCommand(`powershell -NoProfile -Command "${psCmd}"`);
        if (output && output.includes("Name")) {
            let parsed;
            try {
                parsed = JSON.parse(output);
            } catch { return null; }

            const device = Array.isArray(parsed) ? parsed[0] : parsed;
            let cleanName = device.Name || "Urządzenie Bluetooth";
            cleanName = cleanName
                .replace(/Audio/gi, "")
                .replace(/A2DP/gi, "")
                .replace(/SNK/gi, "")
                .trim();

            return cleanName;
        }
    } catch (e) {
        console.error("❌ [BLUETOOTH] Błąd sprawdzania:", e);
    }
    return null;
};