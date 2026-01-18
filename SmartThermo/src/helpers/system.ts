// src/helpers/system.ts
import { exec } from 'child_process';
import os from 'os';

export const isWindows = os.platform() === 'win32';

export const runCommand = (command: string): Promise<string> => {
    return new Promise((resolve) => {
        exec(command, { encoding: 'utf8' }, (error, stdout, stderr) => {
            resolve(stdout ? stdout.trim() : "");
        });
    });
};

export const getWindowsMedia = async () => {
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
            Status = $info.PlaybackStatus; 
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
    } catch (e) {
        console.error("Błąd parsowania mediów Windows:", e);
    }
    return [];
};

export const getLineInStatus = async () => {
    const psCmd = `Get-CimInstance Win32_PnPEntity | Where-Object { ($_.Name -match 'A2DP' -or $_.Name -match 'SNK' -or $_.Name -match 'Linia' -or $_.Name -match 'MI 9') -and $_.Status -eq 'OK' } | Select-Object Name, Description | ConvertTo-Json -Compress`;
    
    try {
        const output = await runCommand(`powershell -Command "${psCmd}"`);
        if (output && output.includes("Name")) {
            let parsed;
            try { parsed = JSON.parse(output); } catch(e) { return "Urządzenie A2DP"; }
            const device = Array.isArray(parsed) ? parsed[0] : parsed;
            return device.Name || device.Description || "Nieznane urządzenie";
        }
    } catch (e) {
        console.error("Błąd skanowania PnP:", e);
    }
    return null;
};