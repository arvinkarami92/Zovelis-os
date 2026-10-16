// The social graph: follows (and requests), blocks, mutes and circles, plus
// the per-request ViewerContext every read path uses for visibility.

import type { App } from './app.ts';
import type { CircleRow, ID, UserRow } from '../store/types.ts';
import { newId } from '../store/store.ts';
import { emptyViewer, type ViewerContext } from '../core/visibility.ts';
import { isTeen } from '../core/age.ts';
import { badRequest, forbidden, notFound } from './errors.ts';
import { notify } from './notify.ts';
import { str } from './validate.ts';
import { userSummary, type UserSummary } from './views.ts';

export async function viewerContext(app: App, me: UserRow | null): Promise<ViewerContext> {
  const ctx = emptyViewer();
  const publicSpaces = await app.store.find('spaces', { where: { visibility: 'public' } });
  for (const s of publicSpaces) ctx.publicSpaces.add(s.id);
  if (!me) return ctx;
  ctx.viewerId = me.id;
  ctx.isAdmin = me.role === 'admin';
  const [following, followers, circles, supports, spaces, blocks] = await Promise.all([
    app.store.find('follows', { where: { followerId: me.id, status: 'active' } }),
    app.store.find('follows', { where: { followeeId: me.id, status: 'active' } }),
    app.store.find('circleMembers', { where: { userId: me.id } }),
    app.store.find('supports', { where: { supporterId: me.id, status: 'active' } }),
    app.store.find('spaceMembers', { where: { userId: me.id } }),
    app.store.find('blocks', { where: { $or: [{ blockerId: me.id }, { blockedId: me.id }] } }),
  ]);
  for (const f of following) ctx.following.add(f.followeeId);
  for (const f of followers) ctx.followers.add(f.followerId);
  for (const c of circles) ctx.inCircles.add(c.circleId);
  for (const s of supports) ctx.supporting.add(s.creatorId);
  for (const s of spaces) ctx.spaces.add(s.spaceId);
  for (const b of blocks) ctx.blocked.add(b.blockerId === me.id ? b.blockedId : b.blockerId);
  return ctx;
}

export async function userByHandle(app: App, handle: unknown): Promise<UserRow> {
  if (typeof handle !== 'string') throw notFound('No such person.');
  const user = await app.store.findOne('users', { handle: handle.toLowerCase().replace(/^@/, '') });
  if (!user || user.status === 'deleted') throw notFound('No such person.');
  return user;
}

/** Writes need an account in good standing. */
export function assertCanAct(app: App, me: UserRow): void {
  if (me.status === 'suspended' && (me.suspendedUntil === null || me.suspendedUntil > app.now())) {
    throw forbidden('Your account is suspended. See Account Status for details and to appeal.', 'suspended');
  }
}

export async function isBlockedBetween(app: App, a: ID, b: ID): Promise<boolean> {
  return Boolean(
    await app.store.findOne('blocks', { $or: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] }),
  );
}

export async function areFriends(app: App, a: ID, b: ID): Promise<boolean> {
  const [ab, ba] = await Promise.all([
    app.store.findOne('follows', { followerId: a, followeeId: b, status: 'active' }),
    app.store.findOne('follows', { followerId: b, followeeId: a, status: 'active' }),
  ]);
  return Boolean(ab && ba);
}

const followId = (follower: ID, followee: ID) => `f_${follower}_${followee}`;

export async function follow(app: App, me: UserRow, handle: string): Promise<{ status: 'active' | 'pending' }> {
  assertCanAct(app, me);
  const target = await userByHandle(app, handle);
  if (target.id === me.id) throw badRequest("You can't follow yourself.");
  if (await isBlockedBetween(app, me.id, target.id)) throw forbidden("You can't follow this account.");
  const existing = await app.store.get('follows', followId(me.id, target.id));
  if (existing) return { status: existing.status };
  // Private accounts approve followers. Teens are private by default, and an
  // adult who is not followed back always needs approval to follow a teen.
  const teenTarget = isTeen(target.birthDate, app.now());
  const followedBack = Boolean(await app.store.findOne('follows', { followerId: target.id, followeeId: me.id, status: 'active' }));
  const needsApproval = target.settings.privacy.privateAccount || (teenTarget && !isTeen(me.birthDate, app.now()) && !followedBack);
  const status = needsApproval ? 'pending' : 'active';
  await app.store.insert('follows', { id: followId(me.id, target.id), followerId: me.id, followeeId: target.id, status, createdAt: app.now() });
  await notify(app, {
    userId: target.id,
    actorId: me.id,
    type: status === 'pending' ? 'follow_request' : 'follow',
    text: status === 'pending' ? `${me.name} asked to follow you` : `${me.name} followed you`,
    urgent: status === 'pending',
  });
  return { status };
}

