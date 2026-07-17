// ============================================================
//  src/utils/jwt.utils.ts — JWT Signing & Verification
//  ──────────────────────────────────────────────────────────
//  We use the `jose` library because:
//    ✅ Works in Node.js, Edge runtimes, Vercel, Cloudflare Workers
//    ✅ Uses the Web Crypto API (no native bindings)
//    ✅ ESM-native — no CommonJS compatibility issues
//
//  How the RSA flow works:
//    1. Server signs JWT with PRIVATE key  → gives token to user
//    2. Client fetches PUBLIC key from GET /api/auth/jwks
//    3. Client (or any service) verifies JWT using the PUBLIC key
//    → No shared secret needed between server and client!
// ============================================================

import {
  SignJWT,
  jwtVerify,
  importPKCS8,
  importSPKI,
  exportJWK,
  type JWTPayload,
  type KeyLike,
} from 'jose';
import { env } from '../config/env.js';

// Key ID — a label for the key so clients know which key was used
const KEY_ID = 'plant-companion-key-1';

// ─── Load keys from .env (cached after first load) ───────────
let _privateKey: KeyLike | null = null;
let _publicKey: KeyLike | null = null;

const getPrivateKey = async (): Promise<KeyLike> => {
  if (_privateKey) return _privateKey;
  // Decode Base64 → PEM string → CryptoKey
  const pem = Buffer.from(env.JWT_PRIVATE_KEY_BASE64, 'base64').toString('utf-8');
  _privateKey = await importPKCS8(pem, env.JWT_ALGORITHM);
  return _privateKey;
};

const getPublicKey = async (): Promise<KeyLike> => {
  if (_publicKey) return _publicKey;
  const pem = Buffer.from(env.JWT_PUBLIC_KEY_BASE64, 'base64').toString('utf-8');
  _publicKey = await importSPKI(pem, env.JWT_ALGORITHM);
  return _publicKey;
};

// ─── Sign a JWT token ─────────────────────────────────────────
// payload: any data you want to store in the token (e.g. userId, email)
// Returns: a JWT string like "eyJhbGci..."
export const signJWT = async (
  payload: Record<string, unknown>,
  expiresIn: string = env.JWT_EXPIRES_IN
): Promise<string> => {
  const privateKey = await getPrivateKey();

  return new SignJWT(payload)
    .setProtectedHeader({ alg: env.JWT_ALGORITHM, kid: KEY_ID })
    .setIssuedAt()                          // "iat" — when the token was created
    .setExpirationTime(expiresIn)           // "exp" — when the token expires
    .setIssuer('plant-companion-server')    // "iss" — who issued the token
    .sign(privateKey);
};

// ─── Verify a JWT token ───────────────────────────────────────
// token: the JWT string (without the "Bearer " prefix)
// Returns: the decoded payload, or throws if invalid/expired
export const verifyJWT = async (token: string): Promise<JWTPayload> => {
  const publicKey = await getPublicKey();
  const { payload } = await jwtVerify(token, publicKey, {
    issuer: 'plant-companion-server',
    algorithms: [env.JWT_ALGORITHM],
  });
  return payload;
};

// ─── Get JWKS (JSON Web Key Set) ─────────────────────────────
// Served at GET /api/auth/jwks
// The Next.js frontend (or any client) fetches this to get the
// public key and verify JWTs without calling the backend.
export const getJWKS = async () => {
  const publicKey = await getPublicKey();
  const jwk = await exportJWK(publicKey);
  return {
    keys: [
      {
        ...jwk,
        alg: env.JWT_ALGORITHM,
        use: 'sig',   // "sig" = this key is used for signing (not encryption)
        kid: KEY_ID,  // Key ID — must match the "kid" in the JWT header
      },
    ],
  };
};
