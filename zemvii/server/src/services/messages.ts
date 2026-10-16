// Messages: direct and group chats, message requests, plans shared into chats.
//
// Rules: blocked people can't message each other; messages from people a user
// doesn't allow land in Requests; teens never receive messages from adults
// who aren't their friends. Threats are blocked and hurtful messages get the
// same "Pause & rethink" nudge as posts.
//
// v1 stores messages server-side. End-to-end encryption (MLS, RFC 9420) is a
// launch requirement on the roadmap (see the roadmap in docs/STRATEGY.md).

import type { App } from './app.ts';
import type { ConversationRow, ID, MessageRow, UserRow } from '../store/types.ts';
import { newId } from '../store/store.ts';
import { isTeen } from '../core/age.ts';
import { badRequest, forbidden, notFound } from './errors.ts';
import { areFriends, assertCanAct, isBlockedBetween, userByHandle, viewerContext } from './graph.ts';
import { enforceTone } from './posts.ts';
import { canSeePlan, planViews } from './community.ts';
import { str } from './validate.ts';
import { userSummary, type ConversationView, type MessageView } from './views.ts';

type Permission = 'allowed' | 'request' | 'denied';

/** May `from` start a chat with `to`? */
export async function messagePermission(app: App, from: UserRow, to: UserRow): Promise<Permission> {
  if (await isBlockedBetween(app, from.id, to.id)) return 'denied';
  const now = app.now();
  const friends = await areFriends(app, from.id, to.id);
  if (isTeen(to.birthDate, now) && !isTeen(from.birthDate, now) && !friends) return 'denied';
  const followsTo = Boolean(await app.store.findOne('follows', { followerId: from.id, followeeId: to.id, status: 'active' }));
  const toFollowsFrom = Boolean(await app.store.findOne('follows', { followerId: to.id, followeeId: from.id, status: 'active' }));
  switch (to.settings.privacy.whoCanMessage) {
    case 'everyone':
      return 'allowed';
    case 'followers':
      // People they follow can always reach them; their followers can too.
      return toFollowsFrom || followsTo ? 'allowed' : 'request';
    case 'friends':
      return friends || toFollowsFrom ? 'allowed' : 'request';
  }
}

async function membership(app: App, me: UserRow, conversationId: string) {
  const member = await app.store.get('conversationMembers', `cm_${conversationId}_${me.id}`);
  if (!member) throw notFound('No such conversation.');
  const conversation = await app.store.get('conversations', conversationId);
  if (!conversation) throw notFound('No such conversation.');
  return { member, conversation };
}

async function addMember(app: App, conversationId: ID, userId: ID, accepted: boolean): Promise<void> {
  await app.store.upsert('conversationMembers', {
    id: `cm_${conversationId}_${userId}`,
    conversationId,
    userId,
    accepted,
    muted: false,
    lastReadAt: 0,
    createdAt: app.now(),
  });
}

export async function startConversation(app: App, me: UserRow, input: { handles?: unknown; title?: unknown }): Promise<{ id: ID }> {
  assertCanAct(app, me);
  if (!Array.isArray(input.handles) || input.handles.length === 0) throw badRequest('Choose who to message.');
  if (input.handles.length > 31) throw badRequest('Group chats can have up to 32 people.');
  const others: UserRow[] = [];
  for (const handle of input.handles) {
    const user = await userByHandle(app, handle);
    if (user.id !== me.id && !others.some((o) => o.id === user.id)) others.push(user);
  }
  if (others.length === 0) throw badRequest('Choose someone other than yourself.');
  const permissions = new Map<ID, Permission>();
  for (const other of others) {
    const permission = await messagePermission(app, me, other);
    if (permission === 'denied') throw forbidden(`You can't message @${other.handle}.`, 'message_denied');
    permissions.set(other.id, permission);
  }
  const now = app.now();
  if (others.length === 1) {
    const directKey = [me.id, others[0].id].sort().join(':');
    const existing = await app.store.findOne('conversations', { directKey });
    if (existing) {
      if (!(await app.store.get('conversationMembers', `cm_${existing.id}_${me.id}`))) await addMember(app, existing.id, me.id, true);
      return { id: existing.id };
    }
    const conversation: ConversationRow = { id: newId(), kind: 'direct', title: null, directKey, createdBy: me.id, createdAt: now, lastMessageAt: now };
    await app.store.insert('conversations', conversation);
    await addMember(app, conversation.id, me.id, true);
    await addMember(app, conversation.id, others[0].id, permissions.get(others[0].id) === 'allowed');
    return { id: conversation.id };
  }
  const conversation: ConversationRow = {
    id: newId(),
    kind: 'group',
    title: str(input.title, 'Title', { max: 60 }) || null,
    directKey: null,
    createdBy: me.id,
    createdAt: now,
    lastMessageAt: now,
  };
  await app.store.insert('conversations', conversation);
  await addMember(app, conversation.id, me.id, true);
  for (const other of others) await addMember(app, conversation.id, other.id, permissions.get(other.id) === 'allowed');
  return { id: conversation.id };
}

