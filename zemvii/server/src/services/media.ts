// Uploads. The file type is checked from its first bytes (not from what the
// client claims), and sizes are capped.

import type { App } from './app.ts';
import type { MediaRow, UserRow } from '../store/types.ts';
import { newId } from '../store/store.ts';
import { HttpError, badRequest } from './errors.ts';
import { assertCanAct } from './graph.ts';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 60 * 1024 * 1024;

export const MEDIA_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) => signature.every((b, i) => bytes[offset + i] === b);

/** Detect the real type of an upload from its magic bytes. */
export function sniffMime(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return 'image/gif';
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  if (startsWith(bytes, [0x66, 0x74, 0x79, 0x70], 4)) {
    // ISO media: only video brands (HEIC/AVIF images share the same box).
    const brand = String.fromCharCode(...bytes.slice(8, 12));
    return ['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V ', 'dash', 'qt  '].includes(brand) ? 'video/mp4' : null;
  }
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return 'video/webm';
  return null;
}

export async function uploadMedia(app: App, me: UserRow, bytes: Uint8Array | undefined): Promise<Pick<MediaRow, 'id' | 'url' | 'mime' | 'size'>> {
  assertCanAct(app, me);
  if (!bytes || bytes.length === 0) throw badRequest('The file is empty.');
  const mime = sniffMime(bytes);
  if (!mime) throw badRequest('Upload a JPEG, PNG, WebP or GIF photo, or an MP4 or WebM video.');
  const limit = mime.startsWith('video/') ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (bytes.length > limit) throw new HttpError(413, 'too_large', `That file is too large (max ${Math.round(limit / 1024 / 1024)} MB).`);
  const id = newId(16);
  const url = await app.media.save(bytes, mime, id);
  const row: MediaRow = { id, ownerId: me.id, mime, size: bytes.length, url, createdAt: app.now() };
  await app.store.insert('media', row);
  return { id, url, mime, size: bytes.length };
}
