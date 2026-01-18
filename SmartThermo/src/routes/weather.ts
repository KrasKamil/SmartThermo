// src/routes/weather.ts
import { Router, Request, Response } from 'express';
import { MongoClient } from 'mongodb';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
    // 1. Pobieramy zmienną środowiskową
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

    // Dodatkowe opcje dla stabilności połączenia
    const client = new MongoClient(MONGO_URL, {
        useNewUrlParser: true, 
        useUnifiedTopology: true,
        connectTimeoutMS: 5000, // Timeout po 5 sekundach
        family: 4 // Wymuś IPv4 (czasem pomaga na błędy sieciowe)
    } as any);

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
                due_date: result.date || result.timestamp || new Date().toLocaleString()
            };
            res.json(mappedData);
        } else {
            console.warn(`⚠️ Połączono, ale kolekcja '${collName}' jest PUSTA.`);
            res.json(offlineData);
        }

    } catch (error: any) {
        console.error("❌ BŁĄD MONGODB:", error.message);
        if (error.message.includes("querySrv")) {
            console.error("💡 PODPOWIEDŹ: Twoja sieć blokuje zapytania SRV. Zmień link na 'mongodb://' (bez srv) lub zmień DNS na 8.8.8.8");
        }
        res.json(offlineData);
    } finally {
        try { await client.close(); } catch(e) {}
    }
});

export default router;