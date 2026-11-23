import { randomUUID } from 'crypto';
import { Router, Request, Response } from 'express';
import { getIO } from '../helpers/socket';

const router = Router();
const targets = ['gate', 'wicket'] as const;
type Target = typeof targets[number];
type CallStatus = 'idle' | 'ringing' | 'answered';

interface TargetState {
    pulseExpiresAt: number | null;
}

interface IntercomState {
    callStatus: CallStatus;
    lastRing: number | null;
    answeredAt: number | null;
    callId: string | null;
    revision: number;
    actuators: Record<Target, TargetState>;
}

const state: IntercomState = {
    callStatus: 'idle',
    lastRing: null,
    answeredAt: null,
    callId: null,
    revision: 0,
    actuators: {
        gate: { pulseExpiresAt: null },
        wicket: { pulseExpiresAt: null }
    }
};

const actuatorTimers = new Map<Target, NodeJS.Timeout>();
const pendingActuators = new Set<Target>();
let ringResetTimer: NodeJS.Timeout | null = null;
const ringTimeoutMs = 30_000;
const actuatorAckTimeoutMs = 5_000;

const deviceRoom = (target: Target) => `intercom:device:${target}`;
const isTarget = (value: unknown): value is Target => value === 'gate' || value === 'wicket';

const getDeviceCount = (target: Target) => {
    const io = getIO();
    return io.sockets.adapter.rooms.get(deviceRoom(target))?.size || 0;
};

const getStatus = () => {
    const now = Date.now();
    return {
        success: true,
        data: {
            status: state.callStatus,
            callStatus: state.callStatus,
            lastRing: state.lastRing,
            answeredAt: state.answeredAt,
            callId: state.callId,
            revision: state.revision,
            devices: Object.fromEntries(targets.map((target) => {
                const connectedCount = getDeviceCount(target);
                const pulseExpiresAt = state.actuators[target].pulseExpiresAt;
                return [target, {
                    configured: connectedCount > 0,
                    available: connectedCount === 1,
                    status: connectedCount === 0
                        ? 'not_configured'
                        : connectedCount > 1
                            ? 'multiple_devices'
                            : pulseExpiresAt && pulseExpiresAt > now
                                ? 'pulse_active'
                                : 'ready',
                    pulseExpiresAt
                }];
            })),
            now
        }
    };
};

const clearRingTimeout = () => {
    if (ringResetTimer) clearTimeout(ringResetTimer);
    ringResetTimer = null;
};

const emitCallState = (event: string, extra: Record<string, unknown> = {}) => {
    getIO().emit(event, {
        timestamp: Date.now(),
        callStatus: state.callStatus,
        callId: state.callId,
        revision: state.revision,
        ...extra
    });
};

const expireRingingCallIfNeeded = () => {
    if (state.callStatus !== 'ringing') return;
    const ringAge = state.lastRing === null ? ringTimeoutMs : Date.now() - state.lastRing;
    if (ringAge < ringTimeoutMs) return;

    clearRingTimeout();
    state.callStatus = 'idle';
    state.answeredAt = null;
    state.revision += 1;
    emitCallState('doorbell:idle');
};

router.get('/status', (_req: Request, res: Response) => {
    expireRingingCallIfNeeded();
    res.json(getStatus());
});

router.post('/ring', (req: Request, res: Response) => {
    state.callStatus = 'ringing';
    state.lastRing = Date.now();
    state.answeredAt = null;
    state.callId = randomUUID();
    state.revision += 1;
    clearRingTimeout();
    emitCallState('doorbell:ring', {
        source: typeof req.body?.source === 'string' ? req.body.source : 'Furtka',
        message: 'Ktoś dzwoni do furtki'
    });

    const activeCallId = state.callId;
    ringResetTimer = setTimeout(() => {
        if (state.callStatus !== 'ringing' || state.callId !== activeCallId) return;
        expireRingingCallIfNeeded();
    }, ringTimeoutMs);

    res.json({
        success: true,
        message: 'Dzwonek został zgłoszony',
        timestamp: state.lastRing,
        callId: state.callId,
        revision: state.revision
    });
});

router.post('/answer', (_req: Request, res: Response) => {
    if (state.callStatus !== 'ringing') {
        return res.status(409).json({ success: false, message: 'Nie ma aktywnego dzwonienia' });
    }

    clearRingTimeout();
    state.callStatus = 'answered';
    state.answeredAt = Date.now();
    state.revision += 1;
    emitCallState('doorbell:answered', { answeredAt: state.answeredAt });
    return res.json({
        success: true,
        message: 'Powiadomienie odebrane; obraz pozostaje jednokierunkowym strumieniem MJPEG',
        timestamp: state.answeredAt,
        callId: state.callId,
        revision: state.revision
    });
});

