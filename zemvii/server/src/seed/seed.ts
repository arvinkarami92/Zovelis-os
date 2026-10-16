// Builds the demo world, welcomes new visitors into it, and makes the
// fictional personas reply to messages and react to posts. Used by the
// in-browser demo and by the dev server in simulated mode. Never runs in
// production.

import type { App } from '../services/app.ts';
import type { Store } from '../store/store.ts';
import { newId } from '../store/store.ts';
import type { ConversationRow, MessageRow, PostRow, ReactionType, UserRow } from '../store/types.ts';
import { defaultSettings } from '../core/defaults.ts';
import { isTeen } from '../core/age.ts';
import { checkTone } from '../core/tone.ts';
import { extractMentions, extractTopics } from '../core/text.ts';
import { dayKey } from '../core/wellbeing.ts';
import { randomToken, sha256Hex } from '../services/crypto.ts';
import { addComment, react } from '../services/posts.ts';
import { notify } from '../services/notify.ts';
import { PERSONAS, PERSONA_COMMENTS, PERSONA_FLAVOUR, PLANS, POSTS, REPLIES, FRIEND_GROUPS, SPACES } from './world.ts';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Small deterministic PRNG (mulberry32), so the demo world is the same every time. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function startOfLocalDay(now: number, tzOffsetMin: number): number {
  const local = now + tzOffsetMin * 60_000;
  return now - (((local % DAY) + DAY) % DAY);
}

export interface SeedOptions {
  now: number;
  /** One password hash shared by all personas (dev server only; the demo never logs in as them). */
  passwordHash: string;
  tzOffsetMin?: number;
}

export async function worldIsSeeded(store: Store): Promise<boolean> {
  return Boolean(await store.findOne('users', { handle: 'maya' }));
}

