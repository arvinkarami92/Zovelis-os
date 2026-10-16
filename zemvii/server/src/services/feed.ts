// Feeds and discovery.
//
//   Friends  everyone you follow, newest first, complete, and it ends.
//   Mix      ranked by your Feed Dials, at most 60 posts, then it ends.
//   Clips    short videos in sets (8 by default) with a pause between sets.

import type { App } from './app.ts';
import { cacheGet, cacheSet } from './app.ts';
import type { ID, PostRow, UserRow } from '../store/types.ts';
import { TOPICS } from '../core/defaults.ts';
import { isTeen } from '../core/age.ts';
import { canViewPost, type ViewerContext } from '../core/visibility.ts';
import { appreciationOf, rankFeed, sponsoredReason, type Reason } from '../core/feed.ts';
import { mutedIds, viewerContext } from './graph.ts';
import { candidateFor, hydratePosts, rankingContext } from './posts.ts';
import { listPlans, listSpaces } from './community.ts';
import { suggestPeople } from './users.ts';
import { userSummary, type FeedPage, type PlanView, type PostView, type SpaceView, type UserSummary } from './views.ts';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
export const MIX_LIMIT = 60;
export const PAGE_SIZE = 20;
const SPONSOR_EVERY = 12;

async function authorsOf(app: App, posts: PostRow[]): Promise<Map<ID, UserRow>> {
  const ids = [...new Set(posts.map((p) => p.authorId))];
  return new Map((await app.store.find('users', { where: { id: { in: ids } } })).map((u) => [u.id, u]));
}

function visibleTo(posts: PostRow[], authors: Map<ID, UserRow>, ctx: ViewerContext, muted: Set<ID>): PostRow[] {
  return posts.filter((p) => {
    const author = authors.get(p.authorId);
    return author && !muted.has(p.authorId) && canViewPost(p, author, ctx);
  });
}

// ---- Friends ---------------------------------------------------------------

export async function friendsFeed(app: App, me: UserRow, opts: { before?: number }): Promise<FeedPage> {
  const ctx = await viewerContext(app, me);
  const muted = await mutedIds(app, me);
  const since = app.now() - 14 * DAY;
  const rows = await app.store.find('posts', {
    where: {
      authorId: { in: [me.id, ...ctx.following] },
      status: 'visible',
      createdAt: opts.before ? { gt: since, lt: opts.before } : { gt: since },
    },
    orderBy: [['createdAt', 'desc']],
    limit: PAGE_SIZE * 2,
  });
  const authors = await authorsOf(app, rows);
  const visible = visibleTo(rows, authors, ctx, muted).slice(0, PAGE_SIZE);
  const end = rows.length < PAGE_SIZE * 2 && visible.length <= PAGE_SIZE;
  const page: FeedPage = {
    items: await hydratePosts(app, me, ctx, visible),
    nextCursor: end || visible.length === 0 ? null : String(visible[visible.length - 1].createdAt),
    end,
  };
  if (!opts.before) {
    page.seenAt = me.feedSeenAt;
    page.newCount = visible.filter((p) => p.createdAt > me.feedSeenAt && p.authorId !== me.id).length;
  }
  return page;
}

/** Remember the newest Friends post the user has seen. */
export async function markFeedSeen(app: App, me: UserRow, until: unknown): Promise<void> {
  const value = Number(until);
  if (!Number.isFinite(value)) return;
  const clamped = Math.min(value, app.now());
  if (clamped > me.feedSeenAt) await app.store.update('users', { id: me.id }, { feedSeenAt: clamped });
}

// ---- Mix -------------------------------------------------------------------

interface RankedCache {
  ids: ID[];
  why: Record<ID, Reason[]>;
}

