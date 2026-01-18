// src/routes/media.ts
import { Router, Request, Response } from 'express';
import { runCommand, isWindows, getWindowsMedia, getLineInStatus } from '../helpers/system';

const router = Router();

// Radio List
router.get('/radio/list', (req, res) => {
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

// Config
router.get('/config', (req, res) => {
    res.json({ clockFormat: process.env.CLOCK_FORMAT || '12' });
});

// Media Control
router.post('/media/control', async (req: Request, res: Response) => {
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
    if (action === 'playpause') keyCode = "0xB3";
    else if (action === 'next') keyCode = "0xB0";
    else if (action === 'prev') keyCode = "0xB1";
    else if (action === 'stop') keyCode = "0xB2";

    // Głośność (NOWOŚĆ)
    else if (action === 'mute') keyCode = "0xAD";
    else if (action === 'vol_down') keyCode = "0xAE";
    else if (action === 'vol_up') keyCode = "0xAF";

    if (keyCode) {
        const psScript = `
        $code = @'
        [DllImport("user32.dll")]
        public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);
        '@
        $win32 = Add-Type -MemberDefinition $code -Name "Win32" -Namespace Win32 -PassThru
        $win32::keybd_event(${keyCode}, 0, 0, 0)
        $win32::keybd_event(${keyCode}, 0, 2, 0)
        `;
        const command = `powershell -Command "${psScript.replace(/\r?\n/g, '; ')}"`;
        await runCommand(command);
        res.json({ status: "success" });
    } else {
        res.json({ status: "error" });
    }
});

// Now Playing
router.get('/media/now-playing', async (req: Request, res: Response) => {
    if (isWindows) {
        const allSessions = await getWindowsMedia();
        let activeSession = allSessions.find((s: any) => s.Status === 4);

        if (activeSession) {
            return res.json({
                title: activeSession.Title,
                artist: activeSession.Artist,
                status: "Playing"
            });
        }

        const lineDevice = await getLineInStatus();
        if (lineDevice) {
            return res.json({
                title: "Audio Bluetooth",
                artist: lineDevice,
                status: "Playing"
            });
        }
        res.json({ title: "", artist: "", status: "Paused" });
    } else {
        res.json({ title: "Linux", artist: "", status: "Paused" });
    }
});

export default router;