// ============================================================
//  scripts/generate-keys.ts — RSA Key Generator
//  ──────────────────────────────────────────────────────────
//  Run this ONCE to generate your JWT signing keys:
//    npm run keys
//
//  Then copy the two lines it prints into your .env file.
//  You never need to run this again unless you want to rotate keys.
//
//  ⚠️  Rotating keys will invalidate ALL existing tokens.
//      Users will need to log in again.
// ============================================================

import { generateKeyPair, exportPKCS8, exportSPKI } from 'jose';

console.log('\n🔑 Generating RSA-2048 key pair for JWT signing...\n');
console.log('   This uses asymmetric cryptography:');
console.log('   • PRIVATE key → server uses this to SIGN tokens (keep secret!)');
console.log('   • PUBLIC key  → clients use this to VERIFY tokens (safe to share)\n');

// Generate an RSA-2048 key pair suitable for RS256
const { privateKey, publicKey } = await generateKeyPair('RS256', {
  modulusLength: 2048,
  extractable: true, // Required to export the key as PEM/JWK
});

// Export as PEM format (standard text format for cryptographic keys)
const privateKeyPem = await exportPKCS8(privateKey);
const publicKeyPem = await exportSPKI(publicKey);

// Encode as Base64 so the multi-line PEM fits on a single .env line
const privateKeyBase64 = Buffer.from(privateKeyPem).toString('base64');
const publicKeyBase64 = Buffer.from(publicKeyPem).toString('base64');

console.log('✅ Keys generated! Copy these two lines into your .env file:\n');
console.log('─'.repeat(70));
console.log(`JWT_PRIVATE_KEY_BASE64=${privateKeyBase64}`);
console.log(`JWT_PUBLIC_KEY_BASE64=${publicKeyBase64}`);
console.log('─'.repeat(70));
console.log('\n⚠️  JWT_PRIVATE_KEY_BASE64 is your server secret. NEVER commit it to git!');
console.log('   JWT_PUBLIC_KEY_BASE64 is safe to expose (it\'s already public via /api/auth/jwks)\n');
