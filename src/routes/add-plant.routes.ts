// ============================================================
//  src/routes/add-plant.routes.ts — Add Plant Route (/api/add-plant)
//  Accepts a JSON body where `images` is already an array of
//  public ImgBB URLs (uploaded client-side via /api/upload).
// ============================================================
import { Router, Request, Response } from 'express';
import { getDB } from '../config/db.js';

const router = Router();

const DEFAULT_IMAGE = 'https://i.ibb.co.com/N0JFXfB/image.png';

router.post('/', async (req: Request, res: Response) => {
  console.log('🔧 add-plant body keys:', Object.keys(req.body));

  try {
    const {
      title,
      botanical,
      price,
      quantity,
      potSize,
      growth,
      light,
      petSafe,
      category,
      description,
      images,      // string[] — already uploaded ImgBB URLs
      userId,
      userName,
      userEmail,
      userImage,
    } = req.body;

    // ── Required field validation ────────────────────────────
    if (!title || !String(title).trim()) {
      return res.status(400).json({ success: false, message: 'Plant title is required' });
    }
    if (price === undefined || price === null || isNaN(Number(price))) {
      return res.status(400).json({ success: false, message: 'Valid price is required' });
    }
    if (!quantity || isNaN(Number(quantity)) || Number(quantity) < 1) {
      return res.status(400).json({ success: false, message: 'Valid quantity is required' });
    }
    if (!potSize) {
      return res.status(400).json({ success: false, message: 'Pot size is required' });
    }
    if (!growth) {
      return res.status(400).json({ success: false, message: 'Growth condition is required' });
    }
    if (!light) {
      return res.status(400).json({ success: false, message: 'Light requirement is required' });
    }
    if (!category) {
      return res.status(400).json({ success: false, message: 'Category is required' });
    }

    // ── Normalise images array ──────────────────────────────
    const imageUrls: string[] =
      Array.isArray(images) && images.length > 0
        ? images.filter((url: unknown) => typeof url === 'string' && url.trim())
        : [DEFAULT_IMAGE];

    // ── Build document & insert ─────────────────────────────
    const plantDoc = {
      title:       String(title).trim(),
      botanical:   botanical ? String(botanical).trim() : '',
      price:       Number(price),
      quantity:    Number(quantity),
      potSize,
      growth,
      light,
      petSafe:     petSafe === true || petSafe === 'true',
      category,
      description: description ? String(description).trim() : '',
      owner: {
        id:    userId    || '',
        name:  userName  || '',
        email: userEmail || '',
        image: userImage || '',
      },
      images:    imageUrls,
      createdAt: new Date(),
    };

    const db = getDB();
    const result = await db.collection('plants').insertOne(plantDoc);

    return res.status(201).json({
      success: true,
      message: 'Plant added successfully',
      plantId: result.insertedId,
    });
  } catch (error: any) {
    console.error('Add plant error:', error);
    return res.status(500).json({ success: false, message: 'Failed to add plant' });
  }
});

export const addPlantRouter = router;
