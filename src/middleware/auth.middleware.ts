// ============================================================
//  src/middleware/auth.middleware.ts — JWT Auth Middleware
//  ──────────────────────────────────────────────────────────
//  Add this middleware to any route that requires the user
//  to be logged in.
//
//  Usage in a route file:
//    import { authenticate } from '../middleware/auth.middleware.js'
//    router.get('/profile', authenticate, (req, res) => {
//      res.json({ user: req.user }) // req.user is set by this middleware
//    })
//
//  The client must send:
//    Authorization: Bearer eyJhbGci...
// ============================================================

import { Request, Response, NextFunction } from 'express';
import { verifyJWT } from '../utils/jwt.utils.js';

// ─── Extend Express's Request type ───────────────────────────
// This tells TypeScript that req.user exists after authentication
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
        [key: string]: unknown; // Allow any additional fields from the JWT payload
      };
    }
  }
}

// ─── Middleware Function ──────────────────────────────────────
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // 1. Check that the Authorization header exists and starts with "Bearer "
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        message: 'No token provided. Include "Authorization: Bearer <token>" header.',
      });
      return;
    }

    // 2. Extract the token string (remove "Bearer " prefix)
    const token = authHeader.split(' ')[1];

    // 3. Verify the token — throws an error if invalid or expired
    const payload = await verifyJWT(token);

    // 4. Attach user info to the request so route handlers can access it
    req.user = {
      userId: payload.sub as string,  // "sub" = subject (usually the user ID)
      email: payload.email as string,
      ...payload,
    };

    // 5. Call next() to proceed to the actual route handler
    next();
  } catch {
    res.status(401).json({
      success: false,
      message: 'Invalid or expired token. Please log in again.',
    });
  }
};
