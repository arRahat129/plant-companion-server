// ============================================================
//  src/config/db.ts — MongoDB Connection
//  ──────────────────────────────────────────────────────────
//  Uses the official MongoDB Node.js driver (not Mongoose).
//
//  Two exported functions:
//    connectDB() → call once when server starts
//    getDB()     → call anywhere you need to query the database
// ============================================================

import { MongoClient, Db } from 'mongodb';
import { env } from './env.js'; // Note: .js extension is required in NodeNext ESM

// These are module-level variables — they persist for the server's lifetime
let client: MongoClient;
let db: Db;

// ─── Connect to MongoDB ───────────────────────────────────────
// Call this ONCE in src/index.ts before starting the server
export const connectDB = async (): Promise<void> => {
  try {
    client = new MongoClient(env.MONGODB_URI);
    await client.connect();
    db = client.db(env.DB_NAME);
    console.log(`✅ MongoDB connected → database: "${env.DB_NAME}"`);
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1); // Stop the server — can't run without a database
  }
};

// ─── Get the database instance ────────────────────────────────
// Use this in your route handlers and services:
//   import { getDB } from '../config/db.js'
//   const db = getDB()
//   const plants = await db.collection('plants').find().toArray()
export const getDB = (): Db => {
  if (!db) throw new Error('Database not initialized. Call connectDB() first.');
  return db;
};

// ─── Get the raw MongoClient (for transactions, etc.) ─────────
export const getClient = (): MongoClient => {
  if (!client) throw new Error('MongoClient not initialized.');
  return client;
};
