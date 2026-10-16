// Notifications. Non-urgent ones respect the recipient's quiet hours and
// digest setting; nothing is designed to pull people back compulsively.

import type { App } from './app.ts';
import type { ID, NotificationRow, NotificationType, UserRow } from '../store/types.ts';
import { newId } from '../store/store.ts';
import { deliveryTime, nextDigestAt } from '../core/wellbeing.ts';
import { userSummary, type NotificationView } from './views.ts';

/** Types that are delivered immediately even in digest mode. */
const URGENT: NotificationType[] = ['moderation', 'appeal', 'recovery_request', 'recovery_approved', 'follow_accepted', 'plan_invite'];

export interface NotifyInput {
  userId: ID;
  actorId?: ID | null;
  type: NotificationType;
  text: string;
  postId?: ID | null;
  commentId?: ID | null;
  planId?: ID | null;
  spaceId?: ID | null;
  urgent?: boolean;
}

export async function notify(app: App, input: NotifyInput): Promise<void> {
  if (input.actorId && input.actorId === input.userId) return;
  const recipient = await app.store.get('users', input.userId);
  if (!recipient || recipient.status === 'deleted') return;
  if (input.actorId) {
    const blocked = await app.store.findOne('blocks', {
      $or: [
        { blockerId: input.userId, blockedId: input.actorId },
        { blockerId: input.actorId, blockedId: input.userId },
      ],
    });
    if (blocked) return;
    const muted = await app.store.findOne('mutes', { muterId: input.userId, mutedId: input.actorId });
    if (muted) return;
  }
  // One reaction notification per person and post is enough.
  if (input.type === 'reaction' && input.actorId && input.postId) {
    const existing = await app.store.findOne('notifications', {
      userId: input.userId, actorId: input.actorId, postId: input.postId, type: 'reaction',
    });
    if (existing) return;
  }
  const now = app.now();
  const urgent = input.urgent ?? URGENT.includes(input.type);
  const row: NotificationRow = {
    id: newId(),
    userId: input.userId,
    actorId: input.actorId ?? null,
    type: input.type,
    postId: input.postId ?? null,
    commentId: input.commentId ?? null,
    planId: input.planId ?? null,
    spaceId: input.spaceId ?? null,
    text: input.text,
    createdAt: now,
    deliverAt: deliveryTime(now, recipient.settings.tzOffsetMin, recipient.settings.wellbeing, urgent),
    readAt: null,
  };
  await app.store.insert('notifications', row);
}

export interface NotificationList {
  items: NotificationView[];
  unread: number;
  /** Notifications waiting for the next digest. */
  waiting: number;
  nextDigestAt: number | null;
}

export async function listNotifications(app: App, me: UserRow): Promise<NotificationList> {
  const now = app.now();
  const rows = await app.store.find('notifications', {
    where: { userId: me.id, deliverAt: { lte: now } },
    orderBy: [['createdAt', 'desc']],
    limit: 60,
  });
  const waiting = await app.store.count('notifications', { userId: me.id, deliverAt: { gt: now } });
  const actorIds = [...new Set(rows.map((r) => r.actorId).filter((id): id is string => Boolean(id)))];
  const actors = new Map((await app.store.find('users', { where: { id: { in: actorIds } } })).map((u) => [u.id, u]));
  const spaceIds = [...new Set(rows.map((r) => r.spaceId).filter((id): id is string => Boolean(id)))];
  const spaces = new Map((await app.store.find('spaces', { where: { id: { in: spaceIds } } })).map((s) => [s.id, s]));
  const items = rows.map((r) => {
    const actor = r.actorId ? actors.get(r.actorId) : undefined;
    return {
      id: r.id,
      type: r.type,
      text: r.text,
      actor: actor && actor.status !== 'deleted' ? userSummary(actor) : null,
      postId: r.postId,
      planId: r.planId,
      spaceSlug: r.spaceId ? (spaces.get(r.spaceId)?.slug ?? null) : null,
      createdAt: r.createdAt,
      read: r.readAt !== null,
    };
  });
  return {
    items,
    unread: items.filter((i) => !i.read).length,
    waiting,
    nextDigestAt:
      me.settings.wellbeing.notifications === 'digest'
        ? nextDigestAt(now, me.settings.tzOffsetMin, me.settings.wellbeing)
        : null,
  };
}

export async function unreadNotificationCount(app: App, me: UserRow): Promise<number> {
  return app.store.count('notifications', { userId: me.id, deliverAt: { lte: app.now() }, readAt: null });
}

/** "Show them now": deliver everything waiting for the digest. */
export async function deliverNow(app: App, me: UserRow): Promise<void> {
  await app.store.update('notifications', { userId: me.id, deliverAt: { gt: app.now() } }, { deliverAt: app.now() });
}

export async function markNotificationsRead(app: App, me: UserRow, ids: ID[] | 'all'): Promise<void> {
  const where = ids === 'all' ? { userId: me.id, readAt: null } : { userId: me.id, id: { in: ids } };
  await app.store.update('notifications', where, { readAt: app.now() });
}
