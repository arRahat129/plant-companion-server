// ============================================================
//  src/routes/index.ts — API Router
//  ──────────────────────────────────────────────────────────
//  This file wires all sub-routers together.
//  It is mounted at /api in src/index.ts, so:
//    apiRouter  mounted at /api
//    authRouter mounted at /api/auth
//
//  To add a new feature (e.g. plants):
//    1. Create src/routes/plants.routes.ts
//    2. Uncomment the import and use() below
// ============================================================

import { Router, Request, Response } from 'express';
import { authRouter } from './auth.routes.js';
// import { plantsRouter } from './plants.routes.js';  // ← add later
// import { usersRouter } from './users.routes.js';    // ← add later
// import { aiRouter } from './ai.routes.js';          // ← add later

export const apiRouter = Router();

// ─── Health Check — GET /api/health ──────────────────────────
// A simple endpoint to verify the server is running.
// Useful for deployment health checks (e.g., Render, Railway).
apiRouter.get('/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'plant-companion-server',
    version: '1.0.0',
  });
});

// ─── Mount Sub-Routers ────────────────────────────────────────
apiRouter.use('/auth', authRouter);         // /api/auth/*
// apiRouter.use('/plants', plantsRouter);  // /api/plants/*
// apiRouter.use('/users', usersRouter);    // /api/users/*
// apiRouter.use('/ai', aiRouter);          // /api/ai/*
