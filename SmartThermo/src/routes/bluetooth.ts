// src/routes/bluetooth.ts
import { Router, Request, Response } from 'express';
import { runCommand, isWindows } from '../helpers/system';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';

const router = Router();

// --- GET: Skanowanie (Używamy media_monitor.py z flagą scan) ---
router.get('/scan', async (req: Request, res: Response) => {
    if (isWindows) {
        // Używamy TEGO SAMEGO skryptu co monitor, ale z parametrem 'scan'
        const scriptPath = path.join(process.cwd(), 'scripts', 'media_monitor.py');
        const venvPython = path.join(process.cwd(), 'env-media', 'Scripts', 'python.exe');
        const pythonExe = fs.existsSync(venvPython) ? venvPython : 'python';

        // Dodajemy argument "scan" na końcu
        exec(`"${pythonExe}" "${scriptPath}" scan`, (error, stdout, stderr) => {
            if (error) {
                console.error("Błąd skanowania BT:", stderr);
                return res.json([]);
            }
            try {
                // Skrypt wypisze JSON w konsoli
                const devices = JSON.parse(stdout.trim());
                res.json(devices);
            } catch (e) {
                console.error("Błąd parsowania:", e);
                res.json([]);
            }
        });
    } else {
        // --- LOGIKA LINUX (Bez zmian) ---
        try {
            runCommand('bluetoothctl scan on');
            setTimeout(async () => {
                try {
                    const output = await runCommand('bluetoothctl devices');
                    const devices = output.split('\n')
                        .filter(line => line.includes("Device"))
                        .map(line => {
                            const parts = line.split(' ');
                            return { mac: parts[1], name: parts.slice(2).join(' ') };
                        });
                    res.json(devices);
                } catch { res.json([]); }
            }, 1000);
        } catch (e) {
            res.status(500).json({ error: "Błąd Bluetooth Linux" });
        }
    }
});

// --- POST: Łączenie ---
router.post('/connect', async (req: Request, res: Response) => {
    const { mac } = req.body;
    
    if (isWindows) {
        runCommand("start ms-settings:bluetooth");
        res.json({ status: "success", message: "Otwarto panel Bluetooth." });
    } else {
        // Linux
        try {
            await runCommand(`bluetoothctl trust ${mac}`);
            await runCommand(`bluetoothctl pair ${mac}`);
            const result = await runCommand(`bluetoothctl connect ${mac}`);
            if (result.includes("Connection successful")) {
                res.json({ status: "success", message: "Połączono!" });
            } else {
                res.json({ status: "warning", message: "Sprawdź telefon." });
            }
        } catch { res.status(500).json({ error: "Błąd łączenia" }); }
    }
});

export default router;