export async function seedWorld(store: Store, opts: SeedOptions): Promise<void> {
  if (await worldIsSeeded(store)) return;
  const random = rng(20261016);
  const { now } = opts;
  const tz = opts.tzOffsetMin ?? 0;
  const users = new Map<string, UserRow>();

  for (const p of PERSONAS) {
    const settings = defaultSettings(false);
    settings.privacy.defaultAudience = 'public';
    settings.wellbeing.notifications = 'realtime';
    settings.tzOffsetMin = tz;
    if (p.supporters) {
      settings.creator.supportersEnabled = true;
      settings.creator.supportPriceCents = p.supporters.priceCents;
      settings.creator.supportPerks = p.supporters.perks;
    }
    const user: UserRow = {
      id: newId(), handle: p.handle, name: p.name, email: `${p.handle}@demo.zemvii.invalid`, passwordHash: opts.passwordHash,
      bio: p.bio, pronouns: p.pronouns, location: p.location, website: p.website ? `https://${p.website}/` : '', avatarUrl: null,
      hue: p.hue, birthDate: p.birthDate, verifiedHuman: p.verified, role: p.role ?? 'user', status: 'active', suspendedUntil: null,
      settings, topics: p.topics, walletCents: 0, feedSeenAt: now, bot: true, createdAt: now - (60 + random() * 300) * DAY, lastActiveAt: now,
    };
    await store.insert('users', user);
    users.set(p.handle, user);
  }
  const id = (handle: string) => users.get(handle)!.id;

  // Follows: friend groups are mutual; everyone follows Team Zemvii and a few others.
  const follows = new Set<string>();
  const addFollow = async (a: string, b: string) => {
    if (a === b || follows.has(`${a}>${b}`)) return;
    follows.add(`${a}>${b}`);
    await store.insert('follows', { id: `f_${id(a)}_${id(b)}`, followerId: id(a), followeeId: id(b), status: 'active', createdAt: now - (10 + random() * 200) * DAY });
  };
  for (const group of FRIEND_GROUPS) for (const a of group) for (const b of group) await addFollow(a, b);
  const people = PERSONAS.filter((p) => !p.brand && p.handle !== 'quickgains_44');
  for (const p of people) {
    await addFollow(p.handle, 'team_zemvii');
    for (let i = 0; i < 3; i++) await addFollow(p.handle, people[Math.floor(random() * people.length)].handle);
  }
  for (const p of ['maya', 'hana', 'mateo']) await addFollow(p, 'trailhead_co');
  for (const p of ['leo_martins', 'samcooks']) await addFollow(p, 'beanbloom');

  for (const p of PERSONAS) {
    for (const [name, emoji, hue] of [['Close friends', '💛', 45], ['Family', '🏡', 200]] as const) {
      await store.insert('circles', { id: newId(), ownerId: id(p.handle), name, emoji, hue, createdAt: now - 60 * DAY });
    }
  }

  const spaceIds = new Map<string, string>();
  for (const s of SPACES) {
    const spaceId = newId();
    spaceIds.set(s.slug, spaceId);
    await store.insert('spaces', {
      id: spaceId, slug: s.slug, name: s.name, description: s.description, emoji: s.emoji, hue: s.hue, visibility: s.visibility,
      ownerId: id(s.owner), rules: s.rules, topics: s.topics, location: s.location, memberCount: s.members.length, createdAt: now - 90 * DAY,
    });
    for (const m of s.members) {
      await store.insert('spaceMembers', { id: `sm_${spaceId}_${id(m)}`, spaceId, userId: id(m), role: m === s.owner ? 'owner' : 'member', createdAt: now - 60 * DAY });
    }
  }

  const planIds = new Map<string, string>();
  const dayStart = startOfLocalDay(now, tz);
  for (const p of PLANS) {
    const planId = newId();
    planIds.set(p.key, planId);
    const startsAt = dayStart + p.inDays * DAY + p.hour * HOUR + (p.key === 'hike' ? 30 * 60_000 : 0);
    await store.insert('plans', {
      id: planId, hostId: id(p.host), title: p.title, description: p.description, startsAt, endsAt: startsAt + p.hours * HOUR,
      location: p.location, audience: p.audience, circleId: null, spaceId: p.space ? spaceIds.get(p.space)! : null,
      capacity: p.capacity ?? null, hue: p.hue, emoji: p.emoji, goingCount: p.going.length, status: 'active', createdAt: Math.min(now, startsAt) - 5 * DAY,
    });
    for (const [list, status] of [[p.going, 'going'], [p.maybe ?? [], 'maybe']] as const) {
      for (const handle of list) {
        await store.insert('rsvps', { id: `rsvp_${planId}_${id(handle)}`, planId, userId: id(handle), status, createdAt: Math.min(now, startsAt) - 3 * DAY });
      }
    }
  }

  const reactionTypes: ReactionType[] = ['love', 'love', 'love', 'wow', 'support', 'insight', 'haha'];
  for (const spec of POSTS) {
    const author = users.get(spec.by)!;
    const createdAt = now - spec.hoursAgo * HOUR;
    const space = spec.space ? spaceIds.get(spec.space)! : null;
    const post: PostRow = {
      id: newId(), authorId: author.id, kind: spec.kind ?? 'post', text: spec.text,
      media: spec.scene ? [{ id: newId(), type: 'art', art: { scene: spec.scene, seed: spec.seed ?? Math.floor(random() * 1000) }, alt: '' }] : [],
      audience: space ? 'space' : (spec.audience ?? 'public'), circleId: null, spaceId: space, planId: spec.plan ? planIds.get(spec.plan)! : null,
      origin: spec.origin ?? 'human', topics: extractTopics(spec.text), mentions: extractMentions(spec.text), replyControl: 'everyone',
      showCounts: spec.by === 'team_zemvii', sponsored: Boolean(spec.sponsored), sponsorName: spec.sponsored ?? null,
      heat: checkTone(spec.text).heat, reactionCount: 0, commentCount: 0, saveCount: 0, tipCents: 0, status: 'visible', createdAt, editedAt: null,
    };
    // Reactions from personas, proportional to the author's reach.
    const pool = people.filter((p) => p.handle !== spec.by);
    const persona = PERSONAS.find((p) => p.handle === spec.by)!;
    const count = spec.sponsored || spec.reports ? 0 : Math.round(pool.length * Math.min(1, (persona.reach + (spec.boost ?? 0)) * (0.35 + random() * 0.5)));
    const shuffled = [...pool].sort(() => random() - 0.5).slice(0, count);
    for (const reactor of shuffled) {
      const type = spec.by === 'benw' ? 'haha' : reactionTypes[Math.floor(random() * reactionTypes.length)];
      await store.insert('reactions', { id: `r_${post.id}_${id(reactor.handle)}`, postId: post.id, userId: id(reactor.handle), type, createdAt: createdAt + random() * (now - createdAt) });
    }
    post.reactionCount = shuffled.length;
    post.saveCount = Math.floor(shuffled.length * random() * 0.3);
    let minute = 6;
    for (const [handle, text] of spec.comments ?? []) {
      await store.insert('comments', {
        id: newId(), postId: post.id, authorId: id(handle), parentId: null, text, heat: checkTone(text).heat, nudged: false,
        status: 'visible', createdAt: Math.min(now - 60_000, createdAt + minute * 60_000),
      });
      minute += 9 + Math.floor(random() * 20);
      post.commentCount++;
    }
    await store.insert('posts', post);
    if (post.audience === 'public' || post.audience === 'space') {
      for (const topic of post.topics) {
        await store.insert('postTopics', { id: `pt_${post.id}_${topic}`, postId: post.id, topic, authorId: post.authorId, isPublic: post.audience === 'public' && !post.sponsored, createdAt });
      }
    }
    if (spec.note) {
      await store.insert('notes', {
        id: newId(), postId: post.id, authorId: id(spec.note.by), text: spec.note.text, helpful: spec.note.helpful,
        notHelpful: spec.note.notHelpful, status: 'shown', createdAt: createdAt + 3 * HOUR,
      });
    }
    for (const reporter of ['maya', 'priya', 'kofi'].slice(0, spec.reports ?? 0)) {
      await store.insert('reports', {
        id: newId(), reporterId: id(reporter), targetType: 'post', targetId: post.id, targetUserId: author.id, reason: 'scam',
        details: reporter === 'maya' ? 'Classic get-rich-quick scam, asks people to DM.' : '', status: 'open',
        createdAt: createdAt + (1 + random()) * 600_000, resolvedAt: null, resolvedBy: null,
      });
    }
  }

  // Some tips and supporters so creator dashboards have numbers.
  for (const [creator, supporters] of [['maya', ['leo_martins', 'hana', 'mateo', 'priya']], ['diego', ['elena', 'zara']], ['mateo', ['maya', 'benw']]] as const) {
    const c = users.get(creator)!;
    for (const s of supporters) {
      await store.insert('supports', {
        id: `sup_${c.id}_${id(s)}`, creatorId: c.id, supporterId: id(s), priceCents: c.settings.creator.supportPriceCents, status: 'active',
        startedAt: now - 20 * DAY, renewsAt: now + 10 * DAY, cancelledAt: null,
      });
    }
  }
}

