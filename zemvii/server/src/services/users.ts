// Profiles, settings, suggestions, data export and account deletion.

import type { App } from './app.ts';
import { invalidateFeeds } from './app.ts';
import type { Audience, ID, UserRow, UserSettings } from '../store/types.ts';
import { ageOn, isTeen } from '../core/age.ts';
import { FEED_PRESETS } from '../core/defaults.ts';
import { isValidHM } from '../core/wellbeing.ts';
import { badRequest, forbidden, HttpError, notFound } from './errors.ts';
import { verifyPassword } from './crypto.ts';
import { userByHandle, viewerContext } from './graph.ts';
import { bool, int, obj, oneOf, str, strList, url } from './validate.ts';
import { meView, userSummary, type MeView, type ProfileView, type UserSummary } from './views.ts';

export async function getProfile(app: App, me: UserRow | null, handle: string): Promise<ProfileView> {
  const user = await userByHandle(app, handle);
  const isMe = me?.id === user.id;
  if (me && !isMe && (await app.store.findOne('blocks', { blockerId: user.id, blockedId: me.id }))) throw notFound('No such person.');
  const iBlocked = me && !isMe ? Boolean(await app.store.findOne('blocks', { blockerId: me.id, blockedId: user.id })) : false;
  const myFollow = me && !isMe ? await app.store.findOne('follows', { followerId: me.id, followeeId: user.id }) : undefined;
  const followsYou = me && !isMe ? Boolean(await app.store.findOne('follows', { followerId: user.id, followeeId: me.id, status: 'active' })) : false;
  const showCounts = isMe || user.settings.privacy.showFollowerCounts;
  const [followers, following, posts] = await Promise.all([
    showCounts ? app.store.count('follows', { followeeId: user.id, status: 'active' }) : Promise.resolve(null),
    showCounts ? app.store.count('follows', { followerId: user.id, status: 'active' }) : Promise.resolve(null),
    app.store.count('posts', { authorId: user.id, status: 'visible' }),
  ]);
  const canSeePosts = !iBlocked && (isMe || !user.settings.privacy.privateAccount || myFollow?.status === 'active');
  let relationship: ProfileView['relationship'] = null;
  if (me && !isMe) {
    const [muted, circles, supporting] = await Promise.all([
      app.store.findOne('mutes', { muterId: me.id, mutedId: user.id }),
      app.store.find('circleMembers', { where: { ownerId: me.id, userId: user.id } }),
      app.store.findOne('supports', { creatorId: user.id, supporterId: me.id, status: 'active' }),
    ]);
    relationship = {
      following: myFollow ? myFollow.status : 'none',
      followsYou,
      friend: myFollow?.status === 'active' && followsYou,
      blocked: iBlocked,
      muted: Boolean(muted),
      circleIds: circles.map((c) => c.circleId),
      supporting: Boolean(supporting),
    };
  }
  const teen = isTeen(user.birthDate, app.now());
  return {
    ...userSummary(user),
    bio: user.bio,
    pronouns: user.pronouns,
    location: user.location,
    website: user.website,
    createdAt: user.createdAt,
    counts: { followers, following, posts },
    relationship,
    canSeePosts,
    creator: {
      tipsEnabled: !teen && user.settings.creator.tipsEnabled,
      supportersEnabled: !teen && user.settings.creator.supportersEnabled,
      supportPriceCents: user.settings.creator.supportPriceCents,
      supportPerks: user.settings.creator.supportPerks,
      supporters: isMe ? await app.store.count('supports', { creatorId: user.id, status: 'active' }) : null,
    },
    isMe,
  };
}

export async function updateProfile(app: App, me: UserRow, input: Record<string, unknown>): Promise<MeView> {
  const patch: Partial<UserRow> = {};
  if (input.name !== undefined) patch.name = str(input.name, 'Name', { required: true, max: 50 });
  if (input.bio !== undefined) patch.bio = str(input.bio, 'Bio', { max: 300 });
  if (input.pronouns !== undefined) patch.pronouns = str(input.pronouns, 'Pronouns', { max: 30 });
  if (input.location !== undefined) patch.location = str(input.location, 'Location', { max: 60 });
  if (input.website !== undefined) patch.website = url(input.website, 'Website');
  if (input.hue !== undefined) patch.hue = int(input.hue, 'Colour', { min: 0, max: 359 });
  if (input.topics !== undefined) patch.topics = strList(input.topics, 'Interests', { maxItems: 15, maxLength: 30 });
  if (input.avatarUrl !== undefined) {
    if (input.avatarUrl === null) patch.avatarUrl = null;
    else {
      const media = typeof input.avatarId === 'string' ? await app.store.get('media', input.avatarId) : undefined;
      if (!media || media.ownerId !== me.id || !media.mime.startsWith('image/')) throw badRequest('Upload the photo first.');
      patch.avatarUrl = media.url;
    }
  }
  await app.store.update('users', { id: me.id }, patch);
  if (patch.topics) invalidateFeeds(app, me.id);
  return meView({ ...me, ...patch }, app.now());
}

