// ============================================================
//  src/routes/requests.routes.ts
//  ──────────────────────────────────────────────────────────
//  POST   /api/requests       — Create a new plant request
//  GET    /api/requests       — Get all incoming/outgoing requests for the user
//  PATCH  /api/requests/:id   — Edit request (requester) or approve/reject (owner)
//  DELETE /api/requests/:id   — Delete request
// ============================================================
import { Router, Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../config/db.js';

const router = Router();

function getUserId(req: Request): string | null {
  const id = req.headers['x-user-id'];
  if (!id || typeof id !== 'string' || !id.trim()) return null;
  return id.trim();
}

// ── POST /api/requests ──────────────────────────────────────
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const {
      plantId,
      plantTitle,
      plantCategory,
      plantPrice,
      message,
      contactInfo,
      pickupDate,
      requester,
      owner,
    } = req.body;

    if (!plantId || !message || !contactInfo || !pickupDate) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const db = getDB();
    const doc = {
      plantId,
      plantTitle,
      plantCategory,
      plantPrice: Number(plantPrice),
      message: String(message).trim(),
      contactInfo: String(contactInfo).trim(),
      pickupDate: new Date(pickupDate),
      status: 'pending',
      requester: {
        id: requester.id,
        name: requester.name,
        email: requester.email,
        image: requester.image,
      },
      owner: {
        id: owner.id,
        name: owner.name,
        email: owner.email,
        image: owner.image,
      },
      deletedByOwner: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection('requests').insertOne(doc);
    return res.status(201).json({ success: true, message: 'Request sent successfully', requestId: result.insertedId });
  } catch (err: any) {
    console.error('requests POST error:', err);
    return res.status(500).json({ success: false, message: 'Failed to create request' });
  }
});

// ── GET /api/requests ───────────────────────────────────────
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const db = getDB();
    
    // Incoming: I am the owner, and I haven't deleted it
    const incomingFilter = {
      'owner.id': userId,
      deletedByOwner: { $ne: true },
    };
    
    // Outgoing: I am the requester. (No deletedByRequester flag because it's hard-deleted if they delete)
    const outgoingFilter = {
      'requester.id': userId,
    };

    const [incoming, outgoing] = await Promise.all([
      db.collection('requests').find(incomingFilter).sort({ createdAt: -1 }).toArray(),
      db.collection('requests').find(outgoingFilter).sort({ createdAt: -1 }).toArray(),
    ]);

    return res.json({ success: true, incoming, outgoing });
  } catch (err: any) {
    console.error('requests GET error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch requests' });
  }
});

// ── PATCH /api/requests/:id ─────────────────────────────────
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const id = req.params.id as string;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid request ID' });
    }

    const db = getDB();
    const existing = await db.collection('requests').findOne({ _id: new ObjectId(id) });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    const isRequester = existing.requester.id === userId;
    const isOwner = existing.owner.id === userId;

    if (!isRequester && !isOwner) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const updateDoc: Record<string, any> = { updatedAt: new Date() };
    const { message, contactInfo, pickupDate, status } = req.body;

    // Requester can only edit message, contactInfo, pickupDate if pending
    if (isRequester && !isOwner) { // If somehow they are the same person, owner logic should precede or we just separate
      if (existing.status !== 'pending') {
         return res.status(400).json({ success: false, message: 'Cannot edit a request that is not pending' });
      }
      if (message !== undefined) updateDoc.message = String(message).trim();
      if (contactInfo !== undefined) updateDoc.contactInfo = String(contactInfo).trim();
      if (pickupDate !== undefined) updateDoc.pickupDate = new Date(pickupDate);

      await db.collection('requests').updateOne({ _id: new ObjectId(id) }, { $set: updateDoc });
      return res.json({ success: true, message: 'Request updated' });
    }

    // Owner can only approve/reject
    if (isOwner) {
      if (status !== 'accepted' && status !== 'rejected') {
        return res.status(400).json({ success: false, message: 'Invalid status' });
      }

      updateDoc.status = status;
      await db.collection('requests').updateOne({ _id: new ObjectId(id) }, { $set: updateDoc });

      if (status === 'accepted') {
        // Reject all other pending requests for the same plant
        await db.collection('requests').updateMany(
          { 
            plantId: existing.plantId, 
            _id: { $ne: new ObjectId(id) },
            status: 'pending' 
          },
          { $set: { status: 'rejected', updatedAt: new Date() } }
        );

        // Update the plant availability to 'Not Available'
        await db.collection('plants').updateOne(
          { _id: new ObjectId(existing.plantId) },
          { $set: { availability: 'Not Available', updatedAt: new Date() } }
        );
      }

      return res.json({ success: true, message: `Request ${status}` });
    }
  } catch (err: any) {
    console.error('requests PATCH error:', err);
    return res.status(500).json({ success: false, message: 'Failed to update request' });
  }
});

// ── DELETE /api/requests/:id ────────────────────────────────
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const id = req.params.id as string;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid request ID' });
    }

    const db = getDB();
    const existing = await db.collection('requests').findOne({ _id: new ObjectId(id) });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    const isRequester = existing.requester.id === userId;
    const isOwner = existing.owner.id === userId;

    if (!isRequester && !isOwner) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    if (isRequester) {
      // Hard delete
      await db.collection('requests').deleteOne({ _id: new ObjectId(id) });
      return res.json({ success: true, message: 'Request deleted' });
    }

    if (isOwner) {
      // Soft delete for owner
      const updateDoc: Record<string, any> = { deletedByOwner: true, updatedAt: new Date() };
      if (existing.status === 'pending') {
        updateDoc.status = 'rejected'; // implicit reject
      }
      await db.collection('requests').updateOne({ _id: new ObjectId(id) }, { $set: updateDoc });
      return res.json({ success: true, message: 'Request removed from your view' });
    }

  } catch (err: any) {
    console.error('requests DELETE error:', err);
    return res.status(500).json({ success: false, message: 'Failed to delete request' });
  }
});

export const requestsRouter = router;
