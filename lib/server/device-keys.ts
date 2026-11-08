// Device keys: "fwk_<secret>", shown to the farmer once. Only an HMAC of the secret is stored (sensor.keyHash),
// so a leaked database or Piezas console view cannot be used to send readings. Ingest finds the sensor by
// filtering on that hash: one lookup, no scan, and creating a sensor stays a single write.
import { createHmac, randomBytes } from 'node:crypto';

const KEY_FORMAT = /^fwk_([A-Za-z0-9_-]{43})$/; // 32 random bytes in base64url = 43 chars

function pepper(): string {
  const p = process.env.DEVICE_KEY_PEPPER;
  // Changing the pepper invalidates every device key, so it is set once per app and kept.
  if (!p || p.length < 32) throw new Error('DEVICE_KEY_PEPPER is not set (at least 32 characters)');
  return p;
}

export function assertDeviceKeyConfig(): void {
  pepper();
}

export const hashDeviceKey =(secret: string) => createHmac('sha256', pepper()).update(secret).digest('hex');

export function newDeviceKey(): { key: string; hash: string } {
  const secret = randomBytes(32).toString('base64url');
  return { key: `fwk_${secret}`, hash: hashDeviceKey(secret) };
}

// The stored hash for a well-formed key, or null. Shape is checked first, so junk is turned away
// without a Piezas call. (Lookup is by the hash itself, so there is no comparison to time.)
export function deviceKeyHash(key: unknown): string | null {
  const m = typeof key === 'string' ? KEY_FORMAT.exec(key.trim()) : null;
  return m ? hashDeviceKey(m[1]) : null;
}