const AUDIENCE_DEFAULTS: Audience[] = ['public', 'followers', 'friends', 'private'];

/** Validate and merge a partial settings object. Protections for teens cannot be switched off. */
export function mergeSettings(current: UserSettings, input: unknown, teen: boolean, under16: boolean): UserSettings {
  const body = obj(input, 'settings');
  const next: UserSettings = structuredClone(current);
  if (body.feed !== undefined) {
    const f = obj(body.feed, 'feed');
    if (f.friendsVsDiscover !== undefined) next.feed.friendsVsDiscover = int(f.friendsVsDiscover, 'Friends↔Discover', { min: 0, max: 100 });
    if (f.freshVsPopular !== undefined) next.feed.freshVsPopular = int(f.freshVsPopular, 'Fresh↔Popular', { min: 0, max: 100 });
    if (f.calm !== undefined) next.feed.calm = int(f.calm, 'Calm', { min: 0, max: 100 });
    if (f.ai !== undefined) next.feed.ai = oneOf(f.ai, 'AI content', ['show', 'hide'] as const);
    if (f.boostTopics !== undefined) next.feed.boostTopics = strList(f.boostTopics, 'Boosted topics', { maxItems: 10, maxLength: 30 });
    if (f.muteTopics !== undefined) next.feed.muteTopics = strList(f.muteTopics, 'Muted topics', { maxItems: 50, maxLength: 30 });
    if (f.mutedWords !== undefined) next.feed.mutedWords = strList(f.mutedWords, 'Muted words', { maxItems: 100, maxLength: 40 });
    if (f.preset !== undefined) {
      const preset = str(f.preset, 'Preset', { max: 20 });
      next.feed.preset = preset;
      const known = FEED_PRESETS.find((p) => p.id === preset);
      if (known && f.friendsVsDiscover === undefined) Object.assign(next.feed, known.dials);
    }
  }
  if (body.wellbeing !== undefined) {
    const w = obj(body.wellbeing, 'wellbeing');
    if (w.dailyBudgetMin !== undefined) next.wellbeing.dailyBudgetMin = int(w.dailyBudgetMin, 'Daily budget', { min: 0, max: 600 });
    if (w.quietHours !== undefined) next.wellbeing.quietHours = bool(w.quietHours, 'Quiet hours');
    for (const key of ['quietStart', 'quietEnd'] as const) {
      if (w[key] !== undefined) {
        if (!isValidHM(w[key])) throw badRequest('Use a time like 22:00.', { field: key });
        next.wellbeing[key] = w[key] as string;
      }
    }
    if (w.notifications !== undefined) next.wellbeing.notifications = oneOf(w.notifications, 'Notifications', ['realtime', 'digest'] as const);
    if (w.intentPrompt !== undefined) next.wellbeing.intentPrompt = bool(w.intentPrompt, 'Intent prompt');
    if (w.clipsSetSize !== undefined) next.wellbeing.clipsSetSize = int(w.clipsSetSize, 'Clips per set', { min: 3, max: 20 });
  }
  if (body.privacy !== undefined) {
    const p = obj(body.privacy, 'privacy');
    if (p.privateAccount !== undefined) next.privacy.privateAccount = bool(p.privateAccount, 'Private account');
    if (p.defaultAudience !== undefined) next.privacy.defaultAudience = oneOf(p.defaultAudience, 'Default audience', AUDIENCE_DEFAULTS);
    if (p.whoCanMessage !== undefined) next.privacy.whoCanMessage = oneOf(p.whoCanMessage, 'Who can message', ['everyone', 'followers', 'friends'] as const);
    if (p.whoCanComment !== undefined) next.privacy.whoCanComment = oneOf(p.whoCanComment, 'Who can comment', ['everyone', 'followers', 'friends', 'nobody'] as const);
    if (p.showCountsByDefault !== undefined) next.privacy.showCountsByDefault = bool(p.showCountsByDefault, 'Show counts');
    if (p.hiddenWords !== undefined) next.privacy.hiddenWords = strList(p.hiddenWords, 'Hidden words', { maxItems: 100, maxLength: 40 });
    if (p.showFollowerCounts !== undefined) next.privacy.showFollowerCounts = bool(p.showFollowerCounts, 'Show follower counts');
  }
  if (body.creator !== undefined) {
    const c = obj(body.creator, 'creator');
    if (c.supportersEnabled !== undefined) next.creator.supportersEnabled = bool(c.supportersEnabled, 'Supporters');
    if (c.supportPriceCents !== undefined) next.creator.supportPriceCents = int(c.supportPriceCents, 'Price', { min: 100, max: 10_000 });
    if (c.supportPerks !== undefined) next.creator.supportPerks = str(c.supportPerks, 'Perks', { max: 300 });
    if (c.tipsEnabled !== undefined) next.creator.tipsEnabled = bool(c.tipsEnabled, 'Tips');
  }
  if (body.theme !== undefined) next.theme = oneOf(body.theme, 'Theme', ['system', 'light', 'dark'] as const);
  if (body.textSize !== undefined) next.textSize = oneOf(body.textSize, 'Text size', ['sm', 'md', 'lg'] as const);
  if (body.tzOffsetMin !== undefined) next.tzOffsetMin = int(body.tzOffsetMin, 'Time zone', { min: -840, max: 840 });

  if (teen) {
    next.wellbeing.quietHours = true;
    if (next.privacy.whoCanMessage === 'everyone') next.privacy.whoCanMessage = 'followers';
    next.creator.supportersEnabled = false;
    next.creator.tipsEnabled = false;
    if (next.privacy.defaultAudience === 'public') next.privacy.defaultAudience = 'followers';
  }
  if (under16) next.privacy.privateAccount = true;
  return next;
}

