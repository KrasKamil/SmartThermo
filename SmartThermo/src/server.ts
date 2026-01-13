import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import axios from 'axios';
import querystring from 'querystring';

// Ładowanie zmiennych środowiskowych
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8888;

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname, '../'))); // Serwowanie plików frontendu (vapage.html, itp.)

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI;

// --- ENDPOINTY SPOTIFY ---

// 1. Login: Przekierowuje użytkownika do Spotify w celu autoryzacji
app.get('/login', (req: Request, res: Response) => {
    const scope = 'user-read-private user-read-email user-read-playback-state user-modify-playback-state streaming';
    
    // Generujemy losowy ciąg (state) dla bezpieczeństwa (opcjonalne, ale zalecane)
    const state = Math.random().toString(36).substring(7);

    res.redirect('https://accounts.spotify.com/authorize?' +
        querystring.stringify({
            response_type: 'code',
            client_id: CLIENT_ID,
            scope: scope,
            redirect_uri: REDIRECT_URI,
            state: state
        }));
});

// 2. Callback: Spotify odsyła użytkownika tutaj z kodem autoryzacyjnym
app.get('/callback', async (req: Request, res: Response) => {
    const code = req.query.code || null;
    const state = req.query.state || null;

    if (state === null) {
        res.redirect('/#' + querystring.stringify({ error: 'state_mismatch' }));
    } else {
        try {
            // Wymiana kodu na Access Token (bezpiecznie po stronie serwera)
            const response = await axios({
                method: 'post',
                url: 'https://accounts.spotify.com/api/token',
                data: querystring.stringify({
                    code: code as string,
                    redirect_uri: REDIRECT_URI,
                    grant_type: 'authorization_code'
                }),
                headers: {
                    'content-type': 'application/x-www-form-urlencoded',
                    'Authorization': 'Basic ' + (Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'))
                },
            });

            const { access_token, refresh_token } = response.data;

            // Przekierowanie z powrotem na frontend z tokenem w URL
            // (W produkcyjnych aplikacjach bankowych używa się tu HttpOnly Cookies, 
            // ale dla Web Playback SDK musimy przekazać token do JS)
            
            res.redirect(`http://localhost:${PORT}/vapage.html#` + 
                querystring.stringify({ access_token, refresh_token }));

        } catch (error) {
            console.error('Błąd autoryzacji:', error);
            res.redirect(`http://localhost:${PORT}/vapage.html#error=invalid_token`);
        }
    }
});

// 3. Refresh Token: Frontend prosi o nowy token, gdy stary wygaśnie
app.get('/refresh_token', async (req: Request, res: Response) => {
    const refresh_token = req.query.refresh_token as string;
    
    try {
        const response = await axios({
            method: 'post',
            url: 'https://accounts.spotify.com/api/token',
            data: querystring.stringify({
                grant_type: 'refresh_token',
                refresh_token: refresh_token
            }),
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + (Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'))
            },
        });

        res.send({
            'access_token': response.data.access_token
        });
    } catch (error) {
        res.status(500).send('Could not refresh token');
    }
});

// Start serwera
app.listen(PORT, () => {
    console.log(`✅ Serwer działa bezpiecznie na http://localhost:${PORT}`);
    console.log(`🔗 Frontend dostępny na http://localhost:${PORT}/vapage.html`);
});