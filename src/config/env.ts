// ============================================================
//  src/config/env.ts — Environment Variables
//  ──────────────────────────────────────────────────────────
//  This file reads all values from .env and exports them
//  as a typed object called `env`.
//
//  CommonJS equivalent:
//    const dotenv = require('dotenv')
//    dotenv.config()
//    module.exports = { PORT: process.env.PORT }
//
//  In TypeScript + ESM we use:
//    import dotenv from 'dotenv'
//    dotenv.config()
//    export const env = { PORT: ... }
// ============================================================

import dotenv from 'dotenv';
dotenv.config(); // Reads .env and loads values into process.env

// ─── Helper: crash immediately if a required variable is missing ─
const required = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `❌ Missing required environment variable: "${key}"\n` +
        `   Check your .env file (see .env.example for the template).`
    );
  }
  return value;
};

// ─── Export all environment variables as a typed object ──────
export const env = {
  // ── Server ─────────────────────────────────────────────────
  PORT: parseInt(process.env.PORT || '5000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',

  // ── Database ───────────────────────────────────────────────
  MONGODB_URI: required('MONGODB_URI'),
  DB_NAME: process.env.DB_NAME || 'plant_companion',

  // ── JWT (RSA Keys, stored as Base64 strings) ───────────────
  JWT_PRIVATE_KEY_BASE64: required('JWT_PRIVATE_KEY_BASE64'),
  JWT_PUBLIC_KEY_BASE64: required('JWT_PUBLIC_KEY_BASE64'),
  JWT_ALGORITHM: (process.env.JWT_ALGORITHM || 'RS256') as 'RS256',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',

  // ── CORS ───────────────────────────────────────────────────
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:3000',

  HF_INFERENCE_TOKEN: required('HF_INFERENCE_TOKEN'),
};
