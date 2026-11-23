import { describe, it, expect, vi } from 'vitest';
import intercomRouter from '../src/routes/intercom';

// Mock Socket.io helpers
vi.mock('../src/helpers/socket', () => ({
    getIO: () => ({
        emit: vi.fn()
    })
}));

// Helper do wywoływania tras Express
const handleRequest = (method: string, path: string, body: any = {}) => {
    return new Promise<{ status: number; body: any }>((resolve) => {
        const req: any = { method, url: path, body };
        let statusCode = 200;
        const res: any = {
            status: (code: number) => {
                statusCode = code;
                return res;
            },
            json: (data: any) => {
                resolve({ status: statusCode, body: data });
            }
        };

        intercomRouter.handle(req, res, () => {
            resolve({ status: 404, body: { error: 'Not found' } });
        });
    });
};

describe('intercomRouter', () => {
    it('GET /status zwraca poprawny status domofonu', async () => {
        const res = await handleRequest('GET', '/status');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('status');
    });

    it('POST /ring uruchamia dzwonek i ustawia status ringing', async () => {
        const res = await handleRequest('POST', '/ring', { source: 'Furtka' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.timestamp).toBeDefined();

        const statusRes = await handleRequest('GET', '/status');
        expect(statusRes.body.data.status).toBe('ringing');
    });

    it('POST /unlock zwalnia rygiel furtki i ustawia status unlocked', async () => {
        const res = await handleRequest('POST', '/unlock', { duration: 5 });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.duration).toBe(5);

        const statusRes = await handleRequest('GET', '/status');
        expect(statusRes.body.data.status).toBe('unlocked');
    });

    it('POST /dismiss wycisza dzwonek', async () => {
        const res = await handleRequest('POST', '/dismiss');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});
