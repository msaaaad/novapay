// src/services/encryptionService.ts
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16;  // 128 bits
const AUTH_TAG_LENGTH = 16;

function getMasterKey(): Buffer {
  const key = process.env['ENCRYPTION_MASTER_KEY'];
  if (!key) throw new Error('ENCRYPTION_MASTER_KEY is not set');
  // Master key must be exactly 32 bytes for AES-256
  return Buffer.from(key.padEnd(32).slice(0, 32));
}

// ─────────────────────────────────────────────────────
// Low-level encrypt/decrypt using AES-256-GCM
// GCM mode gives us authenticated encryption —
// it detects if the ciphertext was tampered with
// ─────────────────────────────────────────────────────
function encrypt(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  // Store as: iv:authTag:ciphertext (all hex encoded)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(ciphertext: string, key: Buffer): string {
  const [ivHex, authTagHex, encryptedHex] = ciphertext.split(':');
  if (!ivHex || !authTagHex || !encryptedHex) {
    throw new Error('Invalid ciphertext format');
  }
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

// ─────────────────────────────────────────────────────
// Envelope encryption — public API used by Wallet model
// ─────────────────────────────────────────────────────

export interface EncryptedEnvelope {
  encryptedData: string;      // the field value, encrypted with dataKey
  encryptedDataKey: string;   // the dataKey, encrypted with masterKey
}

// Call this when WRITING a sensitive field to the DB
export function encryptField(plaintext: string): EncryptedEnvelope {
  const masterKey = getMasterKey();
  // Generate a fresh random data key for this specific value
  const dataKey = crypto.randomBytes(KEY_LENGTH);
  const encryptedData = encrypt(plaintext, dataKey);
  const encryptedDataKey = encrypt(dataKey.toString('hex'), masterKey);
  return { encryptedData, encryptedDataKey };
}

// Call this when READING a sensitive field from the DB
export function decryptField(envelope: EncryptedEnvelope): string {
  const masterKey = getMasterKey();
  const dataKeyHex = decrypt(envelope.encryptedDataKey, masterKey);
  const dataKey = Buffer.from(dataKeyHex, 'hex');
  return decrypt(envelope.encryptedData, dataKey);
}