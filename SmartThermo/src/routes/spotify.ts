// src/routes/spotify.ts
import { Router, Request, Response } from 'express';
import axios from 'axios';

const router = Router();

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI; // np. http://localhost:8888/callback

// 1. Logowanie
router.get('/login', (req: Request, res: Response) => {
    const scope = 'user-read-private user-read-email user-read-playback-state user-modify-playback-state streaming';
    const state = Math.random().toString(36).substring(7);

    const params = new URLSearchParams({
        response_type: 'code',
        client_id: CLIENT_ID || '',
        scope: scope,
        redirect_uri: REDIRECT_URI || '',
        state: state
    });

    res.redirect('https://accounts.spotify.com/authorize?' + params.toString());
});

// 2. Callback
router.get('/callback', async (req: Request, res: Response) => {
    const code = (req.query.code as string) || null;
    
    if (!code) {
        return res.redirect('/vapage.html#error=no_code');
    }

    try {
        const params = new URLSearchParams({
            code: code,
            redirect_uri: REDIRECT_URI || '',
            grant_type: 'authorization_code'
        });

        const response = await axios.post('https://accounts.spotify.com/api/token', params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + (Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'))
            }
        });

        const { access_token, refresh_token } = response.data;

        // Przekierowanie do frontendu z tokenami
        const redirectParams = new URLSearchParams({ access_token, refresh_token });
        res.redirect(`http://localhost:8888/vapage.html#` + redirectParams.toString());

    } catch (error) {
        console.error("Spotify Auth Error:", error);
        res.redirect(`/vapage.html#error=invalid_token`);
    }
});

// 3. Odświeżanie tokena (TO JEST KLUCZOWE)
router.get('/refresh_token', async (req: Request, res: Response) => {
    const refresh_token = req.query.refresh_token as string;
    
    if (!refresh_token) return res.status(400).send("Brak refresh_token");

    try {
        const params = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refresh_token
        });

        const response = await axios.post('https://accounts.spotify.com/api/token', params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + (Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'))
            }
        });

        // Zwracamy nowy, świeży access_token
        res.json({ access_token: response.data.access_token });
    } catch (error) { 
        console.error("Błąd odświeżania tokena");
        res.status(500).send('Could not refresh token'); 
    }
});

// 4. Status
router.get('/status', async (req: Request, res: Response) => {
    const accessToken = req.query.access_token as string;

    if (!accessToken) return res.json({ isPlaying: false });

    try {
        const response = await axios.get('https://api.spotify.com/v1/me/player', {
            headers: { 'Authorization': 'Bearer ' + accessToken }
        });

        if (response.status === 204 || !response.data || !response.data.item) {
            return res.json({ isPlaying: false });
        }

        const data = response.data;
        res.json({
            isPlaying: data.is_playing,
            source: 'Spotify',
            title: data.item.name,
            artist: data.item.artists.map((a: any) => a.name).join(', '),
            album: data.item.album.name,
            cover: data.item.album.images[0]?.url || '',
        });

    } catch (error: any) {
        // Jeśli Spotify zwróci 401 (Unauthorized), informujemy frontend, że trzeba odświeżyć token
        if (error.response && error.response.status === 401) {
            return res.status(401).json({ error: "Token expired" });
        }
        res.json({ isPlaying: false });
    }
});

export default router;