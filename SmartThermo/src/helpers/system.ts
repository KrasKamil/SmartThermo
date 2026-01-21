// src/helpers/system.ts
import { exec } from 'child_process';
import os from 'os';

export const isWindows = os.platform() === 'win32';

export const runCommand = (command: string): Promise<string> => {
    return new Promise((resolve) => {
        // Zwiększamy bufor pamięci, bo lista sesji może być długa
        exec(command, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 2 }, (error, stdout, stderr) => {
            resolve(stdout ? stdout.trim() : "");
        });
    });
};

export const getWindowsMedia = async () => {
    // Skrypt uproszczony pod PowerShell 7
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

    // Używamy PWSH zamiast POWERSHELL
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
    // USUNĄŁEM: -match 'Hands-Free' z poniższej listy.
    // Teraz szuka tylko A2DP (muzyka) lub SNK (sink).
    // Dodatkowo filtrujemy "AG" (Audio Gateway), który często jest mylący.
    const psCmd = `Get-CimInstance Win32_PnPEntity | Where-Object { ($_.Name -match 'A2DP' -or $_.Name -match 'SNK') -and $_.Name -notmatch 'Hands-Free' -and $_.Status -eq 'OK' -and $_.ConfigManagerErrorCode -eq 0 } | Select-Object Name, Description, Status | ConvertTo-Json -Compress`;
    
    try {
        const output = await runCommand(`powershell -NoProfile -Command "${psCmd}"`);
        if (output && output.includes("Name")) {
            let parsed;
            try {
                parsed = JSON.parse(output);
            } catch { return null; }

            const device = Array.isArray(parsed) ? parsed[0] : parsed;
            
            // Czyścimy nazwę z technicznego bełkotu
            let cleanName = device.Name || "Urządzenie Bluetooth";
            cleanName = cleanName.replace("Audio", "").replace("A2DP", "").replace("SNK", "").trim();

            return cleanName;
        }
    } catch (e) {
        // ignore error
    }
    return null;
};