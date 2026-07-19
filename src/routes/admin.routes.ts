import { Router, Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../config/db.js';

const router = Router();

// GET /api/admin/plants - fetch all non-deleted plants
router.get('/plants', async (req: Request, res: Response) => {
  try {
    const db = getDB();
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search as string;
    const statusFilter = req.query.status as string;

    const query: any = { adminDeleted: { $ne: true } };

    if (statusFilter && statusFilter !== 'All') {
      query.status = statusFilter;
    }

    if (search && search.trim() !== '') {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { 'owner.email': { $regex: search, $options: 'i' } },
      ];
    }

    const sort: any = { createdAt: -1 };

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
    console.error('admin plants GET error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch admin plants' });
  }
});

// PATCH /api/admin/plants/:id/status - Toggle status
router.patch('/plants/:id/status', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { status } = req.body; // 'accepted' or 'rejected'

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid plant ID' });
    }
    if (!['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const db = getDB();
    const result = await db.collection('plants').updateOne(
      { _id: new ObjectId(id) },
      { $set: { status, updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'Plant not found' });
    }

    return res.json({ success: true, message: `Plant marked as ${status}` });
  } catch (err: any) {
    console.error('admin plants status PATCH error:', err);
    return res.status(500).json({ success: false, message: 'Failed to update plant status' });
  }
});

// DELETE /api/admin/plants/:id - Admin soft delete
router.delete('/plants/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid plant ID' });
    }

    const db = getDB();
    // Soft delete: hide from admin, mark as rejected so user sees it as rejected
    const result = await db.collection('plants').updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: 'rejected', adminDeleted: true, updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'Plant not found' });
    }

    return res.json({ success: true, message: 'Plant deleted from admin view' });
  } catch (err: any) {
    console.error('admin plants DELETE error:', err);
    return res.status(500).json({ success: false, message: 'Failed to delete plant' });
  }
});

export const adminRouter = router;
