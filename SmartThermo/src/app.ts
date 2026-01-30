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
    this.server.use(express.json({ limit: '10mb' }));
    this.server.use(express.urlencoded({ limit: '10mb', extended: true }));
    
    // Logger
    this.server.use((req, res, next) => {
      // Wyłącz logowanie dla spamujących endpointów
      if (req.method === 'GET' && (req.originalUrl.startsWith('/api/media/now-playing') || req.originalUrl.startsWith('/api/notes'))) {
        return next();
      }
      // Wyłącz też logowanie payloadu obrazków, bo zaśmiecą konsolę, ale loguj błędy
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        const statusIcon = res.statusCode >= 400 ? '❌' : '✅';
        // Ignorujemy logowanie sukcesu POST /update-system, bo Python wysyła to co sekundę
        if (req.originalUrl.includes('/update-system') && res.statusCode === 200) return;
        
        console.log(`📝 ${statusIcon} [${req.method}] ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
      });
      next();
    });

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