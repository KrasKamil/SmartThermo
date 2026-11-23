import { Router, Request, Response } from 'express';
import { getIO } from '../helpers/socket';

const router = Router();

interface IntercomState {
    status: 'idle' | 'ringing' | 'unlocked';
    lastRing: number | null;
    unlockExpiresAt: number | null;
}

const state: IntercomState = {
    status: 'idle',
    lastRing: null,
    unlockExpiresAt: null
};

let unlockTimer: NodeJS.Timeout | null = null;
let ringResetTimer: NodeJS.Timeout | null = null;

/**
 * GET /api/intercom/status
 * Pobiera aktualny stan domofonu (idle / ringing / unlocked)
 */
router.get('/status', (req: Request, res: Response) => {
    res.json({
        success: true,
        data: {
            ...state,
            now: Date.now()
        }
    });
});

/**
 * POST /api/intercom/ring
 * Wywołanie dzwonka (przez ESP32 przy furtce lub przycisk testowy na panelu)
 */
router.post('/ring', (req: Request, res: Response) => {
    state.status = 'ringing';
    state.lastRing = Date.now();

    console.log('🔔 [DOMOFON] Wykryto dzwonienie do furtki!');

    try {
        const io = getIO();
        io.emit('doorbell:ring', {
            timestamp: state.lastRing,
            source: req.body?.source || 'Furtka',
            message: 'Ktoś dzwoni do furtki!'
        });
    } catch (err: any) {
        console.warn('⚠️ [DOMOFON] Nie udało się wysłać eventu Socket.io:', err.message);
    }

    // Automatyczny powrót do stanu idle po 30s jeśli nikt nie zareaguje
    if (ringResetTimer) clearTimeout(ringResetTimer);
    ringResetTimer = setTimeout(() => {
        if (state.status === 'ringing') {
            state.status = 'idle';
            try {
                getIO().emit('doorbell:idle', { timestamp: Date.now() });
            } catch (err: any) {
                console.warn('⚠️ [DOMOFON] Błąd emisji doorbell:idle:', err.message);
            }
        }
    }, 30000);

    res.json({
        success: true,
        message: 'Dzwonek został wywołany pomyślnie',
        timestamp: state.lastRing
    });
});

/**
 * POST /api/intercom/unlock
 * Zdalne zwolnienie elektrozaczepu furtki (np. na 5 sekund)
 */
router.post('/unlock', (req: Request, res: Response) => {
    const durationSec = Number(req.body?.duration) || 5;
    const durationMs = durationSec * 1000;

    state.status = 'unlocked';
    state.unlockExpiresAt = Date.now() + durationMs;

    console.log(`🔓 [DOMOFON] Zwolniono rygiel furtki na ${durationSec}s!`);

    try {
        const io = getIO();
        io.emit('doorbell:unlock', {
            duration: durationSec,
            expiresAt: state.unlockExpiresAt
        });
    } catch (err: any) {
        console.warn('⚠️ [DOMOFON] Błąd Socket.io przy otwieraniu furtki:', err.message);
    }

    if (unlockTimer) clearTimeout(unlockTimer);
    unlockTimer = setTimeout(() => {
        state.status = 'idle';
        state.unlockExpiresAt = null;
        console.log('🔒 [DOMOFON] Rygiel zablokowany z powrotem.');
        try {
            getIO().emit('doorbell:locked', { timestamp: Date.now() });
        } catch (err: any) {
            console.warn('⚠️ [DOMOFON] Błąd emisji doorbell:locked:', err.message);
        }
    }, durationMs);

    res.json({
        success: true,
        message: `Furtka otwarta na ${durationSec} sekund`,
        duration: durationSec,
        expiresAt: state.unlockExpiresAt
    });
});

/**
 * POST /api/intercom/dismiss
 * Wyciszenie dzwonka / zamknięcie podglądu
 */
router.post('/dismiss', (req: Request, res: Response) => {
    if (state.status === 'ringing') {
        state.status = 'idle';
    }
    try {
        getIO().emit('doorbell:dismiss', { timestamp: Date.now() });
    } catch (err: any) {
        console.warn('⚠️ [DOMOFON] Błąd emisji doorbell:dismiss:', err.message);
    }

    res.json({ success: true, message: 'Dzwonek wyciszony' });
});

export default router;
