import { Router, Request, Response } from 'express';
import { processUserQuery } from '../services/llmService';
import axios from 'axios';
// IMPORTUJEMY TWOJĄ BAZĘ STACJI
import { RADIO_STATIONS } from '../helpers/system';

const router = Router();

router.post('/query', async (req: Request, res: Response) => {
    try {
        const { text } = req.body;
        if (!text) return res.status(400).json({ error: "Brak tekstu" });

        console.log(`🎤 Voice Input: "${text}"`);

        // Mock kontekstu
        const homeContext = {
            temp_ins: 21.5,
            isRadioPlaying: false
        };

        const aiResponse = await processUserQuery(text, homeContext);

        if (aiResponse.command) {
            await executeCommand(aiResponse.command, aiResponse.param);
        }

        res.json(aiResponse);

    } catch (error) {
        console.error("Voice Route Error:", error);
        res.status(500).json({ text: "Błąd przetwarzania głosu." });
    }
});

async function executeCommand(cmd: string, param: string | null) {
    console.log(`🔧 KOMENDA: ${cmd} | PARAM: ${param}`);
    
    const port = process.env.PORT || 8888;
    const apiUrl = `http://localhost:${port}/api/media/control`;
    const apiKey = process.env.API_KEY || 'default_key';

    let action = '';
    let value: any = null;

    switch (cmd) {
        case 'RADIO_PLAY': 
            action = 'play_radio';
            
            // LOGIKA SZUKANIA STACJI W TWOIM PLIKU SYSTEM.TS
            const searchKey = param ? param.toLowerCase().trim() : 'rmf';
            
            // Szukamy stacji, której ID lub Tytuł zawiera to, co powiedziało AI
            // np. "eska" znajdzie "eskarock", "rmf" znajdzie "rmf fm"
            let foundStation = RADIO_STATIONS.find(s => 
                s.id.toLowerCase().includes(searchKey) || 
                s.title.toLowerCase().includes(searchKey)
            );

            // Jeśli nie znaleziono, bierzemy pierwszą z listy (zazwyczaj RMF)
            if (!foundStation) {
                console.log(`⚠️ Nie znaleziono stacji "${searchKey}", włączam domyślną.`);
                foundStation = RADIO_STATIONS[0];
            }

            console.log(`📻 Wybrano stację: ${foundStation.title}`);
            
            // Formatujemy dane tak, jak oczekuje endpoint media.ts
            value = {
                title: foundStation.title,
                url: foundStation.streamUrl
            };
            break;

        case 'SPOTIFY_PLAY':
            action = 'start_spotify';
            break;
            
        case 'MEDIA_STOP': action = 'stop_radio'; break;
        case 'MEDIA_NEXT': action = 'next'; break;
        case 'MEDIA_PREV': action = 'prev'; break;
        case 'VOL_UP': action = 'volume_up'; break;
        case 'VOL_DOWN': action = 'volume_down'; break;
        case 'THEME_TOGGLE': return; 
    }

    if (action) {
        try {
            await axios.post(apiUrl, { action, value }, { headers: { 'x-api-key': apiKey } });
        } catch (e: any) {
            console.error("❌ Błąd API mediów:", e.message);
        }
    }
}

export default router;