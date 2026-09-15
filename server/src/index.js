import http from 'node:http';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './lib/env.js';
import { prisma } from './lib/db.js';
import { apiRouter } from './routes/index.js';
import { attachRealtime } from './realtime/index.js';

const app = express();

app.set('trust proxy', 1);
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
  }),
);
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || env.corsOrigins.includes(origin) || env.nodeEnv !== 'production') return cb(null, true);
      cb(new Error(`Origine non autorisée : ${origin}`));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: '2mb' }));

// Les fichiers televerses sont servis sans aucun script actif : un SVG ou un PDF
// hostile ne peut donc pas s'executer dans le contexte de l'application.
app.use(
  '/uploads',
  (_req, res, next) => {
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data: blob: 'self'; sandbox");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  },
  express.static(env.uploadDir, { maxAge: '7d', index: false, dotfiles: 'deny' }),
);

// Ressources fournies avec l'application (tuiles, pions, cadres).
app.use(
  '/builtin',
  express.static(path.join(process.cwd(), 'builtin'), { maxAge: '30d', index: false }),
);

app.use('/api', apiRouter);

app.use((_req, res) => res.status(404).json({ error: 'Route inconnue' }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  if (status >= 500) console.error('[erreur]', err);
  res.status(status).json({
    error: status === 413 ? 'Fichier trop volumineux' : err.message || 'Erreur interne',
    details: err.details,
  });
});

const server = http.createServer(app);
attachRealtime(server);

server.listen(env.port, () => {
  console.log(`[tabletop] API prête sur http://0.0.0.0:${env.port} (${env.nodeEnv})`);
});

const shutdown = async (signal) => {
  console.log(`[tabletop] arrêt (${signal})`);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