export async function unfollow(app: App, me: UserRow, handle: string): Promise<void> {
  const target = await userByHandle(app, handle);
  await app.store.delete('follows', { id: followId(me.id, target.id) });
}

export async function removeFollower(app: App, me: UserRow, handle: string): Promise<void> {
  const target = await userByHandle(app, handle);
  await app.store.delete('follows', { id: followId(target.id, me.id) });
}

export async function followRequests(app: App, me: UserRow): Promise<UserSummary[]> {
  const pending = await app.store.find('follows', { where: { followeeId: me.id, status: 'pending' }, orderBy: [['createdAt', 'desc']] });
  const users = await app.store.find('users', { where: { id: { in: pending.map((f) => f.followerId) }, status: 'active' } });
  return users.map(userSummary);
}

export async function answerFollowRequest(app: App, me: UserRow, handle: string, accept: boolean): Promise<void> {
  const requester = await userByHandle(app, handle);
  const id = followId(requester.id, me.id);
  const request = await app.store.get('follows', id);
  if (!request || request.status !== 'pending') throw notFound('No such follow request.');
  if (!accept) {
    await app.store.delete('follows', { id });
    return;
  }
  await app.store.update('follows', { id }, { status: 'active' });
  await notify(app, { userId: requester.id, actorId: me.id, type: 'follow_accepted', text: `${me.name} accepted your follow request` });
}

export async function listFollows(
  app: App,
  viewer: UserRow | null,
  handle: string,
  direction: 'followers' | 'following',
): Promise<UserSummary[]> {
  const user = await userByHandle(app, handle);
  const isMe = viewer?.id === user.id;
  if (!isMe && user.settings.privacy.privateAccount) {
    const approved = viewer && (await app.store.findOne('follows', { followerId: viewer.id, followeeId: user.id, status: 'active' }));
    if (!approved) throw forbidden('This account is private.');
  }
  if (!isMe && !user.settings.privacy.showFollowerCounts) throw forbidden('This person keeps their connections private.');
  const rows = await app.store.find('follows', {
    where: direction === 'followers' ? { followeeId: user.id, status: 'active' } : { followerId: user.id, status: 'active' },
    orderBy: [['createdAt', 'desc']],
    limit: 500,
  });
  const ids = rows.map((r) => (direction === 'followers' ? r.followerId : r.followeeId));
  const users = new Map((await app.store.find('users', { where: { id: { in: ids }, status: 'active' } })).map((u) => [u.id, u]));
  return ids.map((id) => users.get(id)).filter((u): u is UserRow => Boolean(u)).map(userSummary);
}

export async function block(app: App, me: UserRow, handle: string): Promise<void> {
  const target = await userByHandle(app, handle);
  if (target.id === me.id) throw badRequest("You can't block yourself.");
  await app.store.transaction(async (tx) => {
    await tx.upsert('blocks', { id: `b_${me.id}_${target.id}`, blockerId: me.id, blockedId: target.id, createdAt: app.now() });
    await tx.delete('follows', { id: { in: [followId(me.id, target.id), followId(target.id, me.id)] } });
    await tx.delete('circleMembers', { ownerId: me.id, userId: target.id });
    await tx.delete('circleMembers', { ownerId: target.id, userId: me.id });
  });
}

export async function unblock(app: App, me: UserRow, handle: string): Promise<void> {
  const target = await userByHandle(app, handle);
  await app.store.delete('blocks', { id: `b_${me.id}_${target.id}` });
}

