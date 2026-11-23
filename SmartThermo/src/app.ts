import express from "express";
import cors from "cors";
import path from "path";
import dotenv from "dotenv";



// Importy modułów (Twoje istniejące trasy)
import weatherRoutes from './routes/weather';
import bluetoothRoutes from './routes/bluetooth';
import mediaRoutes from './routes/media';
import debugRoutes from './routes/debug';
import airRoutes from './routes/air';
import dailyRoutes from './routes/daily';
import notesRoutes from './routes/notes';
import voiceRoutes from './routes/voice';
import intercomRoutes from './routes/intercom';

dotenv.config();
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
     if (req.method === 'GET' && (
          req.originalUrl.startsWith('/api/media/now-playing') || 
          req.originalUrl.startsWith('/api/notes') ||
          req.originalUrl.includes('.well-known') ||
          req.originalUrl.startsWith('/style-css/')||
          req.originalUrl.startsWith('/api/media/control')||
          req.originalUrl.includes('/js/')
      )) {
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

    this.server.use((req, res, next) => {
        // Sprawdzamy tylko ścieżki zaczynające się od /api
        if (req.path.startsWith('/api')) {
            const clientKey = req.headers['x-api-key'] || req.query.key;
            const serverKey = process.env.API_KEY || 'default_key'; // Fallback jeśli brak .env

            if (clientKey !== serverKey) {
                console.warn(`⛔ Nieautoryzowany dostęp do: ${req.path}`);
                return res.status(403).json({ error: 'Brak dostępu. Błędny API Key.' });
            }
        }
        next();
    });
    const publicPath = path.join(__dirname, '../public');
    this.server.use(express.static(publicPath));
  }

  routes() {
    
    // PRZEKIEROWANIE STARTOWE (http://localhost:8888 -> /vapage.html)
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
    this.server.use('/api/voice', voiceRoutes);
    this.server.use('/api/intercom', intercomRoutes);
    
    // Fallback dla media (zachowanie kompatybilności)
    this.server.use('/api', mediaRoutes); 

    //Pozwolenie frontendowi odczytać klucz z .env
    this.server.get('/config.js', (req, res) => {
    const apiKey = process.env.API_KEY || 'default_key';
    res.setHeader('Content-Type', 'application/javascript');
    res.send(`window.ENV_API_KEY = "${apiKey}";`);
  });
 
  }
}

export default new App().server;