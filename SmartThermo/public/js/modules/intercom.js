// public/js/modules/intercom.js

let socketRef = null;
let unlockInterval = null;
let cameraAnimationId = null;
let currentStreamUrl = localStorage.getItem('smartthermo_intercom_stream') || '';

/**
 * Generuje przyjemny dwutonowy dźwięk dzwonka (Ding-Dong) przez Web Audio API
 */
const playDoorbellChime = () => {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();

        // 1. DING (wysoki ton ~660Hz)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
        gain1.gain.setValueAtTime(0.3, ctx.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(ctx.currentTime);
        osc1.stop(ctx.currentTime + 0.8);

        // 2. DONG (niższy ton ~523Hz po 0.35s)
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(523.25, ctx.currentTime + 0.35); // C5
        gain2.gain.setValueAtTime(0.35, ctx.currentTime + 0.35);
        gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.4);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(ctx.currentTime + 0.35);
        osc2.stop(ctx.currentTime + 1.4);
    } catch (e) {
        console.warn('AudioContext nieaktywny:', e);
    }
};

/**
 * Uruchamia animowaną symulację kamery monitoringu na canvasie
 */
const startCameraSimulation = () => {
    const canvas = document.getElementById('intercom-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (cameraAnimationId) cancelAnimationFrame(cameraAnimationId);

    let frame = 0;

    const render = () => {
        frame++;
        const w = canvas.width;
        const h = canvas.height;

        // Tło: stylizowany podgląd wejścia / podjazdu (ciemny gradient z siatką)
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#0f172a');
        grad.addColorStop(0.5, '#1e293b');
        grad.addColorStop(1, '#090d16');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        // Efekt delikatnego szumu wideo CCTV
        ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
        for (let i = 0; i < 20; i++) {
            const rx = Math.random() * w;
            const ry = Math.random() * h;
            ctx.fillRect(rx, ry, Math.random() * 4, 1);
        }

        // Rysowanie stylizowanego obrysu furtki / bramy wejściowej
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
        ctx.lineWidth = 2;
        ctx.strokeRect(w * 0.25, h * 0.25, w * 0.5, h * 0.65);

        // Skrzydło furtki (pionowe szczeble)
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.15)';
        for (let x = w * 0.28; x < w * 0.73; x += w * 0.04) {
            ctx.beginPath();
            ctx.moveTo(x, h * 0.25);
            ctx.lineTo(x, h * 0.9);
            ctx.stroke();
        }

        // Celownik w centrum kadru
        const cx = w / 2;
        const cy = h / 2;
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - 20, cy);
        ctx.lineTo(cx + 20, cy);
        ctx.moveTo(cx, cy - 20);
        ctx.lineTo(cx, cy + 20);
        ctx.stroke();

        // Oznaczenia OSD (On-Screen Display) jak w prawdziwym monitoringu
        ctx.font = '13px "Courier New", monospace';
        ctx.fillStyle = '#38bdf8';
        ctx.fillText('CAM 01 - FURTKA WEJŚCIOWA [HD 1080P]', 20, 28);

        // Czas na żywo
        const now = new Date();
        const timeStr = now.toLocaleDateString('pl-PL') + ' ' + now.toLocaleTimeString('pl-PL');
        ctx.fillStyle = '#e2e8f0';
        ctx.fillText(timeStr, w - 210, 28);

        // Kropka nagrywania / LIVE
        const isBlink = Math.floor(frame / 30) % 2 === 0;
        ctx.fillStyle = isBlink ? '#ef4444' : '#7f1d1d';
        ctx.beginPath();
        ctx.arc(w - 230, 24, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = '10px monospace';
        ctx.fillStyle = isBlink ? '#ef4444' : '#94a3b8';
        ctx.fillText('LIVE', w - 260, 27);

        cameraAnimationId = requestAnimationFrame(render);
    };

    render();
};

const stopCameraSimulation = () => {
    if (cameraAnimationId) {
        cancelAnimationFrame(cameraAnimationId);
        cameraAnimationId = null;
    }
};

/**
 * Otwiera popup domofonu
 */