/** A group chat with everyone in one of my circles. */
export async function chatWithCircle(app: App, me: UserRow, circleId: string): Promise<{ id: ID }> {
  const circle = await app.store.get('circles', circleId);
  if (!circle || circle.ownerId !== me.id) throw notFound('No such circle.');
  const members = await app.store.find('circleMembers', { where: { circleId } });
  const users = await app.store.find('users', { where: { id: { in: members.map((m) => m.userId) }, status: 'active' } });
  if (users.length === 0) throw badRequest('Add people to this circle first.');
  return startConversation(app, me, { handles: users.map((u) => u.handle), title: `${circle.emoji} ${circle.name}` });
}

export async function listConversations(app: App, me: UserRow): Promise<ConversationView[]> {
  const memberships = await app.store.find('conversationMembers', { where: { userId: me.id } });
  if (memberships.length === 0) return [];
  const ids = memberships.map((m) => m.conversationId);
  const [conversations, allMembers] = await Promise.all([
    app.store.find('conversations', { where: { id: { in: ids } }, orderBy: [['lastMessageAt', 'desc']] }),
    app.store.find('conversationMembers', { where: { conversationId: { in: ids } } }),
  ]);
  const users = new Map(
    (await app.store.find('users', { where: { id: { in: [...new Set(allMembers.map((m) => m.userId))] } } })).map((u) => [u.id, u]),
  );
  const ctx = await viewerContext(app, me);
  const views: ConversationView[] = [];
  for (const c of conversations) {
    const mine = memberships.find((m) => m.conversationId === c.id)!;
    const others = allMembers.filter((m) => m.conversationId === c.id && m.userId !== me.id).map((m) => users.get(m.userId)).filter((u): u is UserRow => Boolean(u));
    if (c.kind === 'direct' && others.some((o) => ctx.blocked.has(o.id))) continue;
    const [last] = await app.store.find('messages', { where: { conversationId: c.id, status: 'visible' }, orderBy: [['createdAt', 'desc']], limit: 1 });
    if (!last && c.createdBy !== me.id) continue; // empty chats someone else started stay invisible
    const unread = await app.store.count('messages', { conversationId: c.id, status: 'visible', createdAt: { gt: mine.lastReadAt }, senderId: { ne: me.id } });
    views.push({
      id: c.id,
      kind: c.kind,
      title: c.title ?? (others.map((o) => (o.status === 'deleted' ? 'Deleted account' : o.name)).join(', ') || 'Just you'),
      members: others.map(userSummary),
      lastMessage: last ? { text: last.planId && !last.text ? '📅 Shared a plan' : last.text || '📷 Photo', senderId: last.senderId, createdAt: last.createdAt } : null,
      unread,
      accepted: mine.accepted,
      muted: mine.muted,
    });
  }
  return views;
}

export async function unreadMessageCount(app: App, me: UserRow): Promise<number> {
  const memberships = await app.store.find('conversationMembers', { where: { userId: me.id, accepted: true, muted: false } });
  let total = 0;
  for (const m of memberships) {
    total += await app.store.count('messages', { conversationId: m.conversationId, status: 'visible', createdAt: { gt: m.lastReadAt }, senderId: { ne: me.id } });
  }
  return total;
}

export async function getConversation(app: App, me: UserRow, id: string): Promise<ConversationView> {
  await membership(app, me, id);
  const all = await listConversations(app, me);
  const found = all.find((c) => c.id === id);
  if (found) return found;
  const { conversation, member } = await membership(app, me, id);
  const members = await app.store.find('conversationMembers', { where: { conversationId: id, userId: { ne: me.id } } });
  const users = await app.store.find('users', { where: { id: { in: members.map((m) => m.userId) } } });
  return {
    id,
    kind: conversation.kind,
    title: conversation.title ?? users.map((u) => u.name).join(', '),
    members: users.map(userSummary),
    lastMessage: null,
    unread: 0,
    accepted: member.accepted,
    muted: member.muted,
  };
}

