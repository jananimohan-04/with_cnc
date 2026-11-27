/**
 * Fernet (AES-128-CBC + HMAC-SHA256), byte-compatible with Python's cryptography.fernet, which Argus Leads used
 * to encrypt provider tokens at rest (TOKEN_ENCRYPTION_KEY). A key made by `Fernet.generate_key()` works here
 * and the other way round.
 *
 *   token = base64url( 0x80 | timestamp (8 bytes, big endian) | iv (16) | ciphertext | hmac-sha256 (32) )
 *   key   = base64url( signing key (16) | encryption key (16) )
 */
'use strict';
const crypto = require('crypto');

function b64urlDecode(s) {
  const clean = String(s || '').trim().replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return Buffer.from(clean, 'base64url');
}
const b64urlEncode = (buf) => {
  const s = buf.toString('base64url');
  return s + '='.repeat((4 - (s.length % 4)) % 4);
};

/** { signing, encryption } from a key string, or null when it is not a 32-byte key. */
function parseKey(key) {
  if (!key) return null;
  const raw = b64urlDecode(key);
  if (raw.length !== 32) return null;
  return { signing: raw.subarray(0, 16), encryption: raw.subarray(16) };
}

function encrypt(key, plaintext) {
  const k = parseKey(key);
  if (!k) throw new Error('TOKEN_ENCRYPTION_KEY is not a valid key (it must be 32 random bytes in base64).');
  const iv = crypto.randomBytes(16);
  const ts = Buffer.alloc(8);
  ts.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000)));
  const cipher = crypto.createCipheriv('aes-128-cbc', k.encryption, iv);
  const ct = Buffer.concat([cipher.update(Buffer.from(String(plaintext), 'utf8')), cipher.final()]);
  const body = Buffer.concat([Buffer.from([0x80]), ts, iv, ct]);
  const mac = crypto.createHmac('sha256', k.signing).update(body).digest();
  return b64urlEncode(Buffer.concat([body, mac]));
}

function decrypt(key, token) {
  const k = parseKey(key);
  if (!k) throw new Error('TOKEN_ENCRYPTION_KEY is not a valid key (it must be 32 random bytes in base64).');
  const data = b64urlDecode(token);
  if (data.length < 1 + 8 + 16 + 16 + 32 || data[0] !== 0x80) throw new Error('Stored token is not in the expected format.');
  const body = data.subarray(0, data.length - 32);
  const mac = data.subarray(data.length - 32);
  const expected = crypto.createHmac('sha256', k.signing).update(body).digest();
  if (!crypto.timingSafeEqual(mac, expected)) throw new Error('Stored token could not be decrypted (the encryption key may have changed).');
  const iv = body.subarray(9, 25);
  const ct = body.subarray(25);
  const decipher = crypto.createDecipheriv('aes-128-cbc', k.encryption, iv);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt, parseKey };
