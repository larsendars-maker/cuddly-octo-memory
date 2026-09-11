import crypto from 'node:crypto';

function getKey() {
  const raw = process.env.PHOTO_ENCRYPTION_KEY || '';
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error('PHOTO_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  }
  return Buffer.from(raw, 'hex');
}

export function encryptBuffer(input) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(input), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]);
}

export function decryptBuffer(input) {
  if (!Buffer.isBuffer(input) || input.length < 28) throw new Error('BAD_CIPHERTEXT');
  const iv = input.subarray(0, 12);
  const tag = input.subarray(12, 28);
  const ciphertext = input.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function randomSecret(bytes = 32) { return crypto.randomBytes(bytes).toString('base64url'); }
