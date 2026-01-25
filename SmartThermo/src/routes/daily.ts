// src/routes/daily.ts
import { Router } from 'express';
import axios from 'axios';
import Parser from 'rss-parser';
// Importujemy naszą lokalną bazę
import { namedays } from '../data/imieniny'; 

const router = Router();
const parser = new Parser();

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
        const historyPromise = axios.get(
            `https://en.wikipedia.org/api/rest_v1/feed/onthisday/selected/${month}/${day}`,
            { 
                timeout: 3000,
                headers: {
                    'User-Agent': 'MyDailyApp/1.0 (moj-email@example.com)' 
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
                    text: selected.text 
                };
            }
        } catch (wikiError) {
            console.warn("Nie udało się pobrać historii z Wiki:", wikiError.message);
        }

        // 3. Wiadomości RSS
        let news: any[] = [];
        try {
            // Ciekawszy feed: Google News PL - Nauka i Technologia
            // Tech feed 
            //const feedUrl = 'https://news.google.com/rss/headlines/section/topic/SCITECH?hl=pl&gl=PL&ceid=PL:pl';
                    
            const feedUrl = 'https://news.google.com/rss/headlines/section/topic/WORLD?hl=pl&gl=PL&ceid=PL:pl';
            const feed = await parser.parseURL(feedUrl);
            
            // Pobieramy 3 elementy i mapujemy na obiekt (nie tylko tytuł!)
            news = feed.items.slice(0, 3).map(item => ({
                title: item.title,
                link: item.link,
                snippet: item.contentSnippet ? item.contentSnippet.substring(0, 100) + "..." : "Kliknij, aby przeczytać więcej."
            }));
        } catch (rssError) {
            console.warn("Błąd RSS:", rssError.message);
            news = [{ title: "Nie udało się pobrać wiadomości.", link: "#", snippet: "" }];
        }

        res.json({
            date: `${day}.${month}`,
            imieniny: imieniny,
            event: randomEvent,
            news: news // Teraz to tablica obiektów {title, link, snippet}
        });

    } catch (error) {
        console.error("Krytyczny błąd widgetu dziennego:", error);
        res.status(500).json({
            date: "Dzisiaj",
            imieniny: "Błąd systemu",
            event: { year: 2026, text: "Awaria widgetu." },
            news: []
        });
    }
});

export default router;