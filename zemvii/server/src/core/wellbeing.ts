// Wellbeing: local days, quiet hours, notification digests, time budget.
// Times are handled with the user's UTC offset (reported by the client).

import type { WellbeingSettings } from '../store/types.ts';

const MINUTE = 60_000;
const DAY = 86_400_000;

/** Local delivery slots for digest-mode notifications. */
export const DIGEST_TIMES = ['08:00', '13:00', '19:00'];

export function parseHM(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return 0;
  return (Math.min(23, Number(match[1])) * 60 + Math.min(59, Number(match[2]))) % 1440;
}

export function isValidHM(value: unknown): value is string {
  return typeof value === 'string' && /^([01]?\d|2[0-3]):[0-5]\d$/.test(value);
}

/** "YYYY-MM-DD" in the user's local time. */
export function dayKey(now: number, tzOffsetMin: number): string {
  return new Date(now + tzOffsetMin * MINUTE).toISOString().slice(0, 10);
}

/** Minutes since local midnight. */
export function minutesOfDay(now: number, tzOffsetMin: number): number {
  const local = now + tzOffsetMin * MINUTE;
  return Math.floor((((local % DAY) + DAY) % DAY) / MINUTE);
}

/** True when `minute` lies in [start, end), wrapping past midnight. */
function inWindow(minute: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

export function inQuietHours(now: number, tzOffsetMin: number, ws: WellbeingSettings): boolean {
  if (!ws.quietHours) return false;
  return inWindow(minutesOfDay(now, tzOffsetMin), parseHM(ws.quietStart), parseHM(ws.quietEnd));
}

/** The next moment (strictly after `now`) when the local clock shows `minuteOfDay`. */
export function nextLocalTime(now: number, tzOffsetMin: number, minuteOfDay: number): number {
  const local = now + tzOffsetMin * MINUTE;
  const msOfDay = ((local % DAY) + DAY) % DAY;
  const delta = (minuteOfDay * MINUTE - msOfDay + DAY) % DAY || DAY;
  return now + delta;
}

export function nextDigestAt(now: number, tzOffsetMin: number, ws: WellbeingSettings): number {
  const quietStart = parseHM(ws.quietStart);
  const quietEnd = parseHM(ws.quietEnd);
  const slots = DIGEST_TIMES.map(parseHM).filter((m) => !ws.quietHours || !inWindow(m, quietStart, quietEnd));
  const candidates = (slots.length ? slots : [parseHM(ws.quietEnd)]).map((m) => nextLocalTime(now, tzOffsetMin, m));
  return Math.min(...candidates);
}

/**
 * When a notification should appear. Urgent ones (messages from friends,
 * account security, recovery) are immediate; others respect quiet hours and
 * the digest setting.
 */
export function deliveryTime(now: number, tzOffsetMin: number, ws: WellbeingSettings, urgent: boolean): number {
  if (urgent) return now;
  if (ws.notifications === 'digest') return nextDigestAt(now, tzOffsetMin, ws);
  if (inQuietHours(now, tzOffsetMin, ws)) return nextLocalTime(now, tzOffsetMin, parseHM(ws.quietEnd));
  return now;
}

export interface BudgetStatus {
  usedMin: number;
  budgetMin: number;
  /** 0–1+, share of the budget used; 0 when no budget is set. */
  fraction: number;
  state: 'off' | 'ok' | 'near' | 'over';
}

export function budgetStatus(secondsToday: number, budgetMin: number): BudgetStatus {
  const usedMin = Math.floor(secondsToday / 60);
  if (!budgetMin) return { usedMin, budgetMin: 0, fraction: 0, state: 'off' };
  const fraction = secondsToday / (budgetMin * 60);
  return { usedMin, budgetMin, fraction, state: fraction >= 1 ? 'over' : fraction >= 0.8 ? 'near' : 'ok' };
}

export const INTENTS = [
  { id: 'friends', label: 'Catch up with friends', emoji: '👋', route: '/home?feed=friends' },
  { id: 'discover', label: 'Discover something new', emoji: '🧭', route: '/home?feed=mix' },
  { id: 'create', label: 'Share something', emoji: '✍️', route: '/compose' },
  { id: 'plans', label: 'Make plans', emoji: '📅', route: '/plans' },
  { id: 'messages', label: 'Just my messages', emoji: '💬', route: '/messages' },
] as const;

export type IntentId = (typeof INTENTS)[number]['id'];