export const openIntercomPopup = () => {
    const overlay = document.getElementById('intercom-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';

    const streamImg = document.getElementById('intercom-live-img');
    const canvas = document.getElementById('intercom-canvas');

    if (currentStreamUrl && streamImg && canvas) {
        streamImg.src = currentStreamUrl;
        streamImg.style.display = 'block';
        canvas.style.display = 'none';
    } else {
        if (streamImg) streamImg.style.display = 'none';
        if (canvas) {
            canvas.style.display = 'block';
            startCameraSimulation();
        }
    }
};

/**
 * Zamyka popup domofonu
 */
export const closeIntercomPopup = () => {
    const overlay = document.getElementById('intercom-overlay');
    if (!overlay) return;
    overlay.style.display = 'none';
    stopCameraSimulation();

    // Wyciszenie dzwonka po stronie serwera
    fetch('/api/intercom/dismiss', { method: 'POST' }).catch(() => {});
};

/**
 * Wywołanie zdalnego otwarcia furtki (elektrozaczep na 5s)
 */
export const unlockDoorbell = async () => {
    const unlockBtn = document.getElementById('intercom-unlock-btn');
    const statusText = document.getElementById('intercom-gate-status');
    const progressBar = document.getElementById('intercom-unlock-progress');

    try {
        if (unlockBtn) unlockBtn.disabled = true;
        const res = await fetch('/api/intercom/unlock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ duration: 5 })
        });
        const data = await res.json();

        if (data.success) {
            let timeLeft = 5;
            if (statusText) statusText.innerHTML = `🟢 <b>FURTKA OTWARTA!</b> (${timeLeft}s)`;
            if (progressBar) {
                progressBar.style.width = '100%';
                progressBar.style.backgroundColor = '#22c55e';
            }

            if (unlockInterval) clearInterval(unlockInterval);
            unlockInterval = setInterval(() => {
                timeLeft -= 1;
                if (timeLeft > 0) {
                    if (statusText) statusText.innerHTML = `🟢 <b>FURTKA OTWARTA!</b> (${timeLeft}s)`;
                    if (progressBar) progressBar.style.width = `${(timeLeft / 5) * 100}%`;
                } else {
                    clearInterval(unlockInterval);
                    if (statusText) statusText.innerHTML = `🔒 Furtka zablokowana (rygiel czuwa)`;
                    if (progressBar) {
                        progressBar.style.width = '0%';
                        progressBar.style.backgroundColor = '#38bdf8';
                    }
                    if (unlockBtn) unlockBtn.disabled = false;
                }
            }, 1000);
        }
    } catch (err) {
        console.error('Błąd otwierania furtki:', err);
        if (unlockBtn) unlockBtn.disabled = false;
    }
};

/**
 * Symulacja naciśnięcia dzwonka przy furtce (do testów)
 */
export const triggerRingSimulation = async () => {
    try {
        await fetch('/api/intercom/ring', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source: 'Panel Testowy' })
        });
    } catch (err) {
        console.error('Błąd symulacji dzwonka:', err);
    }
};

/**
 * Zapisuje niestandardowy URL strumienia kamery (np. ESP32-CAM)
 */
export const saveStreamUrl = () => {
    const input = document.getElementById('intercom-stream-url-input');
    if (!input) return;
    currentStreamUrl = input.value.trim();
    localStorage.setItem('smartthermo_intercom_stream', currentStreamUrl);
    alert(currentStreamUrl ? '✅ Zapisano adres strumienia kamery!' : 'ℹ️ Wyczyszczono adres strumienia (używam symulatora).');
    openIntercomPopup();
};

/**
 * Inicjalizacja nasłuchiwania zdarzeń z Socket.io
 */
export const initIntercom = (socket) => {
    socketRef = socket;

    // 🔔 Ktoś dzwoni do furtki!
    socket.on('doorbell:ring', (data) => {
        console.log('🔔 [DOMOFON] Otrzymano zdarzenie dzwonka:', data);
        playDoorbellChime();
        openIntercomPopup();

        const banner = document.getElementById('intercom-ring-banner');
        if (banner) {
            banner.style.display = 'block';
            banner.classList.add('pulse-ring');
            setTimeout(() => {
                banner.style.display = 'none';
                banner.classList.remove('pulse-ring');
            }, 15000);
        }
    });

    // 🔓 Otwarcie furtki (np. przez innego domownika lub z telefonu)
    socket.on('doorbell:unlock', (data) => {
        const statusText = document.getElementById('intercom-gate-status');
        if (statusText) statusText.innerHTML = `🟢 <b>FURTKA OTWARTA</b> (z innego urządzenia)`;
    });

    socket.on('doorbell:locked', () => {
        const statusText = document.getElementById('intercom-gate-status');
        if (statusText) statusText.innerHTML = `🔒 Furtka zablokowana`;
    });

    // Udostępniamy funkcje globalnie dla wywołań z HTML (onclick)
    window.openIntercomPopup = openIntercomPopup;
    window.closeIntercomPopup = closeIntercomPopup;
    window.unlockDoorbell = unlockDoorbell;
    window.triggerRingSimulation = triggerRingSimulation;
    window.saveStreamUrl = saveStreamUrl;
};
