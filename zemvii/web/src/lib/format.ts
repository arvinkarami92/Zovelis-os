// Human-friendly dates, times and numbers.

export { formatMoney } from '../../../server/src/core/money.ts';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function timeAgo(ms: number, now = Date.now()): string {
  const diff = Math.max(0, now - ms);
  if (diff < MINUTE) return 'now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d`;
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function longAgo(ms: number, now = Date.now()): string {
  const diff = Math.max(0, now - ms);
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`;
  if (diff < DAY) {
    const h = Math.floor(diff / HOUR);
    return `${h} hour${h === 1 ? '' : 's'} ago`;
  }
  const d = Math.floor(diff / DAY);
  if (d < 7) return `${d} day${d === 1 ? '' : 's'} ago`;
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

export function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function planWhen(ms: number, now = Date.now()): string {
  const date = new Date(ms);
  const today = new Date(now);
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(date) - startOf(today)) / DAY);
  const day =
    days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days === -1 ? 'Yesterday' : date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return `${day} · ${clock(ms)}`;
}

export function dateBlock(ms: number): { month: string; day: string; weekday: string } {
  const d = new Date(ms);
  return {
    month: d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase(),
    day: String(d.getDate()),
    weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
  };
}

export function compact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

export function minutes(n: number): string {
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** "HH:MM" for <input type="datetime-local"> in local time. */
export function toLocalInput(ms: number): string {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * MINUTE);
  return d.toISOString().slice(0, 16);
}

export function fromLocalInput(value: string): number {
  return new Date(value).getTime();
}
