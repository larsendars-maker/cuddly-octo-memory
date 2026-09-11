import crypto from 'node:crypto';
let runtimeKey = null;
function getKey() {
  const raw = process.env.PHOTO_ENCRYPTION_KEY || '';
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw,'hex');
  if (!runtimeKey) {
    runtimeKey = crypto.randomBytes(32);
    console.warn('[OrbitDesk] PHOTO_ENCRYPTION_KEY is missing; using an ephemeral runtime key. Set PHOTO_ENCRYPTION_KEY in Render for persistent photo decryption across restarts.');
  }
  return runtimeKey;
}
export function encryptBuffer(input){ const iv=crypto.randomBytes(12); const c=crypto.createCipheriv('aes-256-gcm',getKey(),iv);const ct=Buffer.concat([c.update(input),c.final()]);return Buffer.concat([iv,c.getAuthTag(),ct]); }
export function decryptBuffer(input){if(!Buffer.isBuffer(input)||input.length<28)throw new Error('BAD_CIPHERTEXT');const iv=input.subarray(0,12),tag=input.subarray(12,28),ct=input.subarray(28);const d=crypto.createDecipheriv('aes-256-gcm',getKey(),iv);d.setAuthTag(tag);return Buffer.concat([d.update(ct),d.final()]);}
export function randomSecret(bytes=32){return crypto.randomBytes(bytes).toString('hex');}
