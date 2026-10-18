import crypto from 'crypto';

function scryptAsync(password: string, salt: Buffer, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** Session tokens are stored hashed, so a leaked database cannot be replayed as admin sessions. */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Format: scrypt$<saltHex>$<keyHex> (independent of SESSION_SECRET). */
export async function hashPasswordScrypt(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scryptAsync(password, salt, 32);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

/**
 * Verifies against an scrypt hash, or against the legacy HMAC-SHA256 hex hash.
 * When a legacy hash matches, `needsUpgrade` tells the caller to re-store it as scrypt.
 */
export async function verifyPassword(
  password: string,
  stored: string,
  legacyHash: (password: string) => string
): Promise<{ ok: boolean; needsUpgrade: boolean }> {
  if (stored.startsWith('scrypt$')) {
    const [, saltHex, keyHex] = stored.split('$');
    if (!saltHex || !keyHex) return { ok: false, needsUpgrade: false };
    const expected = Buffer.from(keyHex, 'hex');
    const actual = await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length);
    return { ok: crypto.timingSafeEqual(actual, expected), needsUpgrade: false };
  }

  const a = Buffer.from(legacyHash(password));
  const b = Buffer.from(stored);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  return { ok, needsUpgrade: ok };
}
