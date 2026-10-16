// Password hashing and tokens with WebCrypto, which exists both in Node and
// in browsers, so the same code runs in the server and the demo.
//
// Passwords: PBKDF2-HMAC-SHA256, 600,000 iterations (OWASP 2023 guidance),
// 16-byte random salt, stored as pbkdf2$sha256$<iterations>$<salt>$<hash>.
// Session and recovery secrets are 32 random bytes; only their SHA-256 is stored.

const encoder = new TextEncoder();

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function randomToken(bytes = 32): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return toBase64Url(buffer);
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Compare without leaking where the inputs differ. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string, iterations: number): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const hash = await pbkdf2(password, salt, iterations);
  return `pbkdf2$sha256$${iterations}$${toBase64Url(salt)}$${toBase64Url(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 5 || parts[0] !== 'pbkdf2' || parts[1] !== 'sha256') return false;
  const iterations = Number(parts[2]);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 10_000_000) return false;
  const hash = await pbkdf2(password, fromBase64Url(parts[3]), iterations);
  return timingSafeEqual(hash, fromBase64Url(parts[4]));
}

/** Password rules: long enough to matter, no arbitrary composition rules (NIST SP 800-63B). */
export function passwordProblem(password: unknown): string | null {
  if (typeof password !== 'string') return 'Enter a password.';
  if (password.length < 10) return 'Use at least 10 characters.';
  if (password.length > 200) return 'That password is too long.';
  const lower = password.toLowerCase();
  if (['password12', 'password123', '1234567890', 'qwertyuiop', 'zemvii1234', '0123456789'].includes(lower)) {
    return 'That password is too common.';
  }
  if (new Set(password).size < 4) return 'Use a less repetitive password.';
  return null;
}
