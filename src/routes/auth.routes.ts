// ============================================================
//  src/routes/auth.routes.ts — Auth Routes  (/api/auth/*)
//  ──────────────────────────────────────────────────────────
//  Mounted at /api/auth in src/routes/index.ts
//  So the full paths are:
//    GET  /api/auth/jwks     → Public key set for JWT verification
//    POST /api/auth/register → Create a new account
//    POST /api/auth/login    → Log in and get a JWT
// ============================================================

import { Router } from 'express';
import { getJWKS, signJWT } from '../utils/jwt.utils.js';
import { getDB } from '../config/db.js';
import { authenticate } from '../middleware/auth.middleware.js';
import bcrypt from 'bcryptjs';
import { ObjectId } from 'mongodb';

export const authRouter = Router();

// ─── GET /api/auth/jwks ───────────────────────────────────────
// ⚠️  This endpoint must be PUBLIC (no authenticate middleware)
// Returns the RSA public key in JWKS format.
//
// The Next.js client can call this to verify tokens:
//   const JWKS = createRemoteJWKSet(new URL('/api/auth/jwks', SERVER_URL))
//   const { payload } = await jwtVerify(token, JWKS)
authRouter.get('/jwks', async (req, res) => {
  try {
    const jwks = await getJWKS();
    // Set caching headers — clients can cache the public key for 1 hour
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json(jwks);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load JWKS' });
  }
});

// ─── POST /api/auth/register ──────────────────────────────────
authRouter.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Basic validation
    if (!name || !email || !password) {
      res.status(400).json({ success: false, message: 'Name, email and password are required' });
      return;
    }

    const db = getDB();
    const usersCollection = db.collection('users');

    // Check if email already exists
    const existingUser = await usersCollection.findOne({ email });
    if (existingUser) {
      res.status(409).json({ success: false, message: 'Email already in use' });
      return;
    }

    // Hash the password before saving (never store plain text passwords)
    const hashedPassword = await bcrypt.hash(password, 12);

    // Insert the new user
    const result = await usersCollection.insertOne({
      name,
      email,
      password: hashedPassword,
      role: 'user',
      createdAt: new Date(),
    });

    // Sign a JWT for the new user
    const token = await signJWT({
      sub: result.insertedId.toString(), // "sub" = user ID
      email,
      name,
      role: 'user',
    });

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      token,
      user: { id: result.insertedId, name, email, role: 'user' },
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, message: 'Registration failed' });
  }
});

// ─── POST /api/auth/sign-up/email ──────────────────────────────────
// Alias for sign‑up via Better‑Auth client (email/password)
authRouter.post('/sign-up/email', async (req, res) => {
  try {
    // Reuse the same register logic – expects name, email, password
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      res.status(400).json({ success: false, message: 'Name, email and password are required' });
      return;
    }
    const db = getDB();
    const usersCollection = db.collection('users');
    const existingUser = await usersCollection.findOne({ email });
    if (existingUser) {
      res.status(409).json({ success: false, message: 'Email already in use' });
      return;
    }
    const hashedPassword = await bcrypt.hash(password, 12);
    const result = await usersCollection.insertOne({
      name,
      email,
      password: hashedPassword,
      role: 'user',
      createdAt: new Date(),
    });
    const token = await signJWT({
      sub: result.insertedId.toString(),
      email,
      name,
      role: 'user',
    });
    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      token,
      user: { id: result.insertedId, name, email, role: 'user' },
    });
  } catch (error) {
    console.error('Sign‑up email error:', error);
    res.status(500).json({ success: false, message: 'Registration failed' });
  }
});

// ─── POST /api/auth/login ─────────────────────────────────────
authRouter.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ success: false, message: 'Email and password are required' });
      return;
    }

    const db = getDB();
    const user = await db.collection('users').findOne({ email });

    // Return the same message for wrong email or wrong password
    // (don't reveal which one is wrong — security best practice)
    if (!user) {
      res.status(401).json({ success: false, message: 'Invalid email or password' });
      return;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      res.status(401).json({ success: false, message: 'Invalid email or password' });
      return;
    }

    // Issue a new JWT
    const token = await signJWT({
      sub: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
    });

    res.json({
      success: true,
      message: 'Logged in successfully',
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

// ─── GET /api/auth/me ─────────────────────────────────────────
// Protected route — returns the current user's profile
// The `authenticate` middleware verifies the Bearer token first
authRouter.get('/me', authenticate, (req, res) => {
  res.json({
    success: true,
    user: req.user,
  });
});

// ─── PATCH /api/auth/profile ─────────────────────────────────
authRouter.patch('/profile', async (req, res) => {
  try {
    const { userId, name, email, image } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    const db = getDB();
    const updateDoc: any = {};
    if (name !== undefined) updateDoc.name = name.trim();
    if (email !== undefined) updateDoc.email = email.trim();
    if (image !== undefined) updateDoc.image = image;
    updateDoc.updatedAt = new Date();

    // Perform queries on both 'user' and 'users' collections
    // Support lookup via ObjectId and raw string id to prevent version conflicts
    const objectId = ObjectId.isValid(userId) ? new ObjectId(userId) : null;

    if (objectId) {
      await db.collection('user').updateOne({ _id: objectId }, { $set: updateDoc });
      await db.collection('users').updateOne({ _id: objectId }, { $set: updateDoc });
    }

    await db.collection('user').updateOne({ _id: userId as any }, { $set: updateDoc });
    await db.collection('user').updateOne({ id: userId }, { $set: updateDoc });
    await db.collection('users').updateOne({ _id: userId as any }, { $set: updateDoc });
    await db.collection('users').updateOne({ id: userId }, { $set: updateDoc });

    return res.json({ success: true, message: 'Profile updated successfully' });
  } catch (error: any) {
    console.error('Profile update failure:', error);
    return res.status(500).json({ success: false, message: 'Failed to update profile info' });
  }
});
