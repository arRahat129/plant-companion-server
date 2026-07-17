import { Router, Request, Response } from 'express';
import { getDB } from '../config/db.js';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = (req.session?.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthenticated' });
    }
    const db = getDB();
    const plants = await db
      .collection('plants')
      .find({ 'owner.id': userId })
      .project({ images: 0 }) // omit large image buffers for list view
      .toArray();
    res.json({ success: true, plants });
  } catch (err: any) {
    console.error('my-plants error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch plants' });
  }
});

export const myPlantsRouter = router;
