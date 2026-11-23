import { beforeEach, describe, expect, it, vi } from 'vitest';

const { ioMock, rooms, ackState } = vi.hoisted(() => {
    const rooms = new Map<string, Set<string>>();
    const ackState = {
        error: false,
        delay: 0,
        responses: [{ confirmed: true }]
    };
    const ioMock = {
        emit: vi.fn(),
        sockets: { adapter: { rooms } },
        to: vi.fn(() => ({
            timeout: vi.fn().mockReturnThis(),
            emit: vi.fn((_event: string, _payload: unknown, acknowledge: (error: Error | null, responses: unknown[]) => void) => {
                const acknowledgeCommand = () => {
                    acknowledge(ackState.error ? new Error('ack timeout') : null, ackState.responses);
                };
                if (ackState.delay) setTimeout(acknowledgeCommand, ackState.delay);
                else acknowledgeCommand();
            })
        }))
    };
    return { ioMock, rooms, ackState };
});

vi.mock('../src/helpers/socket', () => ({
    getIO: () => ioMock
}));

import intercomRouter from '../src/routes/intercom';

const handleRequest = (method: string, path: string, body: unknown = {}) => new Promise<{
    status: number;
    body: Record<string, any>;
}>((resolve) => {
    const req: any = { method, url: path, body };
    let statusCode = 200;
    const res: any = {
        status: (code: number) => {
            statusCode = code;
            return res;
        },
        json: (data: Record<string, any>) => resolve({ status: statusCode, body: data })
    };
    intercomRouter.handle(req, res, () => resolve({ status: 404, body: { error: 'Not found' } }));
});

