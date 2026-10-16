// Input validation helpers. Every value from a client passes through one of
// these before it reaches storage.

import { badRequest } from './errors.ts';
import { cleanText } from '../core/text.ts';

export function str(value: unknown, field: string, opts: { min?: number; max: number; required?: boolean }): string {
  if (value === undefined || value === null) {
    if (opts.required) throw badRequest(`${field} is required.`, { field });
    return '';
  }
  if (typeof value !== 'string') throw badRequest(`${field} must be text.`, { field });
  const text = cleanText(value, opts.max + 1);
  if (text.length > opts.max) throw badRequest(`${field} is too long (max ${opts.max}).`, { field });
  if ((opts.required || text.length > 0) && text.length < (opts.min ?? (opts.required ? 1 : 0))) {
    throw badRequest(`${field} is too short.`, { field });
  }
  return text;
}

export function optionalStr(value: unknown, field: string, max: number): string | undefined {
  return value === undefined ? undefined : str(value, field, { max });
}

export function oneOf<T extends string>(value: unknown, field: string, allowed: readonly T[], fallback?: T): T {
  if ((value === undefined || value === null) && fallback !== undefined) return fallback;
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T;
  throw badRequest(`${field} must be one of: ${allowed.join(', ')}.`, { field });
}

export function int(value: unknown, field: string, opts: { min: number; max: number; fallback?: number }): number {
  if ((value === undefined || value === null || value === '') && opts.fallback !== undefined) return opts.fallback;
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < opts.min || n > opts.max) {
    throw badRequest(`${field} must be a whole number between ${opts.min} and ${opts.max}.`, { field });
  }
  return n;
}

export function bool(value: unknown, field: string, fallback?: boolean): boolean {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'boolean') throw badRequest(`${field} must be true or false.`, { field });
  return value;
}

export function strList(value: unknown, field: string, opts: { maxItems: number; maxLength: number }): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw badRequest(`${field} must be a list.`, { field });
  if (value.length > opts.maxItems) throw badRequest(`${field} has too many items (max ${opts.maxItems}).`, { field });
  const out: string[] = [];
  for (const item of value) {
    const text = str(item, field, { max: opts.maxLength }).toLowerCase();
    if (text && !out.includes(text)) out.push(text);
  }
  return out;
}

export function obj(value: unknown, field = 'body'): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw badRequest(`${field} must be an object.`, { field });
  return value as Record<string, unknown>;
}

/** Accepts http(s) URLs only (no javascript: or data: links on profiles). */
export function url(value: unknown, field: string): string {
  const text = str(value, field, { max: 200 });
  if (!text) return '';
  const candidate = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('protocol');
    return parsed.toString();
  } catch {
    throw badRequest(`${field} must be a web address.`, { field });
  }
}
