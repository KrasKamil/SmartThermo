// src/routes/weather.ts
import { Router, Request, Response } from 'express';
import { MongoClient, ServerApiVersion } from 'mongodb';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
    const MONGO_URL = process.env.MONGO_URL || "";
    
    // Ukrywamy hasło do logów
    const maskedUrl = MONGO_URL.replace(/:([^:@]+)@/, ':****@');

    const offlineData = {
        city: "Offline City",
        temp_ins: "-",
        hum_ins: "-",
        pressure: "-",
        temp_out: "-",
        wind: "-",
        due_date: new Date().toLocaleString() + " (Offline)"
    };

    if (!MONGO_URL || MONGO_URL.includes("your_password")) {
        console.error("❌ BŁĄD: Brak poprawnego MONGO_URL w pliku .env!");
        return res.json(offlineData);
    }

    console.log(`🔌 Próba połączenia z: ${maskedUrl}`);

    // KONFIGURACJA DLA MONGODB 6.0+ (Czysta, bez starych flag)
    const client = new MongoClient(MONGO_URL, {
        serverApi: {
            version: ServerApiVersion.v1,
            strict: true,
            deprecationErrors: true,
        },
        connectTimeoutMS: 5000,         // Timeout połączenia TCP
        serverSelectionTimeoutMS: 5000, // Timeout szukania serwerów (Ważne przy błędach SRV!)
        family: 4                       // Wymuszenie IPv4 (pomaga na błędy DNS)
    });

    try {
        await client.connect();
        
        const dbName = process.env.DB_NAME || "smartthermodatabase";
        const collName = process.env.COLLECTION_NAME || "weatherdata";

        // Pobieramy ostatni wpis
        const result = await client.db(dbName).collection(collName).findOne({}, { sort: { _id: -1 } });
        
        if (result) {
            console.log("✅ Dane pobrane!");
            const mappedData = {
                city: result.city || "Dom",
                temp_ins: result.temp_ins || result.temperature || result.temp || "-", 
                hum_ins: result.hum_ins || result.humidity || result.hum || "-",
                pressure: result.pressure || "-",
                temp_out: result.temp_out || "-",
                wind: result.wind || "-",
                due_date: result.due_date || result.date || result.timestamp || new Date().toLocaleString()
            };
            res.json(mappedData);
        } else {
            console.warn(`⚠️ Połączono, ale kolekcja '${collName}' jest PUSTA.`);
            res.json(offlineData);
        }

    } catch (error: any) {
        console.error("❌ BŁĄD MONGODB:", error.message);
        // Jeśli nadal widzisz ten błąd, to znaczy że Twój DNS blokuje rekordy SRV
        if (error.message.includes("querySrv") || error.message.includes("ECONNREFUSED")) {
            console.error("🚨 KRYTYCZNY BŁĄD DNS: Twój system nie może rozwiązać adresu mongodb+srv.");
            console.error("👉 ROZWIĄZANIE: Zmień DNS w Windowsie na 8.8.8.8 (Google)");
        }
        res.json(offlineData);
    } finally {
        try { await client.close(); } catch(e) {}
    }
});



router.get('/history', async (req: Request, res: Response) => {
    const MONGO_URL = process.env.MONGO_URL || "";
    const client = new MongoClient(MONGO_URL, { family: 4 });

    try {
        await client.connect();
        const dbName = process.env.DB_NAME || "smartthermodatabase";
        const collName = process.env.COLLECTION_NAME || "weatherdata";

        // Pobieramy 10 ostatnich rekordów, posortowanych od najstarszego (dla wykresu)
        const history = await client.db(dbName).collection(collName)
        .find({})
        .sort({ _id: -1 })
        .limit(12) // Ostatnie 12 wpisów
        .toArray();

        const formatted = history.reverse().map(item => ({
        time: item.due_date ? item.due_date.split(' ')[1].substring(0, 5) : "--:--",
        // Usuwamy " °C" i parsujemy na liczbę dla Chart.js
        temp: parseFloat(item.temp_ins.replace(' °C', '')) || 0
    }));
        res.json(formatted);
    } catch (error) {
        res.status(500).json([]);
    } finally {
        await client.close();
    }
});

export default router;