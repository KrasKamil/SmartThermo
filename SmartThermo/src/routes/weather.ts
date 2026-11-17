// src/routes/weather.ts
import { Router, Request, Response } from 'express';
import { getDB } from '../helpers/db'; // Korzystamy z helpera
import { getIO } from '../helpers/socket';

const router = Router();

// Funkcja pomocnicza do formatowania wartości z jednostkami
const formatUnit = (value: any, unit: string): string => {
    if (value === undefined || value === null || value === "-") return "-";
    // Jeśli to już jest string z jednostką (stare dane), np. "21.5 °C", zwróć bez zmian
    if (typeof value === 'string' && value.includes(unit.trim())) return value;
    // Jeśli to liczba (nowe dane) lub string bez jednostki, dodaj jednostkę
    return `${value} ${unit}`;
};


// --- ROUTE: Aktualna pogoda ---
router.get('/', async (req: Request, res: Response) => {
    const offlineData = {
        city: "Offline City",
        temp_ins: "-", hum_ins: "-", pressure: "-", temp_out: "-", wind: "-",condition: "Clouds", icon: "03d",
        due_date: new Date().toLocaleString() + " (Offline)"
    };


    try {
        const db = getDB();
        
        const collName = process.env.COLLECTION_NAME || "weatherdata";
        
        // Pobieramy ostatni wpis
        const result = await db.collection(collName).findOne({}, { sort: { _id: -1 } });
        
        if (result) {
            const mappedData = {
                city: result.city || "Dom",
                temp_ins: formatUnit(result.temp_ins || result.temperature, "°C"), 
                hum_ins:  formatUnit(result.hum_ins || result.humidity, "%"),
                pressure: formatUnit(result.pressure, "hPa"),
                temp_out: formatUnit(result.temp_out, "°C"),
                wind: result.wind || "-", // Wiatr zostawiamy jak jest
                due_date: result.due_date || new Date().toLocaleString(),
                condition: result?.condition || "Clouds",
                icon: result?.icon || "03d"
            };
            res.json(mappedData);
        } else {
            console.warn(`⚠️ Kolekcja '${collName}' jest PUSTA.`);
            res.json(offlineData);
        }

    } catch (error: any) {
        console.error("❌ Błąd pobierania pogody (Route):", error.message);
        res.json(offlineData);
    }
    // UWAGA: Nie zamykamy połączenia (brak finally client.close)
});

// --- ROUTE: Historia (Wykres) ---
router.get('/history', async (req: Request, res: Response) => {
    try {
        const db = getDB(); // 👇 Znów korzystamy z gotowego połączenia
        const collName = process.env.COLLECTION_NAME || "weatherdata";

        const history = await db.collection(collName)
            .find({})
            .sort({ _id: -1 })
            .limit(10) // Ostatnie 10 pomiarów
            .toArray();

        const formatted = history.reverse().map((item: any) => {
            // 👇 Logika "Hybrydowa": obsługuje i stare stringi ("21 °C") i nowe liczby (21)
            const rawTemp = item.temp_ins;
            let finalTemp = 0;

            if (typeof rawTemp === 'number') {
                finalTemp = rawTemp; // Nowe dane: biorę jak leci
            } else if (typeof rawTemp === 'string') {
                // Stare dane: usuwam " °C" i parsuję
                finalTemp = parseFloat(rawTemp.replace(' °C', '')) || 0;
            }

            return {
                time: item.due_date ? item.due_date.split(' ')[1].substring(0, 5) : "--:--",
                temp: finalTemp
            };
        });
        
        res.json(formatted);
    } catch (error) {
        console.error("❌ Błąd historii:", error);
        res.status(500).json([]);
    }
});

// --- ENDPOINT: Odbiera dane z Pythona, zapisuje i powiadamia frontend
router.post('/update', async (req: Request, res: Response) => {
    try {
        const newData = req.body; // Python wyśle JSON z danymi

        // 1. Walidacja (prosta)
        if (!newData || !newData.temp_ins) {
            return res.status(400).json({ error: "Brak danych" });
        }

        // 2. Zapisz do bazy (używając Singletona)
        const db = getDB();
        const collName = process.env.COLLECTION_NAME || "weatherdata";
        
        // Dodajemy timestamp serwera, żeby mieć pewność czasu
        const entry = {
            ...newData,
            condition: newData.condition || "Clouds", // Domyślna jeśli Python nie wyśle
            icon: newData.icon || "03d",
        
            createdAt: new Date(),
            due_date: newData.due_date
        };

        await db.collection(collName).insertOne(entry);

        // 3. 🔥 SOCKET EMIT: Wyślij nowe dane do wszystkich podłączonych klientów!
        // Formatujemy dane tak samo jak w GET / (dodajemy jednostki dla frontendu)
        const formatUnit = (val: any, unit: string) => val ? `${val} ${unit}` : "-";
        
        const socketPayload = {
            city: entry.city,
            temp_ins: formatUnit(entry.temp_ins, "°C"),
            hum_ins: formatUnit(entry.hum_ins, "%"),
            pressure: formatUnit(entry.pressure, "hPa"),
            temp_out: formatUnit(entry.temp_out, "°C"),
            wind: entry.wind,
            due_date: entry.due_date,
            condition: entry.condition,
            icon: entry.icon
        };

        getIO().emit('weather_update', socketPayload);
        console.log("📡 Otrzymano dane z czujnika -> Wysłano przez Socket.io");

        res.json({ success: true });
    } catch (error: any) {
        console.error("❌ Błąd zapisu danych pogodowych:", error.message);
        res.status(500).json({ error: error.message });
    }
});


export default router;