export async function listMessages(app: App, me: UserRow, id: string, opts: { after?: number; before?: number }): Promise<MessageView[]> {
  await membership(app, me, id);
  const rows = await app.store.find('messages', {
    where: {
      conversationId: id,
      status: 'visible',
      ...(opts.after ? { createdAt: { gt: opts.after } } : opts.before ? { createdAt: { lt: opts.before } } : {}),
    },
    orderBy: [['createdAt', opts.after ? 'asc' : 'desc']],
    limit: 100,
  });
  if (!opts.after) rows.reverse();
  const senders = new Map((await app.store.find('users', { where: { id: { in: [...new Set(rows.map((r) => r.senderId))] } } })).map((u) => [u.id, u]));
  const ctx = await viewerContext(app, me);
  const planRows = await app.store.find('plans', { where: { id: { in: rows.map((r) => r.planId).filter((x): x is string => Boolean(x)) } } });
  const plans = new Map((await planViews(app, me, ctx, planRows)).map((p) => [p.id, p]));
  return rows.flatMap((r) => {
    const sender = senders.get(r.senderId);
    if (!sender) return [];
    return [{ id: r.id, conversationId: id, sender: userSummary(sender), text: r.text, media: r.media, plan: r.planId ? (plans.get(r.planId) ?? null) : null, createdAt: r.createdAt, mine: r.senderId === me.id }];
  });
}

export async function sendMessage(
  app: App,
  me: UserRow,
  id: string,
  input: { text?: unknown; mediaId?: unknown; planId?: unknown; confirmTone?: unknown },
): Promise<MessageView> {
  assertCanAct(app, me);
  const { conversation } = await membership(app, me, id);
  const members = await app.store.find('conversationMembers', { where: { conversationId: id, userId: { ne: me.id } } });
  if (conversation.kind === 'direct') {
    for (const m of members) if (await isBlockedBetween(app, me.id, m.userId)) throw forbidden("You can't message this person.");
  }
  const text = str(input.text, 'Message', { max: 2000 });
  const media = [];
  if (typeof input.mediaId === 'string') {
    const row = await app.store.get('media', input.mediaId);
    if (!row || row.ownerId !== me.id) throw badRequest('Upload the photo first.');
    media.push({ id: row.id, type: row.mime.startsWith('video/') ? ('video' as const) : ('image' as const), url: row.url, mime: row.mime });
  }
  let planId: string | null = null;
  if (typeof input.planId === 'string') {
    const plan = await app.store.get('plans', input.planId);
    const host = plan && (await app.store.get('users', plan.hostId));
    // You can only share plans you can see yourself.
    if (!plan || !host || !canSeePlan(plan, host, await viewerContext(app, me), me, app.now())) throw badRequest('That plan is gone.');
    planId = plan.id;
  }
  if (!text && media.length === 0 && !planId) throw badRequest('Write a message.');
  if (text) enforceTone(text, input.confirmTone === true);
  const message: MessageRow = { id: newId(), conversationId: id, senderId: me.id, text, media, planId, status: 'visible', createdAt: app.now() };
  await app.store.insert('messages', message);
  await app.store.update('conversations', { id }, { lastMessageAt: message.createdAt });
  await app.store.update('conversationMembers', { id: `cm_${id}_${me.id}` }, { lastReadAt: message.createdAt, accepted: true });
  try {
    app.onMessage(app, message);
  } catch (error) {
    app.log('onMessage hook failed', error);
  }
  return (await listMessages(app, me, id, { after: message.createdAt - 1 })).find((m) => m.id === message.id)!;
}

export async function markConversationRead(app: App, me: UserRow, id: string): Promise<void> {
  await membership(app, me, id);
  await app.store.update('conversationMembers', { id: `cm_${id}_${me.id}` }, { lastReadAt: app.now() });
}

export async function answerRequest(app: App, me: UserRow, id: string, accept: boolean): Promise<void> {
  await membership(app, me, id);
  if (accept) await app.store.update('conversationMembers', { id: `cm_${id}_${me.id}` }, { accepted: true });
  else await app.store.delete('conversationMembers', { id: `cm_${id}_${me.id}` });
}

export async function setConversationMuted(app: App, me: UserRow, id: string, muted: boolean): Promise<void> {
  await membership(app, me, id);
  await app.store.update('conversationMembers', { id: `cm_${id}_${me.id}` }, { muted });
}

export async function leaveConversation(app: App, me: UserRow, id: string): Promise<void> {
  await membership(app, me, id);
  await app.store.delete('conversationMembers', { id: `cm_${id}_${me.id}` });
}
