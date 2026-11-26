import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureDirs, ROOT, GAMES_DIR } from './lib/storage.js';
import { sessionMiddleware } from './lib/session.js';
import gamesRouter from './routes/games.js';
import uploadRouter from './routes/upload.js';
import pendingRouter from './routes/pending.js';
import adminGamesRouter from './routes/admin-games.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

await ensureDirs();

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(sessionMiddleware);

// Опциональная защита админки через переменную окружения (в prod — Nginx Basic Auth)
function adminAuth(req, res, next) {
  const pass = process.env.ADMIN_PASSWORD;
  if (!pass) return next();
  const auth = req.headers.authorization || '';
  const [scheme, creds] = auth.split(' ');
  const ok = scheme === 'Basic' &&
    Buffer.from(creds || '', 'base64').toString().split(':')[1] === pass;
  if (!ok) {
    res.set('WWW-Authenticate', 'Basic realm="admin"');
    return res.status(401).send('Auth required');
  }
  next();
}

app.use('/api/games', gamesRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/pending', adminAuth, pendingRouter);
app.use('/api/admin', adminAuth, adminGamesRouter);

// Статика: каталог и игры
app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'index.html')));
app.get('/style.css', (req, res) => res.sendFile(path.join(ROOT, 'style.css')));
app.get('/script.js', (req, res) => res.sendFile(path.join(ROOT, 'script.js')));
app.use('/admin', adminAuth, express.static(path.join(ROOT, 'admin'), { index: 'index.html' }));
app.use('/games', express.static(GAMES_DIR, { index: 'index.html' }));

app.use((err, req, res, next) => {
  console.error('[error]', err);
  res.status(500).json({ error: err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Antology API: http://localhost:${PORT}`);
  if (!process.env.ADMIN_PASSWORD) {
    console.warn('WARN: ADMIN_PASSWORD не задан — админка открыта (только для dev!)');
  }
});