// ---- Welcoming a visitor ------------------------------------------------------

export interface WelcomeOptions {
  /** Demo only: give the visitor the moderator tools so they can see how moderation works. */
  makeModerator?: boolean;
  walletCents?: number;
}

async function personaByHandle(store: Store, handle: string): Promise<UserRow | undefined> {
  const user = await store.findOne('users', { handle });
  return user?.bot ? user : undefined;
}

/** Connect a new account to the demo world: friends, spaces, chats, a plan invite. */
export async function welcomeVisitor(app: App, visitor: UserRow, options: WelcomeOptions = {}): Promise<void> {
  const { store } = app;
  if (visitor.bot || !(await worldIsSeeded(store))) return;
  const now = app.now();
  const p = async (handle: string) => (await personaByHandle(store, handle))!;
  const friends = ['maya', 'leo_martins', 'priya', 'samcooks', 'hana', 'noor', 'aisha'];
  const following = ['diego', 'mateo', 'benw', 'kofi', 'team_zemvii', 'ravi', 'elena'];
  const teen = isTeen(visitor.birthDate, now);

  for (const [i, handle] of [...friends, ...following].entries()) {
    const persona = await p(handle);
    if (!persona) continue;
    await store.upsert('follows', { id: `f_${visitor.id}_${persona.id}`, followerId: visitor.id, followeeId: persona.id, status: 'active', createdAt: now - (i + 1) * 60_000 });
    if (friends.includes(handle) && !teen) {
      await store.upsert('follows', { id: `f_${persona.id}_${visitor.id}`, followerId: persona.id, followeeId: visitor.id, status: 'active', createdAt: now - i * 50_000 });
      await store.insert('notifications', {
        id: newId(), userId: visitor.id, actorId: persona.id, type: 'follow', postId: null, commentId: null, planId: null, spaceId: null,
        text: `${persona.name} followed you`, createdAt: now - i * 50_000, deliverAt: now - i * 50_000, readAt: null,
      });
    }
  }
  if (teen) return; // Teens get a quieter welcome: no adult strangers following or messaging them.

  const close = await store.findOne('circles', { ownerId: visitor.id, name: 'Close friends' });
  if (close) {
    for (const handle of ['maya', 'leo_martins', 'hana']) {
      const persona = await p(handle);
      await store.upsert('circleMembers', { id: `cm_${close.id}_${persona.id}`, circleId: close.id, ownerId: visitor.id, userId: persona.id, createdAt: now });
    }
  }
  for (const slug of ['lisbon-trail-club', 'sunday-sketchers', 'plant-swap-collective']) {
    const space = await store.findOne('spaces', { slug });
    if (!space) continue;
    await store.upsert('spaceMembers', { id: `sm_${space.id}_${visitor.id}`, spaceId: space.id, userId: visitor.id, role: 'member', createdAt: now });
    await store.increment('spaces', space.id, 'memberCount', 1);
  }

  const chat = async (members: UserRow[], title: string | null, lines: Array<[UserRow, string, string | null]>) => {
    const conversation: ConversationRow = {
      id: newId(), kind: members.length > 1 ? 'group' : 'direct', title,
      directKey: members.length > 1 ? null : [visitor.id, members[0].id].sort().join(':'), createdBy: members[0].id, createdAt: now - 2 * HOUR, lastMessageAt: now,
    };
    await store.insert('conversations', conversation);
    for (const user of [visitor, ...members]) {
      await store.insert('conversationMembers', { id: `cm_${conversation.id}_${user.id}`, conversationId: conversation.id, userId: user.id, accepted: true, muted: false, lastReadAt: user.id === visitor.id ? 0 : now, createdAt: now - 2 * HOUR });
    }
    let t = now - lines.length * 4 * 60_000;
    for (const [sender, text, planId] of lines) {
      t += 4 * 60_000;
      await store.insert('messages', { id: newId(), conversationId: conversation.id, senderId: sender.id, text, media: [], planId, status: 'visible', createdAt: t });
    }
    await store.update('conversations', { id: conversation.id }, { lastMessageAt: t });
  };
  const maya = await p('maya');
  const leo = await p('leo_martins');
  const hana = await p('hana');
  const sam = await p('samcooks');
  const noor = await p('noor');
  const priya = await p('priya');
  const first = visitor.name.split(' ')[0];
  const hike = await store.findOne('plans', { title: 'Sintra ridge sunrise walk' });
  await chat([maya], null, [[maya, `Hey ${first}! Welcome to Zemvii 👋 We're doing a sunrise walk on Sunday if you fancy it. No pressure, the fog is very photogenic.`, null]]);
  await chat([maya, leo, hana], '🥾 Trail crew', [
    [leo, "Who's bringing snacks on Sunday?", null],
    [hana, 'Oranges from me 🍊', null],
    [maya, 'Plan is here, RSVP so I know numbers:', hike?.id ?? null],
  ]);
  await chat([sam], null, [[sam, 'Hi! Saw you joined the Plant Swap space. The lemon orzo recipe is in my post if you want a welcome dinner 🍋', null]]);

  const swapSpace = await store.findOne('spaces', { slug: 'plant-swap-collective' });
  const welcomePost: PostRow = {
    id: newId(), authorId: noor.id, kind: 'post', text: `Welcome to the collective, @${visitor.handle}! Saturday's swap is a gentle first one 🌱 #gardening`,
    media: [], audience: 'space', circleId: null, spaceId: swapSpace?.id ?? null, planId: null, origin: 'human', topics: ['gardening'],
    mentions: [visitor.handle], replyControl: 'everyone', showCounts: false, sponsored: false, sponsorName: null, heat: 0,
    reactionCount: 0, commentCount: 0, saveCount: 0, tipCents: 0, status: 'visible', createdAt: now - 20 * 60_000, editedAt: null,
  };
  await store.insert('posts', welcomePost);
  const sketch = await store.findOne('plans', { title: 'Sketch crawl: Alfama' });
  const delivered = (fields: { actorId: string; type: 'mention' | 'plan_invite'; text: string; postId?: string; planId?: string }, minutesAgo: number) =>
    store.insert('notifications', {
      id: newId(), userId: visitor.id, actorId: fields.actorId, type: fields.type, postId: fields.postId ?? null, commentId: null,
      planId: fields.planId ?? null, spaceId: null, text: fields.text, createdAt: now - minutesAgo * 60_000, deliverAt: now - minutesAgo * 60_000, readAt: null,
    });
  await delivered({ actorId: noor.id, type: 'mention', text: `${noor.name} mentioned you in Plant Swap Collective`, postId: welcomePost.id }, 20);
  if (sketch) await delivered({ actorId: priya.id, type: 'plan_invite', text: `${priya.name} invited you: ${sketch.title}`, planId: sketch.id }, 35);

  // Leo "lost his phone" and asked his recovery friends to vouch: shows Recovery friends from the friend's side.
  await store.update('users', { id: leo.id }, { settings: { ...leo.settings, recoveryFriendIds: [visitor.id, maya.id, priya.id] } });
  const recoveryId = newId();
  await store.insert('recoveries', { id: recoveryId, userId: leo.id, secretHash: await sha256Hex(randomToken()), approvals: [maya.id], status: 'pending', createdAt: now - 40 * 60_000, expiresAt: now + 20 * HOUR });
  await notify(app, {
    userId: visitor.id, actorId: leo.id, type: 'recovery_request',
    text: `${leo.name} lost his phone and asked you to vouch for him. Check with him directly before you approve. (Demo)`,
  });

  // A week of past usage so the wellbeing page has something to reflect on.
  const minutes = [34, 52, 41, 28, 60, 45];
  for (const [i, m] of minutes.entries()) {
    const day = dayKey(now - (6 - i) * DAY, visitor.settings.tzOffsetMin);
    await store.upsert('usage', { id: `u_${visitor.id}_${day}`, userId: visitor.id, day, seconds: m * 60, sessions: 2 + (i % 3), intents: { friends: 2, discover: i % 2, messages: 1 }, updatedAt: now - (6 - i) * DAY });
  }
  await store.update('users', { id: visitor.id }, {
    feedSeenAt: now - 7 * HOUR,
    walletCents: options.walletCents ?? 2500,
    ...(options.makeModerator ? { role: 'admin' as const } : {}),
  });
}

