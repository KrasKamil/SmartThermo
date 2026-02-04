import express from "express";
import cors from "cors";
import path from "path";

// Importy modułów (Twoje istniejące trasy)
import weatherRoutes from './routes/weather';
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
    
    // Logger (wyciszamy spamujące endpointy)
    this.server.use((req, res, next) => {
      if (req.method === 'GET' && (req.originalUrl.startsWith('/api/media/now-playing') || req.originalUrl.startsWith('/api/notes'))) {
        return next();
      }
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
    // 🔥 PRZEKIEROWANIE STARTOWE (http://localhost:8888 -> /vapage.html)
    this.server.get('/', (req, res) => {
        res.redirect('/vapage.html');
    });

    // Rejestracja tras API
    this.server.use('/api/weather', weatherRoutes);
    this.server.use('/api/bluetooth', bluetoothRoutes);
    this.server.use('/api/media', mediaRoutes);
    this.server.use('/api/debug', debugRoutes);
    this.server.use('/api/air', airRoutes);
    this.server.use('/api/daily', dailyRoutes);
    this.server.use('/api/notes', notesRoutes);
    
    // Fallback dla media (zachowanie kompatybilności)
    this.server.use('/api', mediaRoutes); 
  }
}

export default new App().server;