// ============================================================
//  src/routes/plants.routes.ts — Public Plants Routes
//  GET /api/plants/:id  — fetch a single plant by ID (public)
// ============================================================
import { Router, Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../config/db.js';

const router = Router();

// ── GET /api/plants/:id ─────────────────────────────────────
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid plant ID' });
    }

    const db = getDB();
    const plant = await db
      .collection('plants')
      .findOne({ _id: new ObjectId(id) });

    if (!plant) {
      return res.status(404).json({ success: false, message: 'Plant not found' });
    }

    return res.json({ success: true, plant });
  } catch (err: any) {
    console.error('plants GET/:id error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch plant' });
  }
});

export const plantsRouter = router;
