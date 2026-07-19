// ============================================================
//  src/routes/my-plants.routes.ts
//  The client (Next.js) sends the logged-in user's ID via the
//  custom header  X-User-ID  on every request.  This is safe
//  because CORS restricts the API to localhost:3000 only.
//  ──────────────────────────────────────────────────────────
//  GET    /api/my-plants           — paginated list for user
//  PATCH  /api/my-plants/:id       — update a plant
//  DELETE /api/my-plants/:id       — delete a plant
// ============================================================
import { Router, Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../config/db.js';

const router = Router();

/** Read userId from custom header — sent by the Next.js client */
function getUserId(req: Request): string | null {
  const id = req.headers['x-user-id'];
  if (!id || typeof id !== 'string' || !id.trim()) return null;
  return id.trim();
}

// ── GET /api/my-plants ──────────────────────────────────────
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User ID missing — are you signed in?' });
    }

    const db = getDB();
    const page     = Math.max(1, parseInt(req.query.page     as string) || 1);
    const limit    = Math.max(1, parseInt(req.query.limit    as string) || 10);
    const search   = (req.query.search   as string) || '';
    const category = (req.query.category as string) || '';
    const sortBy   = (req.query.sortBy   as string) || 'createdAt';
    const order    = (req.query.order    as string) === 'asc' ? 1 : -1;

    const filter: Record<string, unknown> = { 'owner.id': userId };
    if (search)   filter.title    = { $regex: search, $options: 'i' };
    if (category) filter.category = category;

    const validSortFields = ['createdAt', 'price', 'title'];
    const safeSortBy = validSortFields.includes(sortBy) ? sortBy : 'createdAt';

    const [plants, total] = await Promise.all([
      db.collection('plants')
        .find(filter)
        .sort({ [safeSortBy]: order })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      db.collection('plants').countDocuments(filter),
    ]);

    return res.json({
      success: true,
      plants,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err: any) {
    console.error('my-plants GET error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch plants' });
  }
});

// ── PATCH /api/my-plants/:id ────────────────────────────────
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User ID missing — are you signed in?' });
    }

    const id = req.params.id as string;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid plant ID' });
    }

    const db = getDB();
    const existing = await db.collection('plants').findOne({
      _id: new ObjectId(id),
      'owner.id': userId,
    });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Plant not found or access denied' });
    }

    const { title, price, quantity, images, availability, ...rest } = req.body;

    if (title !== undefined && !String(title).trim()) {
      return res.status(400).json({ success: false, message: 'Title cannot be empty' });
    }
    if (price !== undefined && (isNaN(Number(price)) || Number(price) < 0)) {
      return res.status(400).json({ success: false, message: 'Invalid price' });
    }
    if (quantity !== undefined && (isNaN(Number(quantity)) || Number(quantity) < 1)) {
      return res.status(400).json({ success: false, message: 'Invalid quantity' });
    }

    const updateDoc: Record<string, unknown> = { ...rest };
    if (title        !== undefined) updateDoc.title        = String(title).trim();
    if (price        !== undefined) updateDoc.price        = Number(price);
    if (quantity     !== undefined) updateDoc.quantity     = Number(quantity);
    if (Array.isArray(images))      updateDoc.images       = images;
    if (availability !== undefined) updateDoc.availability = String(availability).trim();
    updateDoc.updatedAt = new Date();
    updateDoc.hasFeedback = false; // Mark feedback as resolved when edited
    updateDoc.status = 'pending'; // Reset status to pending when edited

    await db.collection('plants').updateOne(
      { _id: new ObjectId(id) },
      { $set: updateDoc }
    );

    // Delete associated feedbacks
    await db.collection('feedbacks').deleteMany({ plantId: id });

    return res.json({ success: true, message: 'Plant updated successfully' });
  } catch (err: any) {
    console.error('my-plants PATCH error:', err);
    return res.status(500).json({ success: false, message: 'Failed to update plant' });
  }
});

// ── DELETE /api/my-plants/:id ───────────────────────────────
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User ID missing — are you signed in?' });
    }

    const id = req.params.id as string;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid plant ID' });
    }

    const db = getDB();
    const result = await db.collection('plants').deleteOne({
      _id: new ObjectId(id),
      'owner.id': userId,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: 'Plant not found or access denied' });
    }

    return res.json({ success: true, message: 'Plant deleted successfully' });
  } catch (err: any) {
    console.error('my-plants DELETE error:', err);
    return res.status(500).json({ success: false, message: 'Failed to delete plant' });
  }
});

export const myPlantsRouter = router;
