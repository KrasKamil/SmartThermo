import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// Używamy aliasu, który u Ciebie działa
const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

// Definiujemy interfejs zwracanych danych, żeby TypeScript był szczęśliwy
interface LlmResponse {
    text: string;
    command: string | null;
    param: string | null;
}

const SYSTEM_INSTRUCTION = `
Jesteś inteligentnym asystentem domu "SmartThermo".
Twoim zadaniem jest krótko i konkretnie odpowiadać na pytania oraz sterować multimediami.

DOSTĘPNE AKCJE (Wstaw na końcu odpowiedzi tag):
- Włączenie konkretnego radia: [ACTION:RADIO_PLAY:NazwaStacji] (np. [ACTION:RADIO_PLAY:RMF], [ACTION:RADIO_PLAY:ZET], [ACTION:RADIO_PLAY:ESKA])
- Jeśli użytkownik mówi tylko "włącz radio", wybierz domyślne: [ACTION:RADIO_PLAY:RMF]
- Włączenie Spotify: [ACTION:SPOTIFY_PLAY]
- Stop: [ACTION:MEDIA_STOP]
- Następny/Poprzedni: [ACTION:MEDIA_NEXT] / [ACTION:MEDIA_PREV]
- Głośność: [ACTION:VOL_UP] / [ACTION:VOL_DOWN]
- Zmiana motywu: [ACTION:THEME_TOGGLE]

ZASADY:
1. Odpowiadaj krótko i naturalnie (np. "Jasne, włączam Eskę!").
2. Jeśli nie rozpoznasz stacji, włącz RMF.
`;

export const processUserQuery = async (userText: string, homeContext: any): Promise<LlmResponse> => {
    try {
        console.log(`🤖 LLM Start: "${userText}"`);

        const contextDescription = `
        STAN DOMU:
        - Temp: ${homeContext.temp_ins || '?'}°C
        - Gra: ${homeContext.isRadioPlaying ? 'Radio' : 'Nic'}
        `;

        const fullPrompt = `${SYSTEM_INSTRUCTION}
        ${contextDescription}
        UŻYTKOWNIK: ${userText}
        ASYSTENT:`;

        const result = await model.generateContent(fullPrompt);
        const response = await result.response;
        const text = response.text();

        console.log(`🤖 LLM Odpowiedź: "${text}"`);

        // --- PARSER ---
        let command: string | null = null; // Jawne typowanie
        let param: string | null = null;   // Jawne typowanie
        let cleanText = text;

        const match = text.match(/\[ACTION:([A-Z_]+)(?::(.*))?\]/);
        
        if (match) {
            command = match[1];      
            param = match[2] ? match[2].trim() : null; 
            cleanText = text.replace(match[0], '').trim();
        }

        return { text: cleanText, command, param };

    } catch (error: any) {
        console.error("❌ LLM Error:", error.message);
        return { text: "Przepraszam, błąd połączenia.", command: null, param: null };
    }
};