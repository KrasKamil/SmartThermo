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
const MONGO_URL = process.env.MONGO_URL || ""; 

// Middleware
app.use(cors());
app.use(express.json()); 
app.use(express.static(path.join(__dirname, '../')));

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI;

// --- 1. ENDPOINT POGODOWY (SAFE MODE / OFFLINE) ---

app.get('/api/weather', async (req: Request, res: Response) => {
    console.log("👉 Otrzymano zapytanie GET /api/weather"); 

    // Dane zastępcze (Offline)
    const offlineData = {
        city: "Offline City",
        temp_ins: "21.5 °C",
        hum_ins: "42 %",
        pressure: "1010 hPa",
        temp_out: "12 °C",
        wind: "8 km/h",
        due_date: new Date().toLocaleString()
    };

    // Jeśli brak URL do bazy lub jest on domyślny/zły
    if (!MONGO_URL || MONGO_URL.includes("your_password")) {
        console.log("⚠️ Brak poprawnego MONGO_URL. Zwracam dane OFFLINE.");
        return res.json(offlineData);
    }

    const client = new MongoClient(MONGO_URL);

    try {
        await client.connect();
        const database = client.db("smartthermodatabase");
        const collection = database.collection("weatherdata");
        
        const result = await collection.findOne({}); 

        if (result) {
            console.log("✅ Pobrano dane z MongoDB");
            res.json(result);
        } else {
            console.log("⚠️ Baza połączona, ale pusta. Zwracam dane OFFLINE.");
            res.json(offlineData);
        }
    } catch (error) {
        console.error("❌ Błąd połączenia z MongoDB (to normalne bez hasła).");
        console.log("👉 Przełączam na tryb awaryjny (Offline Data).");
        res.json(offlineData); 
    } finally {
        try { await client.close(); } catch(e) {}
    }
});

// --- 2. ENDPOINTY SPOTIFY ---

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
        res.send({ 'access_token': response.data.access_token });
    } catch (error) {
        res.status(500).send('Could not refresh token');
    }
});

// --- NOWY ENDPOINT: LISTA STACJI (WERSJA AWARYJNA HTTP) ---

app.get('/api/radio/list', (req: Request, res: Response) => {
    const stations = [
        { 
            id: "rmf", 
            title: "RMF FM", 
            subtitle: "Muzyka", 
            // To działało, więc zostawiamy
            streamUrl: "http://217.74.72.12:8000/rmf_fm" 
        },
        
        { 
            id: "rmfclassic", 
            title: "RMF Classic", 
            subtitle: "Filmowa", 
            // To działało
            streamUrl: "http://217.74.72.12:8000/rmf_classic" 
        },
        { 
            id: "zet", 
            title: "Radio ZET", 
            subtitle: "Rozrywka", 
            // Brutalne HTTP na porcie 8400 (omija DNS głównej strony)
            streamUrl: "http://zet-net-01.cdn.eurozet.pl:8400/listen.pls" 
        },
        { 
            id: "eskarock", 
            title: "Eska Rock", 
            subtitle: "Rock/Alt", 
            // Serwer "ic2" (zamiast stream.smcloud) - często działa stabilniej
            streamUrl: "http://ic2.smcdn.pl:8000/2380-1.mp3" 
        },
        { 
            id: "vox", 
            title: "VOX FM", 
            subtitle: "Disco", 
            // Serwer "ic2"
            streamUrl: "http://ic2.smcdn.pl:8000/3990-1.mp3" 
        },
        {
            id: "tok",
            title: "TOK FM",
            subtitle: "News",
            streamUrl: "http://ic2.smcdn.pl:8000/2400-1.mp3"
        }
    ];

    res.json(stations);
});
   

// --- START SERWERA ---
app.listen(PORT, () => {
    console.log(`✅ Serwer działa na http://localhost:${PORT}`);
    console.log(`🔗 Frontend: http://localhost:${PORT}/vapage.html`);
    console.log(`📡 API Pogodowe: http://localhost:${PORT}/api/weather`);
});