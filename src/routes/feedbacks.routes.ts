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

// POST /api/feedbacks - Admin sends feedback
router.post('/', async (req: Request, res: Response) => {
  try {
    const { message, reportType, plantId, adminId } = req.body;

    if (!message || !reportType || !plantId || !adminId) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    if (!ObjectId.isValid(plantId)) {
      return res.status(400).json({ success: false, message: 'Invalid plant ID' });
    }

    const db = getDB();
    const plant = await db.collection('plants').findOne({ _id: new ObjectId(plantId) });

    if (!plant) {
      return res.status(404).json({ success: false, message: 'Plant not found' });
    }

    const feedbackDoc = {
      ownerId: plant.owner.id,
      email: plant.owner.email,
      name: plant.owner.name,
      image: plant.owner.image,
      plantId: plant._id.toString(),
      plantImage: plant.images[0] || '',
      plantName: plant.title,
      adminMessage: message,
      adminId,
      reportType,
      status: 'feedback given',
      createdAt: new Date(),
    };

    await db.collection('feedbacks').insertOne(feedbackDoc);

    // Update plant to pending and hasFeedback
    await db.collection('plants').updateOne(
      { _id: new ObjectId(plantId) },
      { $set: { status: 'pending', hasFeedback: true, updatedAt: new Date() } }
    );

    return res.status(201).json({ success: true, message: 'Feedback sent successfully' });
  } catch (err: any) {
    console.error('feedbacks POST error:', err);
    return res.status(500).json({ success: false, message: 'Failed to send feedback' });
  }
});

// GET /api/feedbacks/user - User fetches their feedbacks
router.get('/user', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User ID missing' });
    }

    const db = getDB();
    const feedbacks = await db.collection('feedbacks')
      .find({ ownerId: userId })
      .sort({ createdAt: -1 })
      .toArray();

    return res.json({ success: true, feedbacks });
  } catch (err: any) {
    console.error('feedbacks GET user error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch feedbacks' });
  }
});

export const feedbacksRouter = router;
