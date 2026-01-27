// src/helpers/system.ts
import { exec } from 'child_process';
import os from 'os';

export const isWindows = os.platform() === 'win32';

// ==========================================
// 1. DANE RADIA I STAN (Przeniesione z media.ts)
// ==========================================
export const RADIO_STATIONS = [
    { id: "rmf", title: "RMF FM", subtitle: "Muzyka", streamUrl: "https://www.rmf.fm/radio/play/rmf_fm", directUrl: "http://217.74.72.12:8000/rmf_fm" },
    { id: "rmfclassic", title: "RMF Classic", subtitle: "Filmowa", streamUrl: "https://www.rmf.fm/radio/play/rmf_classic", directUrl: "http://217.74.72.12:8000/rmf_classic" },
    { id: "zet", title: "Radio ZET", subtitle: "Rozrywka", streamUrl: "https://player.radiozet.pl/", directUrl: "http://zet-net-01.cdn.eurozet.pl:8400/listen.pls" },
    { id: "eskarock", title: "Eska Rock", subtitle: "Rock/Alt", streamUrl: "https://www.eskago.pl/radio/eska-rock", directUrl: "http://ic2.smcdn.pl:8000/2380-1.mp3" },
    { id: "vox", title: "VOX FM", subtitle: "Disco", streamUrl: "https://www.eskago.pl/radio/vox-fm", directUrl: "http://ic2.smcdn.pl:8000/3990-1.mp3" },
    { id: "tok", title: "TOK FM", subtitle: "News", streamUrl: "https://audycje.tokfm.pl/", directUrl: "http://ic2.smcdn.pl:8000/2400-1.mp3" },
    { id: "antyradio", title: "Antyradio", subtitle: "Rock", streamUrl: "https://player.antyradio.pl/", directUrl: "http://ant-kat.cdn.eurozet.pl:8604/listen.pls" }
];

export let serverRadioState = {
    isPlaying: false,
    name: "",
    description: ""
};

export const setServerRadio = (playing: boolean, name: string, desc: string) => {
    serverRadioState.isPlaying = playing;
    serverRadioState.name = name;
    serverRadioState.description = desc;
};

export const playRadioById = (stationId: string): boolean => {
    const station = RADIO_STATIONS.find(s => s.id === stationId.toLowerCase());
    
    if (station) {
        // Uruchamiamy przeglądarkę
        exec(`start "" "${station.streamUrl}"`, { shell: 'powershell.exe' });
        
        // Ustawiamy stan globalny
        setServerRadio(true, station.title, "Radio Internetowe");
        return true;
    }
    return false;
};

// ==========================================
// 2. FUNKCJE SYSTEMOWE (Twoje istniejące)
// ==========================================

export const runCommand = (command: string): Promise<string> => {
    return new Promise((resolve) => {
        exec(command, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 2 }, (error, stdout, stderr) => {
            resolve(stdout ? stdout.trim() : "");
        });
    });
};

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
            cleanName = cleanName.replace("Audio", "").replace("A2DP", "").replace("SNK", "").trim();

            return cleanName;
        }
    } catch (e) { }
    return null;
};