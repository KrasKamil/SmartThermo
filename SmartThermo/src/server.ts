import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import axios from 'axios';
import querystring from 'querystring';
import { MongoClient } from 'mongodb'; 

// Ładowanie zmiennych środowiskowych
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8888;
const MONGO_URL = process.env.MONGO_URL || "mongodb://127.0.0.1:27017"; // [DODANO] URL bazy

// Middleware
app.use(cors());
app.use(express.json()); // [DODANO] Obsługa JSON
app.use(express.static(path.join(__dirname, '../'))); // Serwowanie plików frontendu

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI;

// --- [NOWOŚĆ] ENDPOINT POGODOWY (z pliku routes.ts) ---

app.get('/api/weather', async (req: Request, res: Response) => {
    // SZPIEG 1: Czy zapytanie w ogóle dociera?
    console.log("👉 Otrzymano zapytanie GET /api/weather"); 

    const client = new MongoClient(MONGO_URL);

    try {
        await client.connect();
        const database = client.db("smartthermodatabase");
        const collection = database.collection("weatherdata");
        
        const result = await collection.findOne({}); 

        // SZPIEG 2: Co zwróciła baza?
        console.log("👉 Wynik z MongoDB:", result); 

        if (result) {
            res.json(result);
        } else {
            console.log("👉 Baza jest pusta! Zwracam 404.");
            res.status(404).json({ error: "Brak danych w bazie" });
        }
    } catch (error) {
        console.error("👉 Błąd połączenia:", error);
        res.status(500).json({ error: "Błąd połączenia z bazą" });
    } finally {
        await client.close();
    }
});

// --- KONIEC NOWEGO ENDPOINTU ---


// --- ENDPOINTY SPOTIFY (Bez zmian) ---
app.get('/login', (req: Request, res: Response) => {
    const scope = 'user-read-private user-read-email user-read-playback-state user-modify-playback-state streaming';
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

app.get('/callback', async (req: Request, res: Response) => {
    const code = req.query.code || null;
    const state = req.query.state || null;

    if (state === null) {
        res.redirect('/#' + querystring.stringify({ error: 'state_mismatch' }));
    } else {
        try {
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
            
            res.redirect(`http://localhost:${PORT}/vapage.html#` + 
                querystring.stringify({ access_token, refresh_token }));

        } catch (error) {
            console.error('Błąd autoryzacji:', error);
            res.redirect(`http://localhost:${PORT}/vapage.html#error=invalid_token`);
        }
    }
});

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
    console.log(`✅ Serwer działa na http://localhost:${PORT}`);
    console.log(`🔗 Frontend: http://localhost:${PORT}/vapage.html`);
    console.log(`📡 API Pogodowe: http://localhost:${PORT}/api/weather`);
});