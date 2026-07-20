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

// ── GET /api/admin/users — Fetch all users ─────────────────────
router.get('/users', async (req: Request, res: Response) => {
  try {
    const db = getDB();
    // support querying both 'user' (better-auth) and custom 'users'
    const usersList = await db.collection('user').find({}).toArray();
    const usersBackup = await db.collection('users').find({}).toArray();

    // Merge/deduplicate lists in case custom registration or better-auth was used
    const seen = new Set();
    const mergedUsers = [];

    for (const u of [...usersList, ...usersBackup]) {
      const idStr = u._id?.toString() || u.id;
      if (idStr && !seen.has(idStr)) {
        seen.add(idStr);
        mergedUsers.push({
          id: idStr,
          _id: u._id,
          name: u.name || 'User',
          email: u.email,
          image: u.image || '',
          role: u.role || 'user',
          createdAt: u.createdAt || new Date(),
        });
      }
    }

    return res.json({ success: true, users: mergedUsers });
  } catch (err: any) {
    console.error('Admin fetch users error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch users list' });
  }
});

// ── PATCH /api/admin/users/:id/role — Promote/demote ───────────
router.patch('/users/:id/role', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const { role } = req.body;

    if (!role || !['admin', 'user'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role provided' });
    }

    const db = getDB();
    const objectId = ObjectId.isValid(id as string) ? new ObjectId(id as string) : null;

    if (objectId) {
      await db.collection('user').updateOne({ _id: objectId }, { $set: { role } });
      await db.collection('users').updateOne({ _id: objectId }, { $set: { role } });
    }
    await db.collection('user').updateOne({ _id: id as any }, { $set: { role } });
    await db.collection('user').updateOne({ id }, { $set: { role } });
    await db.collection('users').updateOne({ _id: id as any }, { $set: { role } });
    await db.collection('users').updateOne({ id }, { $set: { role } });

    return res.json({ success: true, message: 'User role updated successfully' });
  } catch (err: any) {
    console.error('Admin promote user error:', err);
    return res.status(500).json({ success: false, message: 'Failed to update user role' });
  }
});

// ── DELETE /api/admin/users/:id — Hard delete user ─────────────
router.delete('/users/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const db = getDB();
    const objectId = ObjectId.isValid(id as string) ? new ObjectId(id as string) : null;

    if (objectId) {
      await db.collection('user').deleteOne({ _id: objectId });
      await db.collection('users').deleteOne({ _id: objectId });
    }
    await db.collection('user').deleteOne({ _id: id as any });
    await db.collection('user').deleteOne({ id });
    await db.collection('users').deleteOne({ _id: id as any });
    await db.collection('users').deleteOne({ id });

    return res.json({ success: true, message: 'User account deleted successfully' });
  } catch (err: any) {
    console.error('Admin delete user error:', err);
    return res.status(500).json({ success: false, message: 'Failed to delete user' });
  }
});

// ── GET /api/admin/dashboard-stats — Recharts Aggregations ─────
router.get('/dashboard-stats', async (req: Request, res: Response) => {
  try {
    const db = getDB();

    // 1. Compute totals
    const [totalPlants, totalUsers, totalScans, totalRequests] = await Promise.all([
      db.collection('plants').countDocuments({ adminDeleted: { $ne: true } }),
      db.collection('user').countDocuments({}),
      db.collection('diseaseCollection').countDocuments({}),
      db.collection('requests').countDocuments({}),
    ]);

    // 2. Timeline statistics (past 7 days)
    const timeline = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const startOfDay = new Date(d.setHours(0, 0, 0, 0));
      const endOfDay = new Date(d.setHours(23, 59, 59, 999));

      const dateString = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      const [newPlants, newUsers, newScans, newRequests] = await Promise.all([
        db.collection('plants').countDocuments({ createdAt: { $gte: startOfDay, $lte: endOfDay } }),
        db.collection('user').countDocuments({ createdAt: { $gte: startOfDay, $lte: endOfDay } }),
        db.collection('diseaseCollection').countDocuments({ createdAt: { $gte: startOfDay, $lte: endOfDay } }),
        db.collection('requests').countDocuments({ createdAt: { $gte: startOfDay, $lte: endOfDay } }),
      ]);

      timeline.push({
        date: dateString,
        "New Plants": newPlants,
        "New Users": newUsers,
        "Scans": newScans,
        "Requests": newRequests,
      });
    }

    return res.json({
      success: true,
      totals: {
        totalPlants,
        totalUsers,
        totalScans,
        totalRequests,
      },
      timeline,
    });
  } catch (err: any) {
    console.error('Admin dashboard stats error:', err);
    return res.status(500).json({ success: false, message: 'Failed to aggregate dashboard analytics' });
  }
});

export const adminRouter = router;