// ---- Persona behaviour ----------------------------------------------------------

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

export function replyFor(text: string, persona: string, hasPlan: boolean): string {
  const t = text.toLowerCase();
  if (hasPlan || /\b(plan|sunday|saturday|join|come|going|rsvp|meet)\b/.test(t)) return pick(REPLIES.plan);
  if (/\b(hi|hey|hello|olá|ola|hiya)\b/.test(t)) return pick(REPLIES.hello);
  if (/\b(thanks|thank you|cheers|obrigad)/.test(t)) return pick(REPLIES.thanks);
  if (t.includes('?')) return pick(REPLIES.question);
  const flavour = PERSONA_FLAVOUR[persona];
  return flavour && Math.random() < 0.4 ? pick(flavour) : pick(REPLIES.generic);
}

const later = (ms: number, fn: () => Promise<void>, app: App) =>
  setTimeout(() => {
    fn().catch((error) => app.log('persona action failed', error));
  }, ms);

/** Personas answer messages after a short, human-ish pause. */
export function personaReplies(app: App, message: MessageRow): void {
  later(1500 + Math.random() * 2000, async () => {
    const sender = await app.store.get('users', message.senderId);
    if (!sender || sender.bot) return;
    const members = await app.store.find('conversationMembers', { where: { conversationId: message.conversationId, userId: { ne: sender.id } } });
    const bots = (await app.store.find('users', { where: { id: { in: members.map((m) => m.userId) }, bot: true, status: 'active' } }))
      .filter((u) => u.handle !== 'quickgains_44');
    if (bots.length === 0) return;
    const persona = pick(bots);
    const createdAt = app.now();
    await app.store.insert('messages', {
      id: newId(), conversationId: message.conversationId, senderId: persona.id, text: replyFor(message.text, persona.handle, Boolean(message.planId)),
      media: [], planId: null, status: 'visible', createdAt,
    });
    await app.store.update('conversations', { id: message.conversationId }, { lastMessageAt: createdAt });
    await app.store.update('conversationMembers', { id: `cm_${message.conversationId}_${persona.id}` }, { lastReadAt: createdAt });
  }, app);
}

/** A few friends react to a visitor's new post, and one leaves a comment. */
export function personaReactions(app: App, post: PostRow): void {
  later(2000, async () => {
    const author = await app.store.get('users', post.authorId);
    if (!author || author.bot) return;
    const followers = await app.store.find('follows', { where: { followeeId: author.id, status: 'active' } });
    const bots = (await app.store.find('users', { where: { id: { in: followers.map((f) => f.followerId) }, bot: true } }))
      .filter((u) => u.handle !== 'quickgains_44')
      .sort(() => Math.random() - 0.5)
      .slice(0, 4);
    const types: ReactionType[] = ['love', 'love', 'wow', 'support', 'haha'];
    for (const [i, bot] of bots.entries()) {
      await new Promise((resolve) => setTimeout(resolve, 900 + i * 1400));
      try {
        await react(app, bot, post.id, pick(types));
        if (i === 0) await addComment(app, bot, post.id, { text: pick(PERSONA_COMMENTS) });
      } catch {
        // The persona can't see this post (e.g. a circle they are not in). That's the point of circles.
      }
    }
  }, app);
}
