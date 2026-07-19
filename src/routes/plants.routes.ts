// ============================================================
//  src/routes/plants.routes.ts — Public Plants Routes
//  GET /api/plants/:id  — fetch a single plant by ID (public)
// ============================================================
import { Router, Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../config/db.js';

const router = Router();

// ── GET /api/plants (List/Filter/Search/Sort) ───────────────
router.get('/', async (req: Request, res: Response) => {
  try {
    const db = getDB();
    
    // Parse query params
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 9;
    const skip = (page - 1) * limit;

    const query: any = { status: 'accepted' };

    // Filter by Category
    if (req.query.category && typeof req.query.category === 'string' && req.query.category !== 'All') {
      query.category = req.query.category;
    }

    // Filter by Pot Size
    if (req.query.potSize && typeof req.query.potSize === 'string' && req.query.potSize !== 'All') {
      query.potSize = req.query.potSize;
    }

    // Filter by Pet Safety
    if (req.query.petSafe) {
      query.petSafe = req.query.petSafe === 'true';
    }

    // Text Search
    if (req.query.search && typeof req.query.search === 'string') {
      const searchStr = req.query.search.trim();
      if (searchStr) {
        query.$or = [
          { title: { $regex: searchStr, $options: 'i' } },
          { botanical: { $regex: searchStr, $options: 'i' } },
          { description: { $regex: searchStr, $options: 'i' } },
        ];
      }
    }

    // Sorting
    const sortBy = (req.query.sortBy as string) || 'createdAt';
    const sortOrder = (req.query.sortOrder as string) === 'asc' ? 1 : -1;
    const sort: any = {};
    
    if (sortBy === 'price') {
      sort.price = sortOrder;
    } else {
      // Default to createdAt
      sort.createdAt = sortOrder;
    }

    const plantsCollection = db.collection('plants');
    const total = await plantsCollection.countDocuments(query);
    const plants = await plantsCollection
      .find(query)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .toArray();

    return res.json({
      success: true,
      plants,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error('plants GET/ error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch plants' });
  }
});

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
