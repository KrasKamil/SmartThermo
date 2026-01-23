// src/app.ts
import express from "express";
import cors from "cors";
import path from "path";

// Importy modułów
import weatherRoutes from './routes/weather';
import spotifyRoutes from './routes/spotify';
import bluetoothRoutes from './routes/bluetooth';
import mediaRoutes from './routes/media';
import debugRoutes from './routes/debug';
import airRoutes from './routes/air';
import dailyRoutes from './routes/daily';

class App {
  public server: express.Application;

  constructor() {
    this.server = express();
    this.middlewares(); // Tutaj ładujemy logger
    this.routes();
  }

  middlewares() {
    this.server.use(cors());
    this.server.use(express.json());
    
    // --- DODAJ TEN FRAGMENT (LOGGER) ---
    this.server.use((req, res, next) => {
      // Wyłącz logowanie dla GET /api/media/now-playing
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
    // ------------------------------------

    this.server.use(express.static(path.join(__dirname, '../')));
  }

  routes() {
  this.server.use('/api/weather', weatherRoutes); // To odpowiada za /api/weather
  this.server.use('/api/bluetooth', bluetoothRoutes);
  this.server.use('/api', mediaRoutes); // Jeśli media.ts ma w sobie /media/now-playing, to będzie /api/media/now-playing
  this.server.use('/', spotifyRoutes); 
  this.server.use('/api/debug', debugRoutes); 
  this.server.use('/api/air', airRoutes);
  this.server.use('/api/daily', dailyRoutes);
}
}

export default new App().server;