async function mixCandidates(app: App, me: UserRow, ctx: ViewerContext, kind: 'post' | 'clip', days: number) {
  const since = app.now() - days * DAY;
  const known = [me.id, ...ctx.following];
  const [followed, inSpaces, discovered] = await Promise.all([
    app.store.find('posts', {
      where: { authorId: { in: known }, kind, status: 'visible', sponsored: false, createdAt: { gt: since } },
      orderBy: [['createdAt', 'desc']],
      limit: 300,
    }),
    ctx.spaces.size
      ? app.store.find('posts', {
          where: { spaceId: { in: [...ctx.spaces] }, kind, status: 'visible', createdAt: { gt: since } },
          orderBy: [['createdAt', 'desc']],
          limit: 150,
        })
      : [],
    me.settings.feed.friendsVsDiscover > 0 || kind === 'clip'
      ? app.store.find('posts', {
          where: { audience: 'public', kind, status: 'visible', sponsored: false, authorId: { nin: known }, createdAt: { gt: since } },
          orderBy: [['createdAt', 'desc']],
          limit: 300,
        })
      : [],
  ]);
  const byId = new Map<ID, PostRow>();
  for (const p of [...followed, ...inSpaces, ...discovered]) byId.set(p.id, p);
  const posts = [...byId.values()];
  const authors = await authorsOf(app, posts);
  const muted = await mutedIds(app, me);
  const meTeen = isTeen(me.birthDate, app.now());
  const visible = visibleTo(posts, authors, ctx, muted).filter((p) => {
    if (ctx.following.has(p.authorId) || p.authorId === me.id) return true;
    const author = authors.get(p.authorId)!;
    // Teens are never recommended to adults who don't follow them.
    return meTeen || !isTeen(author.birthDate, app.now());
  });
  return { posts: visible, authors };
}

function topicsAround(posts: PostRow[], index: number): string[] {
  const counts = new Map<string, number>();
  for (const p of posts.slice(Math.max(0, index - 3), index + 3)) for (const t of p.topics) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
}

async function computeMix(app: App, me: UserRow, ctx: ViewerContext): Promise<RankedCache> {
  const { posts, authors } = await mixCandidates(app, me, ctx, 'post', 7);
  const rc = await rankingContext(app, me, ctx);
  const ranked = rankFeed({
    candidates: posts.map((p) => candidateFor(me, ctx, rc, p, authors.get(p.authorId)!)),
    dials: me.settings.feed,
    interests: rc.interests,
    now: app.now(),
  }).slice(0, MIX_LIMIT);
  const ids = ranked.map((r) => r.postId);
  const why: Record<ID, Reason[]> = {};
  for (const r of ranked) why[r.postId] = r.reasons;

  // Contextual sponsors: never for teens or Zemvii+ members; matched to the
  // topics of nearby posts, never to the viewer's profile; at most 1 in 12.
  if (!isTeen(me.birthDate, app.now()) && !me.settings.plus) {
    const sponsors = await app.store.find('posts', { where: { sponsored: true, status: 'visible' }, limit: 50 });
    const byId = new Map(posts.map((p) => [p.id, p]));
    const ordered = ids.map((id) => byId.get(id)!);
    const used = new Set<ID>();
    for (let slot = SPONSOR_EVERY - 1; slot < ids.length; slot += SPONSOR_EVERY) {
      const around = topicsAround(ordered, slot);
      const match = sponsors.find((s) => !used.has(s.id) && s.topics.some((t) => around.includes(t) && !me.settings.feed.muteTopics.includes(t)));
      if (!match) continue;
      used.add(match.id);
      const topic = match.topics.find((t) => around.includes(t)) ?? null;
      ids.splice(slot, 0, match.id);
      why[match.id] = [sponsoredReason(topic)];
    }
  }
  return { ids, why };
}

