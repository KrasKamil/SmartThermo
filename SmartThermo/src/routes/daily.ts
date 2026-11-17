import { Router, Request, Response } from 'express';
// Importujemy wszystkie serwisy
import { getNamedays } from '../services/namedayService';
import { getHistoricalEvent } from '../services/historyService';
import { getWorldNews } from '../services/newsService';
import { getDailyJoke } from '../services/jokeService'; // <--- NOWOŚĆ

const router = Router();

// --- 1. GET / -> Główne dane (Imieniny, Historia, Newsy) ---
router.get('/', async (req: Request, res: Response) => {
    try {
        const [imieniny, event, news] = await Promise.all([
            getNamedays(),
            getHistoricalEvent(),
            getWorldNews()
        ]);

        const today = new Date();
        const dateStr = `${String(today.getDate()).padStart(2, '0')}.${String(today.getMonth() + 1).padStart(2, '0')}`;

        res.json({
            date: dateStr,
            imieniny,
            event,
            news
        });
    } catch (error) {
        console.error("Aggregation Error", error);
        res.status(500).json({ error: "Server Error" });
    }
});


router.get('/joke', async (req: Request, res: Response) => {
    const jokeData = await getDailyJoke();
    res.json(jokeData);
});

export default router;