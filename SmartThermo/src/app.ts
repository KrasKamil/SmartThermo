// src/app.ts
import express from "express";
import cors from "cors";
import path from "path";

// Importy modułów (Twoje istniejące trasy)
import weatherRoutes from './routes/weather';
import spotifyRoutes from './routes/spotify';
import bluetoothRoutes from './routes/bluetooth';
import mediaRoutes from './routes/media';
import debugRoutes from './routes/debug';
import airRoutes from './routes/air';
import dailyRoutes from './routes/daily';
import notesRoutes from './routes/notes';

class App {
  public server: express.Application;

  constructor() {
    this.server = express();
    this.middlewares();
    this.routes();
  }

  middlewares() {
    this.server.use(cors());
    this.server.use(express.json());
    
    // --- LOGGER (Twój istniejący) ---
    this.server.use((req, res, next) => {
      // Wyłącz logowanie dla GET /api/media/now-playing (żeby nie spamowało konsoli)
      if (req.method === 'GET' && req.originalUrl.startsWith('/api/media/now-playing')) {
        return next();
      }
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        const statusIcon = res.statusCode >= 400 ? '❌' : '✅';
        console.log(`📝 ${statusIcon} [${req.method}] ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
      });
      next();
    });

    // --- ZMIANA: Obsługa folderu PUBLIC ---
    // Wskazujemy folder 'public' jako miejsce, gdzie leżą pliki HTML, CSS, JS, Sounds, Media
    const publicPath = path.join(__dirname, '../public');
    this.server.use(express.static(publicPath));
  }

  routes() {
    // API Routes
    this.server.use('/api/weather', weatherRoutes);
    this.server.use('/api/bluetooth', bluetoothRoutes);
    this.server.use('/api', mediaRoutes);
    this.server.use('/api/spotify', spotifyRoutes);
    this.server.use('/api/debug', debugRoutes);
    this.server.use('/api/air', airRoutes);
    this.server.use('/api/daily', dailyRoutes);
    this.server.use('/api/notes', notesRoutes);

    // --- ZMIANA: Obsługa Strony Głównej ---
    // Jeśli ktoś wejdzie na "localhost:8888/", wyślij mu vapage.html
    this.server.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, '../public/vapage.html'));
    });
  }
}

export default new App().server;