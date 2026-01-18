// src/routes/bluetooth.ts
import { Router, Request, Response } from 'express';
import { runCommand, isWindows } from '../helpers/system';

const router = Router();

router.get('/scan', async (req: Request, res: Response) => {
    if (isWindows) {
        const psCmd = `Get-PnpDevice -Class Bluetooth | Where-Object {$_.Status -eq 'OK'} | Select-Object FriendlyName, InstanceId | ConvertTo-Json`;
        try {
            const raw = await runCommand(`powershell -Command "${psCmd}"`);
            const data = JSON.parse(raw || "[]");
            const list = Array.isArray(data) ? data : [data];
            const devices = list
                .filter((d: any) => d.FriendlyName && !d.FriendlyName.includes("Bluetooth"))
                .map((d: any) => ({ name: d.FriendlyName, mac: d.InstanceId }));
            res.json(devices);
        } catch (e) {
            res.json([]);
        }
    } else {
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

router.post('/connect', async (req: Request, res: Response) => {
    const { mac } = req.body;
    if (isWindows) {
        runCommand("start ms-settings:bluetooth");
        res.json({ status: "success", message: "Otwarto ustawienia Windows." });
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

export default router;