export async function updateSettings(app: App, me: UserRow, input: unknown): Promise<MeView> {
  const now = app.now();
  const settings = mergeSettings(me.settings, input, isTeen(me.birthDate, now), ageOn(me.birthDate, now) < 16);
  await app.store.update('users', { id: me.id }, { settings });
  invalidateFeeds(app, me.id);
  return meView({ ...me, settings }, now);
}

export async function suggestPeople(app: App, me: UserRow, limit: number): Promise<Array<{ user: UserSummary; reason: string }>> {
  const ctx = await viewerContext(app, me);
  const now = app.now();
  const meTeen = isTeen(me.birthDate, now);
  const pending = new Set((await app.store.find('follows', { where: { followerId: me.id, status: 'pending' } })).map((f) => f.followeeId));
  const exclude = new Set<ID>([me.id, ...ctx.following, ...ctx.blocked, ...pending]);
  const viaFriends = ctx.following.size
    ? await app.store.find('follows', { where: { followerId: { in: [...ctx.following] }, status: 'active' }, limit: 3000 })
    : [];
  const mutual = new Map<ID, ID[]>();
  for (const f of viaFriends) {
    if (exclude.has(f.followeeId)) continue;
    mutual.set(f.followeeId, [...(mutual.get(f.followeeId) ?? []), f.followerId]);
  }
  const candidates = await app.store.find('users', { where: { status: 'active', id: { nin: [...exclude] } }, orderBy: [['lastActiveAt', 'desc']], limit: 500 });
  const handles = new Map(
    (await app.store.find('users', { where: { id: { in: [...new Set([...mutual.values()].flat())] } } })).map((u) => [u.id, u.handle]),
  );
  const scored = candidates
    // Teens are never suggested to adults (and adults are not suggested to teens).
    .filter((u) => isTeen(u.birthDate, now) === meTeen || ctx.followers.has(u.id))
    .map((u) => {
      const via = mutual.get(u.id) ?? [];
      const shared = u.topics.filter((t) => me.topics.includes(t));
      let reason = '';
      if (ctx.followers.has(u.id)) reason = 'Follows you';
      else if (via.length) reason = `Followed by @${handles.get(via[0])}${via.length > 1 ? ` and ${via.length - 1} other${via.length > 2 ? 's' : ''} you follow` : ''}`;
      else if (shared.length) reason = `Into #${shared[0]} like you`;
      const score = (ctx.followers.has(u.id) ? 5 : 0) + via.length * 2 + shared.length;
      return { u, score, reason };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return scored.map((x) => ({ user: userSummary(x.u), reason: x.reason }));
}

export async function verifyHuman(app: App, me: UserRow): Promise<MeView> {
  if (!app.simulated) {
    throw new HttpError(501, 'provider_missing', 'Human verification needs a liveness provider, which is not configured on this server.');
  }
  await app.store.update('users', { id: me.id }, { verifiedHuman: true });
  return meView({ ...me, verifiedHuman: true }, app.now());
}

/** Everything Zemvii stores about you, in one JSON document. */
export async function exportData(app: App, me: UserRow): Promise<Record<string, unknown>> {
  const s = app.store;
  const [posts, comments, reactions, saves, following, followers, circles, circleMembers, memberships, messages, plans, rsvps, spaces, transactions, supports, usage, reports, actions, notes, sessions] =
    await Promise.all([
      s.find('posts', { where: { authorId: me.id, status: { ne: 'deleted' } } }),
      s.find('comments', { where: { authorId: me.id, status: { ne: 'deleted' } } }),
      s.find('reactions', { where: { userId: me.id } }),
      s.find('saves', { where: { userId: me.id } }),
      s.find('follows', { where: { followerId: me.id } }),
      s.find('follows', { where: { followeeId: me.id } }),
      s.find('circles', { where: { ownerId: me.id } }),
      s.find('circleMembers', { where: { ownerId: me.id } }),
      s.find('conversationMembers', { where: { userId: me.id } }),
      s.find('messages', { where: { senderId: me.id } }),
      s.find('plans', { where: { hostId: me.id } }),
      s.find('rsvps', { where: { userId: me.id } }),
      s.find('spaceMembers', { where: { userId: me.id } }),
      s.find('transactions', { where: { $or: [{ fromUserId: me.id }, { toUserId: me.id }] } }),
      s.find('supports', { where: { $or: [{ creatorId: me.id }, { supporterId: me.id }] } }),
      s.find('usage', { where: { userId: me.id } }),
      s.find('reports', { where: { reporterId: me.id } }),
      s.find('moderationActions', { where: { userId: me.id } }),
      s.find('notes', { where: { authorId: me.id } }),
      s.find('sessions', { where: { userId: me.id } }),
    ]);
  const { passwordHash: _omit, ...account } = me;
  return {
    exportedAt: new Date(app.now()).toISOString(),
    about: 'This is everything Zemvii stores about your account. Times are milliseconds since 1970-01-01 UTC.',
    account,
    posts,
    comments,
    reactions,
    saves,
    following,
    followers,
    circles: circles.map((c) => ({ ...c, members: circleMembers.filter((m) => m.circleId === c.id).map((m) => m.userId) })),
    conversations: memberships,
    messagesSent: messages,
    plansHosted: plans,
    rsvps,
    spaces,
    payments: transactions,
    supports,
    timeOnZemvii: usage,
    reportsYouFiled: reports,
    moderationOfYourAccount: actions,
    communityNotes: notes,
    devices: sessions.map(({ id: _id, ...session }) => session),
  };
}

/** Delete means delete: content is erased and the profile anonymised immediately. */
export async function deleteAccount(app: App, me: UserRow, password: unknown): Promise<void> {
  if (typeof password !== 'string' || !(await verifyPassword(password, me.passwordHash))) {
    throw forbidden('Your password is not right.', 'wrong_password');
  }
  await app.store.transaction(async (tx) => {
    await tx.update('users', { id: me.id }, {
      status: 'deleted', name: 'Deleted account', handle: `deleted_${me.id}`, email: `deleted+${me.id}@invalid`,
      bio: '', pronouns: '', location: '', website: '', avatarUrl: null, passwordHash: '!', topics: [], verifiedHuman: false,
    });
    await tx.update('posts', { authorId: me.id }, { status: 'deleted', text: '', media: [] });
    await tx.delete('postTopics', { authorId: me.id });
    await tx.update('comments', { authorId: me.id }, { status: 'deleted', text: '' });
    await tx.update('messages', { senderId: me.id }, { status: 'deleted', text: '', media: [] });
    await tx.delete('reactions', { userId: me.id });
    await tx.delete('saves', { userId: me.id });
    await tx.delete('follows', { $or: [{ followerId: me.id }, { followeeId: me.id }] });
    await tx.delete('circleMembers', { $or: [{ ownerId: me.id }, { userId: me.id }] });
    await tx.delete('circles', { ownerId: me.id });
    for (const membership of await tx.find('spaceMembers', { where: { userId: me.id } })) {
      await tx.increment('spaces', membership.spaceId, 'memberCount', -1);
    }
    await tx.delete('spaceMembers', { userId: me.id });
    await tx.delete('rsvps', { userId: me.id });
    await tx.update('plans', { hostId: me.id }, { status: 'cancelled' });
    await tx.update('supports', { $or: [{ creatorId: me.id }, { supporterId: me.id }] }, { status: 'cancelled', cancelledAt: app.now() });
    await tx.delete('sessions', { userId: me.id });
    await tx.delete('notifications', { userId: me.id });
    await tx.delete('usage', { userId: me.id });
  });
}
