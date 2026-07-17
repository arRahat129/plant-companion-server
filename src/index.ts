// ============================================================
//  src/index.ts — Main Entry Point
//  ──────────────────────────────────────────────────────────
//  This is the equivalent of the CommonJS pattern you know:
//
//    CommonJS (old way):               TypeScript ESM (new way):
//    const express = require(...)   →  import express from '...'
//    const app = express()          →  const app = express()
//    app.listen(port, () => {})     →  app.listen(port, () => {})
//    module.exports = app           →  export default app
//
//  The structure is identical — only the import/export syntax
//  is different!
// ============================================================

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import { connectDB } from './config/db.js';
import { env } from './config/env.js';
import { apiRouter } from './routes/index.js';

// ─── ESM equivalent of __dirname ─────────────────────────────
// In CommonJS, __dirname is built-in.
// In ESM (import/export), we have to derive it manually:
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Create Express App ───────────────────────────────────────
const app = express();

// ─── Middleware ───────────────────────────────────────────────

// CORS — only allow requests from the Next.js frontend
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true, // Allow cookies/auth headers
  })
);

// Parse JSON request bodies (like req.body in POST requests)
app.use(express.json());

// Parse URL-encoded form data
app.use(express.urlencoded({ extended: true }));

// ─── Static Files — Landing Page ─────────────────────────────
// Serves the public/index.html when someone visits http://localhost:5000
app.use(express.static(path.join(__dirname, '../public')));

// ─── API Routes ───────────────────────────────────────────────
// All API endpoints are prefixed with /api
// e.g.: /api/health, /api/auth/login, /api/plants, etc.
app.use('/api', apiRouter);

// ─── Root Route → Landing Page ────────────────────────────────
app.get('/', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ─── 404 Handler ─────────────────────────────────────────────
// Catches any request that didn't match a route above
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// ─── Global Error Handler ─────────────────────────────────────
// Express calls this when next(error) is called in a route handler
// Must have 4 parameters (err, req, res, next) — Express detects this
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('❌ Unhandled error:', err.message);
  res.status(500).json({
    success: false,
    message: env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// ─── Start Server ─────────────────────────────────────────────
const startServer = async () => {
  // Connect to MongoDB first, then start listening
  await connectDB();

  app.listen(env.PORT, () => {
    console.log('\n╔════════════════════════════════════════════╗');
    console.log('║   🌿 PlantCompanion Server                 ║');
    console.log('╚════════════════════════════════════════════╝');
    console.log(`\n🚀 Server:   http://localhost:${env.PORT}`);
    console.log(`📡 API:      http://localhost:${env.PORT}/api`);
    console.log(`❤️  Health:   http://localhost:${env.PORT}/api/health`);
    console.log(`🔑 JWKS:     http://localhost:${env.PORT}/api/auth/jwks`);
    console.log(`\n📦 Environment: ${env.NODE_ENV}`);
    console.log(`🌐 CORS origin: ${env.CLIENT_URL}\n`);
  });
};

// Call the async function and handle any startup errors
startServer().catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});
