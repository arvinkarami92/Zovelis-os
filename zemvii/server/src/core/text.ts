// Small text helpers: hashtags, mentions, handles, slugs.

import { RESERVED_HANDLES } from './defaults.ts';

const HASHTAG = /(^|[^\p{L}\p{N}_&])#([\p{L}\p{N}_]{2,30})/gu;
const MENTION = /(^|[^\p{L}\p{N}_@])@([a-z0-9_]{3,20})\b/giu;

/** Lower-cased hashtags in order of first appearance (max 10). */
export function extractTopics(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(HASHTAG)) {
    const tag = match[2].toLowerCase();
    if (!found.includes(tag)) found.push(tag);
    if (found.length === 10) break;
  }
  return found;
}

/** Lower-cased @handles in order of first appearance (max 20). */
export function extractMentions(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(MENTION)) {
    const handle = match[2].toLowerCase();
    if (!found.includes(handle)) found.push(handle);
    if (found.length === 20) break;
  }
  return found;
}

export const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;

/** Returns an error message, or null when the handle is acceptable. */
export function validateHandle(handle: string): string | null {
  if (!HANDLE_PATTERN.test(handle)) return 'Handles are 3–20 characters: lowercase letters, numbers and _.';
  if (RESERVED_HANDLES.has(handle)) return 'That handle is reserved.';
  return null;
}

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'space'
  );
}

/** Trim and collapse runs of blank lines; reject control characters. */
export function cleanText(text: unknown, max: number): string {
  if (typeof text !== 'string') return '';
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

export function containsAnyWord(text: string, words: string[]): boolean {
  if (words.length === 0) return false;
  const lower = text.toLowerCase();
  return words.some((word) => {
    const w = word.trim().toLowerCase();
    if (!w) return false;
    const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'u').test(lower);
  });
}
