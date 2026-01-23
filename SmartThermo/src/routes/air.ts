import {Router} from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import { error } from 'console';

dotenv.config();
const router = Router();

router.get('/', async (req, res) => {
    const {lat, lon} = req.query;
    const apiKey = process.env.OPENWEATHER_API_KEY; // Ten sam co weather.ts

    if(!lat || !lon) return res.status(400).json({error:'Brak koordynatów'});

    try {
        // Endpoint OpenWeatherMap Air Pollution
        const url = `http://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${apiKey}`;
        const response = await axios.get(url);
        res.json(response.data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Błąd pobierania danych o powietrzu' });
    }
});

export default router;