export async function mixFeed(app: App, me: UserRow, opts: { page?: number }): Promise<FeedPage & { total: number }> {
  const page = Math.max(0, Math.min(10, opts.page ?? 0));
  const ctx = await viewerContext(app, me);
  const key = `mix:${me.id}`;
  let ranking = page > 0 ? cacheGet<RankedCache>(app, key, 30 * 60_000) : undefined;
  if (!ranking) {
    ranking = await computeMix(app, me, ctx);
    cacheSet(app, key, ranking);
  }
  const slice = ranking.ids.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const rows = await app.store.find('posts', { where: { id: { in: slice } } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = slice.map((id) => byId.get(id)).filter((p): p is PostRow => Boolean(p) && p!.status === 'visible');
  const why = new Map(Object.entries(ranking.why));
  const end = (page + 1) * PAGE_SIZE >= ranking.ids.length;
  return {
    items: await hydratePosts(app, me, ctx, ordered, why),
    nextCursor: end ? null : String(page + 1),
    end,
    total: ranking.ids.length,
  };
}

// ---- Clips -----------------------------------------------------------------

export async function clipsSet(app: App, me: UserRow, opts: { set?: number }): Promise<{ items: PostView[]; set: number; setSize: number; sets: number; end: boolean }> {
  const set = Math.max(0, Math.min(50, opts.set ?? 0));
  const setSize = Math.max(3, Math.min(20, me.settings.wellbeing.clipsSetSize));
  const ctx = await viewerContext(app, me);
  const key = `clips:${me.id}`;
  let ranking = set > 0 ? cacheGet<RankedCache>(app, key, 60 * 60_000) : undefined;
  if (!ranking) {
    const { posts, authors } = await mixCandidates(app, me, ctx, 'clip', 30);
    const rc = await rankingContext(app, me, ctx);
    const dials = { ...me.settings.feed, friendsVsDiscover: Math.max(me.settings.feed.friendsVsDiscover, 40) };
    const ranked = rankFeed({ candidates: posts.map((p) => candidateFor(me, ctx, rc, p, authors.get(p.authorId)!)), dials, interests: rc.interests, now: app.now() });
    ranking = { ids: ranked.map((r) => r.postId), why: Object.fromEntries(ranked.map((r) => [r.postId, r.reasons])) };
    cacheSet(app, key, ranking);
  }
  const slice = ranking.ids.slice(set * setSize, (set + 1) * setSize);
  const rows = await app.store.find('posts', { where: { id: { in: slice } } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = slice.map((id) => byId.get(id)).filter((p): p is PostRow => Boolean(p));
  return {
    items: await hydratePosts(app, me, ctx, ordered, new Map(Object.entries(ranking.why))),
    set,
    setSize,
    sets: Math.ceil(ranking.ids.length / setSize),
    end: (set + 1) * setSize >= ranking.ids.length,
  };
}

// ---- Discover --------------------------------------------------------------

export interface TrendingTopic {
  topic: string;
  label: string;
  emoji: string;
  posts: number;
  people: number;
}

export async function trendingTopics(app: App, hours = 72): Promise<TrendingTopic[]> {
  const rows = await app.store.find('postTopics', { where: { isPublic: true, createdAt: { gt: app.now() - hours * HOUR } }, limit: 5000 });
  const stats = new Map<string, { posts: number; people: Set<ID> }>();
  for (const r of rows) {
    const s = stats.get(r.topic) ?? { posts: 0, people: new Set() };
    s.posts++;
    s.people.add(r.authorId);
    stats.set(r.topic, s);
  }
  return [...stats.entries()]
    .map(([topic, s]) => {
      const known = TOPICS.find((t) => t.id === topic);
      return { topic, label: known?.label ?? topic, emoji: known?.emoji ?? '#', posts: s.posts, people: s.people.size };
    })
    // Trending means many different people, not one account posting a lot.
    .sort((a, b) => b.people - a.people || b.posts - a.posts)
    .slice(0, 12);
}

export interface Explore {
  trending: TrendingTopic[];
  people: Array<{ user: UserSummary; reason: string }>;
  spaces: SpaceView[];
  plans: PlanView[];
  highlights: PostView[];
}

export async function explore(app: App, me: UserRow | null): Promise<Explore> {
  const ctx = await viewerContext(app, me);
  const since = app.now() - 4 * DAY;
  const recent = await app.store.find('posts', {
    where: { audience: 'public', kind: 'post', status: 'visible', sponsored: false, createdAt: { gt: since } },
    orderBy: [['createdAt', 'desc']],
    limit: 400,
  });
  const authors = await authorsOf(app, recent);
  const muted = me ? await mutedIds(app, me) : new Set<ID>();
  const meTeen = me ? isTeen(me.birthDate, app.now()) : false;
  const interests = me ? (await rankingContext(app, me, ctx)).interests : {};
  const highlights = visibleTo(recent, authors, ctx, muted)
    .filter((p) => p.media.length > 0 && p.authorId !== me?.id && (meTeen || !isTeen(authors.get(p.authorId)!.birthDate, app.now())))
    .filter((p) => !(me && me.settings.feed.ai === 'hide' && p.origin === 'ai_generated'))
    .map((p) => ({ p, score: appreciationOf(p) + Math.max(0, ...p.topics.map((t) => interests[t] ?? 0)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((x) => x.p);
  const [trending, people, spaces, plans] = await Promise.all([
    trendingTopics(app),
    me ? suggestPeople(app, me, 8) : Promise.resolve([]),
    listSpaces(app, me, {}),
    listPlans(app, me, { scope: 'upcoming' }),
  ]);
  return {
    trending,
    people,
    spaces: spaces.slice(0, 8),
    plans: plans.filter((p) => !p.myRsvp).slice(0, 6),
    highlights: await hydratePosts(app, me, ctx, highlights),
  };
}

export async function topicPage(app: App, me: UserRow | null, tag: string, before?: number): Promise<{ topic: string; label: string; emoji: string; items: PostView[]; nextCursor: string | null; spaces: SpaceView[] }> {
  const topic = tag.toLowerCase().replace(/^#/, '').slice(0, 30);
  const ctx = await viewerContext(app, me);
  const refs = await app.store.find('postTopics', {
    where: { topic, ...(before ? { createdAt: { lt: before } } : {}) },
    orderBy: [['createdAt', 'desc']],
    limit: 60,
  });
  const rows = await app.store.find('posts', { where: { id: { in: refs.map((r) => r.postId) }, status: 'visible' } });
  rows.sort((a, b) => b.createdAt - a.createdAt);
  const authors = await authorsOf(app, rows);
  const muted = me ? await mutedIds(app, me) : new Set<ID>();
  const visible = visibleTo(rows, authors, ctx, muted).slice(0, 20);
  const known = TOPICS.find((t) => t.id === topic);
  const spaces = (await listSpaces(app, me, {})).filter((s) => s.topics.includes(topic)).slice(0, 4);
  return {
    topic,
    label: known?.label ?? topic,
    emoji: known?.emoji ?? '#',
    items: await hydratePosts(app, me, ctx, visible),
    nextCursor: refs.length === 60 && visible.length ? String(visible[visible.length - 1].createdAt) : null,
    spaces,
  };
}

export async function search(app: App, me: UserRow | null, query: string) {
  const q = query.trim().replace(/^[@#]/, '').slice(0, 50);
  if (q.length < 1) return { people: [], topics: [], spaces: [], posts: [] };
  const ctx = await viewerContext(app, me);
  const now = app.now();
  const meTeen = me ? isTeen(me.birthDate, now) : false;
  const users = await app.store.find('users', {
    where: { status: 'active', $or: [{ handle: { contains: q } }, { name: { contains: q } }] },
    limit: 40,
  });
  const people = users
    .filter((u) => !ctx.blocked.has(u.id))
    // Adults only find teen accounts that already follow them.
    .filter((u) => u.id === me?.id || meTeen || !isTeen(u.birthDate, now) || ctx.followers.has(u.id))
    .slice(0, 20)
    .map(userSummary);
  const topicIds = new Set<string>();
  for (const t of TOPICS) if (t.id.includes(q.toLowerCase()) || t.label.toLowerCase().includes(q.toLowerCase())) topicIds.add(t.id);
  for (const r of await app.store.find('postTopics', { where: { topic: { contains: q }, isPublic: true }, limit: 200 })) topicIds.add(r.topic);
  const topics = [...topicIds].slice(0, 12).map((id) => {
    const known = TOPICS.find((t) => t.id === id);
    return { topic: id, label: known?.label ?? id, emoji: known?.emoji ?? '#' };
  });
  const spaces = await listSpaces(app, me, { q });
  const postRows = await app.store.find('posts', {
    where: { text: { contains: q }, status: 'visible', audience: 'public', createdAt: { gt: now - 90 * DAY } },
    orderBy: [['createdAt', 'desc']],
    limit: 60,
  });
  const authors = await authorsOf(app, postRows);
  const muted = me ? await mutedIds(app, me) : new Set<ID>();
  const posts = await hydratePosts(app, me, ctx, visibleTo(postRows, authors, ctx, muted).slice(0, 20));
  return { people, topics, spaces: spaces.slice(0, 8), posts };
}
