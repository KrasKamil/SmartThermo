// src/routes/spotify.ts
import { Router, Request, Response } from 'express';
import axios from 'axios';
import querystring from 'querystring';

const router = Router();

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI;

router.get('/login', (req: Request, res: Response) => {
    const scope = 'user-read-private user-read-email user-read-playback-state user-modify-playback-state streaming';
    const state = Math.random().toString(36).substring(7);
    res.redirect('https://accounts.spotify.com/authorize?' +
        querystring.stringify({
            response_type: 'code', client_id: CLIENT_ID, scope: scope, redirect_uri: REDIRECT_URI, state: state
        }));
});

router.get('/callback', async (req: Request, res: Response) => {
    const code = req.query.code || null;
    const state = req.query.state || null;

    if (state === null) {
        res.redirect('/#' + querystring.stringify({ error: 'state_mismatch' }));
    } else {
        try {
            const response = await axios({
                method: 'post', url: 'https://accounts.spotify.com/api/token',
                data: querystring.stringify({ code: code as string, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code' }),
                headers: { 'content-type': 'application/x-www-form-urlencoded', 'Authorization': 'Basic ' + (Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')) },
            });
            const { access_token, refresh_token } = response.data;
            // Uwaga: Zakładam, że port 8888 jest stały, można to przenieść do env
            res.redirect(`http://localhost:8888/vapage.html#` + querystring.stringify({ access_token, refresh_token }));
        } catch (error) {
            res.redirect(`http://localhost:8888/vapage.html#error=invalid_token`);
        }
    }
});

router.get('/refresh_token', async (req: Request, res: Response) => {
    const refresh_token = req.query.refresh_token as string;
    try {
        const response = await axios({
            method: 'post', url: 'https://accounts.spotify.com/api/token',
            data: querystring.stringify({ grant_type: 'refresh_token', refresh_token: refresh_token }),
            headers: { 'content-type': 'application/x-www-form-urlencoded', 'Authorization': 'Basic ' + (Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')) },
        });
        res.send({ 'access_token': response.data.access_token });
    } catch (error) { res.status(500).send('Could not refresh token'); }
});

export default router;