describe('intercomRouter', () => {
    beforeEach(() => {
        vi.useRealTimers();
        rooms.clear();
        vi.clearAllMocks();
        ackState.error = false;
        ackState.delay = 0;
        ackState.responses = [{ confirmed: true }];
    });

    it('returns independent call and device readiness state', async () => {
        const response = await handleRequest('GET', '/status');

        expect(response.status).toBe(200);
        expect(response.body.data.callStatus).toBe('idle');
        expect(response.body.data.devices).toEqual({
            gate: expect.objectContaining({ available: false, status: 'not_configured' }),
            wicket: expect.objectContaining({ available: false, status: 'not_configured' })
        });
    });

    it('rings, answers once, and dismisses without treating acceptance as audio', async () => {
        const ring = await handleRequest('POST', '/ring', { source: 'Furtka' });
        expect(ring.status).toBe(200);

        const answer = await handleRequest('POST', '/answer');
        expect(answer.status).toBe(200);
        expect(answer.body.message).toContain('jednokierunkowym strumieniem MJPEG');
        expect((await handleRequest('POST', '/answer')).status).toBe(409);

        expect((await handleRequest('POST', '/dismiss')).body.dismissed).toBe(true);
        expect((await handleRequest('GET', '/status')).body.data.callStatus).toBe('idle');
        expect(ioMock.emit).toHaveBeenCalledWith('doorbell:ring', expect.objectContaining({ source: 'Furtka' }));
        expect(ioMock.emit).toHaveBeenCalledWith('doorbell:answered', expect.any(Object));
        expect(ioMock.emit).toHaveBeenCalledWith('doorbell:dismiss', expect.any(Object));
    });

    it('expires only an unanswered ring after 30 seconds', async () => {
        vi.useFakeTimers();
        await handleRequest('POST', '/ring');
        await vi.advanceTimersByTimeAsync(29_999);
        expect((await handleRequest('GET', '/status')).body.data.callStatus).toBe('ringing');

        await vi.advanceTimersByTimeAsync(1);
        expect((await handleRequest('GET', '/status')).body.data.callStatus).toBe('idle');
        expect(ioMock.emit).toHaveBeenCalledWith('doorbell:idle', expect.any(Object));
    });

    it('expires a stale ring when its timeout callback was delayed', async () => {
        vi.useFakeTimers();
        await handleRequest('POST', '/ring');
        vi.setSystemTime(Date.now() + 30_001);

        const status = await handleRequest('GET', '/status');

        expect(status.body.data.callStatus).toBe('idle');
        expect(ioMock.emit).toHaveBeenCalledWith('doorbell:idle', expect.any(Object));
    });

    it('rejects invalid unlock targets and durations and never claims an unconfigured device opened', async () => {
        expect((await handleRequest('POST', '/unlock', { target: 'garage', duration: 5 })).status).toBe(400);
        expect((await handleRequest('POST', '/unlock', { target: 'gate', duration: 0 })).status).toBe(400);
        expect((await handleRequest('POST', '/unlock', { target: 'wicket', duration: 1.5 })).status).toBe(400);

        const unlock = await handleRequest('POST', '/unlock', { target: 'wicket', duration: 5 });
        expect(unlock.status).toBe(503);
        expect(unlock.body.success).toBe(false);
        expect(unlock.body.code).toBe('DEVICE_UNAVAILABLE');
        expect(ioMock.emit).not.toHaveBeenCalledWith('doorbell:unlock', expect.anything());
    });

    it('does not broadcast a physical command to multiple controllers for the same target', async () => {
        rooms.set('intercom:device:gate', new Set(['gate-device-a', 'gate-device-b']));

        const status = (await handleRequest('GET', '/status')).body.data;
        const unlock = await handleRequest('POST', '/unlock', { target: 'gate', duration: 5 });

        expect(status.devices.gate.status).toBe('multiple_devices');
        expect(status.devices.gate.available).toBe(false);
        expect(unlock.status).toBe(409);
        expect(unlock.body.code).toBe('MULTIPLE_DEVICES');
    });

    it('keeps gate and wicket pulse timers independent from each other and the call state', async () => {
        vi.useFakeTimers();
        rooms.set('intercom:device:gate', new Set(['gate-device']));
        rooms.set('intercom:device:wicket', new Set(['wicket-device']));
        await handleRequest('POST', '/ring');

        const wicket = await handleRequest('POST', '/unlock', { target: 'wicket', duration: 2 });
        const gate = await handleRequest('POST', '/unlock', { target: 'gate', duration: 4 });
        expect(wicket.status).toBe(200);
        expect(gate.status).toBe(200);

        await vi.advanceTimersByTimeAsync(2_000);
        const midStatus = (await handleRequest('GET', '/status')).body.data;
        expect(midStatus.callStatus).toBe('ringing');
        expect(midStatus.devices.wicket.status).toBe('ready');
        expect(midStatus.devices.gate.status).toBe('pulse_active');

        await vi.advanceTimersByTimeAsync(2_000);
        const finalStatus = (await handleRequest('GET', '/status')).body.data;
        expect(finalStatus.callStatus).toBe('ringing');
        expect(finalStatus.devices.gate.status).toBe('ready');
        expect(ioMock.emit).toHaveBeenCalledWith('doorbell:unlock:confirmed', expect.objectContaining({ target: 'gate' }));
        expect(ioMock.emit).toHaveBeenCalledWith('doorbell:unlock:ended', expect.objectContaining({ target: 'wicket' }));
    });

    it('never reports a failed, timed-out, or late device acknowledgement as a successful unlock', async () => {
        vi.useFakeTimers();
        rooms.set('intercom:device:gate', new Set(['gate-device']));
        ackState.responses = [{ confirmed: false }];
        const rejected = await handleRequest('POST', '/unlock', { target: 'gate', duration: 5 });
        expect(rejected.status).toBe(502);
        expect(rejected.body.success).toBe(false);

        ackState.responses = [{ confirmed: true }];
        ackState.error = true;
        const timedOut = await handleRequest('POST', '/unlock', { target: 'gate', duration: 5 });
        expect(timedOut.status).toBe(504);
        expect(timedOut.body.code).toBe('DEVICE_ACK_TIMEOUT');

        ackState.error = false;
        ackState.delay = 1_000;
        const lateResponse = handleRequest('POST', '/unlock', { target: 'gate', duration: 1 });
        await vi.advanceTimersByTimeAsync(1_000);
        const late = await lateResponse;
        expect(late.status).toBe(502);
        expect(late.body.code).toBe('DEVICE_ACK_EXPIRED');
        expect(ioMock.emit).not.toHaveBeenCalledWith('doorbell:unlock', expect.anything());
    });

    it('rejects concurrent commands for the same actuator while allowing independent targets', async () => {
        vi.useFakeTimers();
        rooms.set('intercom:device:gate', new Set(['gate-device']));
        rooms.set('intercom:device:wicket', new Set(['wicket-device']));
        ackState.delay = 100;

        const gateCommand = handleRequest('POST', '/unlock', { target: 'gate', duration: 5 });
        const duplicateGate = await handleRequest('POST', '/unlock', { target: 'gate', duration: 5 });
        const wicketCommand = handleRequest('POST', '/unlock', { target: 'wicket', duration: 5 });
        expect(duplicateGate.status).toBe(409);

        await vi.advanceTimersByTimeAsync(100);
        expect((await gateCommand).status).toBe(200);
        expect((await wicketCommand).status).toBe(200);
    });
});
