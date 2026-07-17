// ============================================================
//  src/routes/add-plant.routes.ts — Add Plant Route (/api/add-plant)
//  Handles adding a new plant (including optional image upload).
//  Mounted in src/routes/index.ts.
// ============================================================

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { getDB } from '../config/db.js';

const router = Router();

// Use multer memory storage for simplicity
const upload = multer({ storage: multer.memoryStorage() });

router.post(
  '/',
  upload.array('images'),
  async (req: Request, res: Response) => {
    console.log('🔧 add-plant request body:', req.body);
    console.log('🔧 add-plant files:', req.files);

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
        userId,
        userName,
        userEmail,
        userImage,
      } = req.body;

      if (!title || !price || !quantity) {
        return res
          .status(400)
          .json({ success: false, message: 'Missing required fields' });
      }

      const plantDoc = {
        title,
        botanical,
        price: Number(price),
        quantity: Number(quantity),
        potSize,
        growth,
        light,
        petSafe: petSafe === 'true' || petSafe === true,
        category,
        description,
        owner: {
          id: userId,
          name: userName,
          email: userEmail,
          image: userImage,
        },
        images: [] as { buffer: Buffer; mimetype: string }[],
        createdAt: new Date(),
      };

      if (req.files && Array.isArray(req.files)) {
        for (const file of req.files as Express.Multer.File[]) {
          plantDoc.images.push({ buffer: file.buffer, mimetype: file.mimetype });
        }
      }

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
  }
);

export const addPlantRouter = router;
