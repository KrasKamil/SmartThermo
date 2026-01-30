// src/helpers/db.ts
import { MongoClient, ServerApiVersion } from 'mongodb';

let dbInstance: any = null;

export const connectDB = async () => {
    if (dbInstance) return dbInstance;

    const MONGO_URL = process.env.MONGO_URL;

    if (!MONGO_URL) {
        throw new Error("❌ Brak MONGO_URL w pliku .env");
    }

    const client = new MongoClient(MONGO_URL, {
        serverApi: {
            version: ServerApiVersion.v1,
            strict: true,
            deprecationErrors: true,
        },
        connectTimeoutMS: 5000,         
        serverSelectionTimeoutMS: 5000, 
        family: 4 // WYMUSZENIE IPv4
    });

    try {
        await client.connect();
        dbInstance = client.db(process.env.DB_NAME || "smartthermodatabase");
        console.log("✅ Połączono z MongoDB (Singleton + IPv4)");
        return dbInstance;
    } catch (error) {
        console.error("❌ Błąd połączenia w db.ts:", error);
        throw error;
    }
};

export const getDB = () => {
    if (!dbInstance) {
        throw new Error("⚠️ Baza danych nie została zainicjowana! Sprawdź czy startServer() zadziałał.");
    }
    return dbInstance;
};