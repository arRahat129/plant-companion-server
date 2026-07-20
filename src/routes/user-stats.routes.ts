import { Router, Request, Response } from 'express';
import { getDB } from '../config/db.js';

const router = Router();

function getUserId(req: Request): string | null {
  const id = req.headers['x-user-id'];
  if (!id || typeof id !== 'string' || !id.trim()) return null;
  return id.trim();
}

router.get('/dashboard-stats', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const db = getDB();

    // ── Get totals ──────────────────────────────────────────
    const [totalPlants, totalSentRequests, totalRecRequests, totalScans] = await Promise.all([
      db.collection('plants').countDocuments({ 'owner.id': userId }),
      db.collection('requests').countDocuments({ 'requester.id': userId }),
      db.collection('requests').countDocuments({ 'owner.id': userId }),
      db.collection('diseaseCollection').countDocuments({ userId: userId }),
    ]);

    // ── Get last 7 days timeline data ────────────────────────
    const chartData = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const startOfDay = new Date(d.setHours(0, 0, 0, 0));
      const endOfDay = new Date(d.setHours(23, 59, 59, 999));

      const dateString = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      const [plantsCount, sentCount, recCount, scansCount] = await Promise.all([
        db.collection('plants').countDocuments({
          'owner.id': userId,
          createdAt: { $gte: startOfDay, $lte: endOfDay }
        }),
        db.collection('requests').countDocuments({
          'requester.id': userId,
          createdAt: { $gte: startOfDay, $lte: endOfDay }
        }),
        db.collection('requests').countDocuments({
          'owner.id': userId,
          createdAt: { $gte: startOfDay, $lte: endOfDay }
        }),
        db.collection('diseaseCollection').countDocuments({
          userId: userId,
          createdAt: { $gte: startOfDay, $lte: endOfDay }
        })
      ]);

      chartData.push({
        date: dateString,
        "Added Plants": plantsCount,
        "Sent Requests": sentCount,
        "Got Requests": recCount,
        "Scans": scansCount
      });
    }

    return res.json({
      success: true,
      stats: {
        totalPlants,
        totalSentRequests,
        totalRecRequests,
        totalScans
      },
      chartData
    });
  } catch (error: any) {
    console.error('User dashboard stats error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch user stats' });
  }
});

export const userStatsRouter = router;