router.post('/unlock', async (req: Request, res: Response) => {
    const { target, duration } = req.body || {};
    if (!isTarget(target)) {
        return res.status(400).json({ success: false, message: 'Cel musi być równy gate albo wicket' });
    }
    if (!Number.isInteger(duration) || duration < 1 || duration > 15) {
        return res.status(400).json({ success: false, message: 'Czas impulsu musi być liczbą całkowitą od 1 do 15 sekund' });
    }
    const connectedCount = getDeviceCount(target);
    if (connectedCount === 0) {
        return res.status(503).json({
            success: false,
            code: 'DEVICE_UNAVAILABLE',
            target,
            message: `Sterownik ${target === 'gate' ? 'bramy' : 'furtki'} nie jest skonfigurowany ani połączony`
        });
    }
    if (connectedCount !== 1) {
        return res.status(409).json({
            success: false,
            code: 'MULTIPLE_DEVICES',
            target,
            message: 'Dla tego celu musi być połączony dokładnie jeden sterownik'
        });
    }
    if (pendingActuators.has(target)) {
        return res.status(409).json({
            success: false,
            code: 'COMMAND_IN_PROGRESS',
            target,
            message: 'Dla tego sterownika trwa już oczekiwanie na potwierdzenie'
        });
    }

    const commandId = randomUUID();
    const requestedAt = Date.now();
    const expiresAt = requestedAt + duration * 1000;
    const payload = { commandId, target, duration, expiresAt, requestedAt };
    const io = getIO();
    pendingActuators.add(target);
    try {
        io.emit('doorbell:unlock:requested', payload);
        const acknowledgement = await new Promise<{ error: Error | null; responses: unknown[] }>((resolve) => {
            io.to(deviceRoom(target)).timeout(actuatorAckTimeoutMs).emit(
                'doorbell:unlock:command',
                payload,
                (error: Error | null, acknowledgements: unknown[]) => {
                    resolve({ error, responses: acknowledgements || [] });
                }
            );
        });
        if (acknowledgement.error) {
            io.emit('doorbell:unlock:failed', { ...payload, reason: 'ack_timeout' });
            return res.status(504).json({
                success: false,
                code: 'DEVICE_ACK_TIMEOUT',
                target,
                commandId,
                message: 'Przekroczono czas oczekiwania na potwierdzenie sterownika'
            });
        }
        const confirmation = acknowledgement.responses.find((response) =>
            typeof response === 'object' && response !== null &&
            'confirmed' in response && (response as { confirmed: unknown }).confirmed === true
        );
        if (!confirmation || Date.now() >= expiresAt) {
            const reason = confirmation ? 'ack_expired' : 'not_confirmed';
            io.emit('doorbell:unlock:failed', { ...payload, reason });
            return res.status(502).json({
                success: false,
                code: confirmation ? 'DEVICE_ACK_EXPIRED' : 'DEVICE_NOT_CONFIRMED',
                target,
                commandId,
                message: confirmation
                    ? 'Potwierdzenie sterownika dotarło po wygaśnięciu polecenia'
                    : 'Sterownik nie potwierdził uruchomienia impulsu'
            });
        }

        const previousTimer = actuatorTimers.get(target);
        if (previousTimer) clearTimeout(previousTimer);
        state.actuators[target].pulseExpiresAt = expiresAt;
        const timer = setTimeout(() => {
            actuatorTimers.delete(target);
            state.actuators[target].pulseExpiresAt = null;
            io.emit('doorbell:unlock:ended', {
                commandId,
                target,
                timestamp: Date.now(),
                message: 'Impuls sterownika zakończony; położenie fizycznej bramy lub furtki nie jest monitorowane'
            });
        }, Math.max(0, expiresAt - Date.now()));
        actuatorTimers.set(target, timer);

        const confirmedAt = Date.now();
        io.emit('doorbell:unlock:confirmed', { ...payload, confirmedAt });
        io.emit('doorbell:unlock', { ...payload, confirmed: true, confirmedAt });
        return res.json({
            success: true,
            message: 'Sterownik potwierdził uruchomienie impulsu',
            target,
            duration,
            commandId,
            requestedAt,
            confirmedAt,
            expiresAt,
            confirmed: true
        });
    } finally {
        pendingActuators.delete(target);
    }
});

router.post('/dismiss', (_req: Request, res: Response) => {
    const wasActive = state.callStatus !== 'idle';
    if (wasActive) {
        clearRingTimeout();
        state.callStatus = 'idle';
        state.answeredAt = null;
        state.revision += 1;
        emitCallState('doorbell:dismiss');
    }
    return res.json({
        success: true,
        dismissed: wasActive,
        message: wasActive ? 'Dzwonek wyciszony' : 'Brak aktywnego dzwonienia',
        revision: state.revision
    });
});

export default router;