export async function mute(app: App, me: UserRow, handle: string, muted: boolean): Promise<void> {
  const target = await userByHandle(app, handle);
  const id = `m_${me.id}_${target.id}`;
  if (muted) await app.store.upsert('mutes', { id, muterId: me.id, mutedId: target.id, createdAt: app.now() });
  else await app.store.delete('mutes', { id });
}

export async function mutedIds(app: App, me: UserRow): Promise<Set<ID>> {
  return new Set((await app.store.find('mutes', { where: { muterId: me.id } })).map((m) => m.mutedId));
}

// ---- Circles -------------------------------------------------------------

export interface CircleView {
  id: ID;
  name: string;
  emoji: string;
  hue: number;
  members: UserSummary[];
}

export async function listCircles(app: App, me: UserRow): Promise<CircleView[]> {
  const circles = await app.store.find('circles', { where: { ownerId: me.id }, orderBy: [['createdAt', 'asc']] });
  const members = await app.store.find('circleMembers', { where: { ownerId: me.id } });
  const users = new Map(
    (await app.store.find('users', { where: { id: { in: [...new Set(members.map((m) => m.userId))] }, status: 'active' } })).map((u) => [u.id, u]),
  );
  return circles.map((c) => ({
    id: c.id,
    name: c.name,
    emoji: c.emoji,
    hue: c.hue,
    members: members
      .filter((m) => m.circleId === c.id)
      .map((m) => users.get(m.userId))
      .filter((u): u is UserRow => Boolean(u))
      .map(userSummary),
  }));
}

export async function createCircle(app: App, me: UserRow, input: { name?: unknown; emoji?: unknown; hue?: unknown }): Promise<CircleRow> {
  const count = await app.store.count('circles', { ownerId: me.id });
  if (count >= 20) throw badRequest('You can have up to 20 circles.');
  const circle: CircleRow = {
    id: newId(),
    ownerId: me.id,
    name: str(input.name, 'Name', { required: true, max: 40 }),
    emoji: str(input.emoji, 'Emoji', { max: 8 }) || '⭕',
    hue: typeof input.hue === 'number' ? Math.round(input.hue) % 360 : 160,
    createdAt: app.now(),
  };
  return app.store.insert('circles', circle);
}

async function ownCircle(app: App, me: UserRow, id: string): Promise<CircleRow> {
  const circle = await app.store.get('circles', id);
  if (!circle || circle.ownerId !== me.id) throw notFound('No such circle.');
  return circle;
}

export async function updateCircle(app: App, me: UserRow, id: string, input: { name?: unknown; emoji?: unknown }): Promise<void> {
  await ownCircle(app, me, id);
  const patch: Partial<CircleRow> = {};
  if (input.name !== undefined) patch.name = str(input.name, 'Name', { required: true, max: 40 });
  if (input.emoji !== undefined) patch.emoji = str(input.emoji, 'Emoji', { max: 8 }) || '⭕';
  await app.store.update('circles', { id }, patch);
}

export async function deleteCircle(app: App, me: UserRow, id: string): Promise<void> {
  await ownCircle(app, me, id);
  await app.store.transaction(async (tx) => {
    await tx.delete('circleMembers', { circleId: id });
    await tx.delete('circles', { id });
    // Posts shared with a deleted circle become visible only to their author.
    await tx.update('posts', { circleId: id }, { audience: 'private' });
  });
}

export async function setCircleMembers(app: App, me: UserRow, id: string, add: unknown, remove: unknown): Promise<void> {
  await ownCircle(app, me, id);
  const toAdd = Array.isArray(add) ? add.filter((x): x is string => typeof x === 'string').slice(0, 200) : [];
  const toRemove = Array.isArray(remove) ? remove.filter((x): x is string => typeof x === 'string') : [];
  for (const userId of toAdd) {
    const user = await app.store.get('users', userId);
    if (!user || user.status === 'deleted' || user.id === me.id) continue;
    if (await isBlockedBetween(app, me.id, userId)) continue;
    await app.store.upsert('circleMembers', { id: `cm_${id}_${userId}`, circleId: id, ownerId: me.id, userId, createdAt: app.now() });
  }
  if (toRemove.length) await app.store.delete('circleMembers', { circleId: id, userId: { in: toRemove } });
}
