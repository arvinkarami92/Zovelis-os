// Time on Zemvii, intents, and the weekly reflection. The point is to help
// people use the app on purpose, not to maximise minutes.

import type { App } from './app.ts';
import type { UserRow } from '../store/types.ts';
import { budgetStatus, dayKey, inQuietHours, INTENTS, nextDigestAt, type BudgetStatus } from '../core/wellbeing.ts';
import { int, oneOf } from './validate.ts';

const DAY = 86_400_000;
/** Heartbeats are sent every ~30s while the app is visible; cap each one. */
const MAX_HEARTBEAT_SECONDS = 120;

export async function heartbeat(app: App, me: UserRow, input: { seconds?: unknown; newSession?: unknown }): Promise<BudgetStatus> {
  const seconds = int(input.seconds, 'Seconds', { min: 0, max: MAX_HEARTBEAT_SECONDS, fallback: 0 });
  const day = dayKey(app.now(), me.settings.tzOffsetMin);
  const id = `u_${me.id}_${day}`;
  const existing = await app.store.get('usage', id);
  const row = existing ?? { id, userId: me.id, day, seconds: 0, sessions: 0, intents: {}, updatedAt: app.now() };
  row.seconds += seconds;
  if (input.newSession === true) row.sessions += 1;
  row.updatedAt = app.now();
  await app.store.upsert('usage', row);
  return budgetStatus(row.seconds, me.settings.wellbeing.dailyBudgetMin);
}

export async function recordIntent(app: App, me: UserRow, intent: unknown): Promise<void> {
  const value = oneOf(intent, 'Intent', INTENTS.map((i) => i.id));
  const day = dayKey(app.now(), me.settings.tzOffsetMin);
  const id = `u_${me.id}_${day}`;
  const row = (await app.store.get('usage', id)) ?? { id, userId: me.id, day, seconds: 0, sessions: 0, intents: {}, updatedAt: app.now() };
  row.intents = { ...row.intents, [value]: (row.intents[value] ?? 0) + 1 };
  row.updatedAt = app.now();
  await app.store.upsert('usage', row);
}

export interface WellbeingSummary {
  today: BudgetStatus;
  week: Array<{ day: string; minutes: number }>;
  averageMinutes: number;
  intents: Record<string, number>;
  connections: { conversations: number; comments: number; plans: number; reactionsFromFriends: number };
  quietNow: boolean;
  nextDigestAt: number | null;
}

export async function summary(app: App, me: UserRow): Promise<WellbeingSummary> {
  const now = app.now();
  const tz = me.settings.tzOffsetMin;
  const days = Array.from({ length: 7 }, (_, i) => dayKey(now - (6 - i) * DAY, tz));
  const rows = await app.store.find('usage', { where: { userId: me.id, day: { in: days } } });
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const week = days.map((day) => ({ day, minutes: Math.round((byDay.get(day)?.seconds ?? 0) / 60) }));
  const intents: Record<string, number> = {};
  for (const r of rows) for (const [k, v] of Object.entries(r.intents)) intents[k] = (intents[k] ?? 0) + v;
  const since = now - 7 * DAY;
  const [messages, comments, rsvps, following] = await Promise.all([
    app.store.find('messages', { where: { senderId: me.id, createdAt: { gt: since } } }),
    app.store.count('comments', { authorId: me.id, createdAt: { gt: since }, status: 'visible' }),
    app.store.count('rsvps', { userId: me.id, status: 'going', createdAt: { gt: since } }),
    app.store.find('follows', { where: { followerId: me.id, status: 'active' } }),
  ]);
  const myPosts = await app.store.find('posts', { where: { authorId: me.id, createdAt: { gt: now - 30 * DAY } } });
  const reactionsFromFriends = following.length && myPosts.length
    ? await app.store.count('reactions', {
        postId: { in: myPosts.map((p) => p.id) },
        userId: { in: following.map((f) => f.followeeId) },
        createdAt: { gt: since },
      })
    : 0;
  const today = byDay.get(days[6]);
  return {
    today: budgetStatus(today?.seconds ?? 0, me.settings.wellbeing.dailyBudgetMin),
    week,
    averageMinutes: Math.round(week.reduce((sum, d) => sum + d.minutes, 0) / 7),
    intents,
    connections: { conversations: new Set(messages.map((m) => m.conversationId)).size, comments, plans: rsvps, reactionsFromFriends },
    quietNow: inQuietHours(now, tz, me.settings.wellbeing),
    nextDigestAt: me.settings.wellbeing.notifications === 'digest' ? nextDigestAt(now, tz, me.settings.wellbeing) : null,
  };
}
