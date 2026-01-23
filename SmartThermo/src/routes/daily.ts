import { Router } from 'express';
import axios from 'axios';
// Importujemy naszą lokalną bazę
import { namedays } from '../data/imieniny'; 

const router = Router();

router.get('/', async (req, res) => {
    try {
        const today = new Date();
        const month = String(today.getMonth() + 1).padStart(2, '0'); // MM
        const day = String(today.getDate()).padStart(2, '0'); // DD
        
        // Klucz do naszej mapy, np. "01-23"
        const dateKey = `${month}-${day}`;

        // 1. Imieniny - POBIERANE LOKALNIE
        const imieniny = namedays[dateKey] || "Brak danych o imieninach";

        // 2. Wydarzenie historyczne
        // ZMIANA: Używamy 'en.wikipedia.org', bo 'pl' nie ma tego API.
        // ZMIANA: Dodajemy User-Agent (wymagane przez Wiki, inaczej mogą zablokować)
        const historyPromise = axios.get(
            `https://en.wikipedia.org/api/rest_v1/feed/onthisday/selected/${month}/${day}`,
            { 
                timeout: 3000,
                headers: {
                    'User-Agent': 'MyDailyApp/1.0 (moj-email@example.com)' // Warto tu wpisać cokolwiek unikalnego
                }
            }
        );

        let randomEvent = { text: "Dziś jest spokojny dzień.", year: today.getFullYear() };
        
        try {
            const historyRes = await historyPromise;
            const events = historyRes.data.selected;
            
            if (events && events.length > 0) {
                const selected = events[Math.floor(Math.random() * events.length)];
                randomEvent = {
                    year: selected.year,
                    // Tekst przyjdzie po angielsku. Można tu ewentualnie podpiąć szybkie tłumaczenie 
                    // lub zostawić jak jest, skoro polskie API nie działa.
                    text: selected.text 
                };
            }
        } catch (wikiError) {
            console.warn("Nie udało się pobrać historii z Wiki:", wikiError.message);
            // Fallback - jeśli Wiki padnie, nie psujemy imienin
        }

        res.json({
            date: `${day}.${month}`,
            imieniny: imieniny,
            event: randomEvent
        });

    } catch (error) {
        console.error("Krytyczny błąd widgetu dziennego:", error);
        res.status(500).json({
            date: "Dzisiaj",
            imieniny: "Błąd systemu",
            event: { year: 2026, text: "Awaria widgetu." }
        });
    }
});

export default router;