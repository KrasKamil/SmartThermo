// src/routes/debug.ts
import { Router, Request, Response } from 'express';
import { runCommand, isWindows } from '../helpers/system';

const router = Router();

// Endpoint: /api/debug/devices
router.get('/devices', async (req: Request, res: Response) => {
    if (!isWindows) {
        return res.json({ msg: "Linux - brak debugu PnP" });
    }
    
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

export default router;