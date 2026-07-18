// ============================================================
//  src/routes/index.ts — API Router
//  ──────────────────────────────────────────────────────────
//  All sub-routers wired together, mounted at /api in src/index.ts
// ============================================================
import { Router, Request, Response } from 'express';
import { authRouter }     from './auth.routes.js';
import { addPlantRouter } from './add-plant.routes.js';
import { myPlantsRouter } from './my-plants.routes.js';
import { plantsRouter }   from './plants.routes.js';

export const apiRouter = Router();

// ─── Health Check — GET /api/health ──────────────────────────
apiRouter.get('/health', (req: Request, res: Response) => {
  res.json({
    success:   true,
    status:    'ok',
    timestamp: new Date().toISOString(),
    service:   'plant-companion-server',
    version:   '1.0.0',
  });
});

// ─── Mount Sub-Routers ────────────────────────────────────────
apiRouter.use('/auth',      authRouter);      // /api/auth/*
apiRouter.use('/add-plant', addPlantRouter);  // /api/add-plant
apiRouter.use('/my-plants', myPlantsRouter);  // /api/my-plants
apiRouter.use('/plants',    plantsRouter);    // /api/plants/:id
