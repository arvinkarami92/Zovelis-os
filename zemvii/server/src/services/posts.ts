// Posts, reactions, saves, comments, community notes and "Why am I seeing this?".

import type { App } from './app.ts';
import { cacheGet, cacheSet } from './app.ts';
import type {
  Audience, CommentRow, ID, MediaItem, NoteRow, Origin, PostKind, PostRow, ReactionType, ReplyControl, UserRow,
} from '../store/types.ts';
import { newId } from '../store/store.ts';
import { ART_SCENES, REACTIONS } from '../core/defaults.ts';
import { checkTone, type ToneResult } from '../core/tone.ts';
import { containsAnyWord, extractMentions, extractTopics } from '../core/text.ts';
import { canReply, canViewPost, isFriend, type ViewerContext } from '../core/visibility.ts';
import { computeInterests, exclusionReason, scoreCandidate, type Candidate, type Reason, type Relation } from '../core/feed.ts';
import { isTeen } from '../core/age.ts';
import { noteIsShown } from '../core/notes.ts';
import { badRequest, conflict, forbidden, HttpError, notFound } from './errors.ts';
import { assertCanAct, mutedIds, viewerContext } from './graph.ts';
import { notify } from './notify.ts';
import { bool, oneOf, str, strList } from './validate.ts';
import { userSummary, type CommentView, type PostView, type WhyView } from './views.ts';

const AUDIENCES: Audience[] = ['public', 'followers', 'friends', 'circle', 'supporters', 'space', 'private'];
const ORIGINS: Origin[] = ['human', 'ai_assisted', 'ai_generated'];
const REPLY_CONTROLS: ReplyControl[] = ['everyone', 'followers', 'friends', 'nobody'];
const REACTION_TYPES = REACTIONS.map((r) => r.type);
export const MAX_POST_LENGTH = 2200;
export const MAX_COMMENT_LENGTH = 1000;

/** Runs the tone check; throws a 422 for threats and a 409 nudge for hurtful text unless confirmed. */
export function enforceTone(text: string, confirmed: boolean): ToneResult {
  const tone = checkTone(text);
  if (tone.level === 'threat') {
    throw new HttpError(422, 'tone_threat', tone.suggestion ?? "Threats aren't allowed.", { code: 'tone_threat', tone });
  }
  if (tone.level === 'hurtful' && !confirmed) {
    throw new HttpError(409, 'tone_nudge', 'Pause & rethink', { code: 'tone_nudge', tone });
  }
  return tone;
}

// ---- Reading -------------------------------------------------------------

export async function loadPostFor(app: App, me: UserRow | null, ctx: ViewerContext, id: string): Promise<{ post: PostRow; author: UserRow }> {
  const post = await app.store.get('posts', id);
  if (!post) throw notFound('This post is not available.');
  const author = await app.store.get('users', post.authorId);
  if (!author || !canViewPost(post, author, ctx)) throw notFound('This post is not available.');
  return { post, author };
}

export async function hydratePosts(
  app: App,
  me: UserRow | null,
  ctx: ViewerContext,
  posts: PostRow[],
  why?: Map<ID, Reason[]>,
): Promise<PostView[]> {
  if (posts.length === 0) return [];
  const ids = posts.map((p) => p.id);
  const unique = <T>(values: (T | null)[]) => [...new Set(values.filter((v): v is T => v !== null))];
  const [authors, circles, spaces, plans, mine, saves, notes] = await Promise.all([
    app.store.find('users', { where: { id: { in: unique(posts.map((p) => p.authorId)) } } }),
    app.store.find('circles', { where: { id: { in: unique(posts.map((p) => p.circleId)) } } }),
    app.store.find('spaces', { where: { id: { in: unique(posts.map((p) => p.spaceId)) } } }),
    app.store.find('plans', { where: { id: { in: unique(posts.map((p) => p.planId)) } } }),
    me ? app.store.find('reactions', { where: { postId: { in: ids }, userId: me.id } }) : [],
    me ? app.store.find('saves', { where: { postId: { in: ids }, userId: me.id } }) : [],
    app.store.find('notes', { where: { postId: { in: ids } } }),
  ]);
  const countsVisible = posts.filter((p) => p.showCounts || p.authorId === me?.id).map((p) => p.id);
  const known = [...ctx.following].slice(0, 500);
  const [countable, knownReactions, myRatings] = await Promise.all([
    app.store.find('reactions', { where: { postId: { in: countsVisible } } }),
    known.length ? app.store.find('reactions', { where: { postId: { in: ids }, userId: { in: known } }, orderBy: [['createdAt', 'desc']] }) : [],
    me && notes.length ? app.store.find('noteRatings', { where: { noteId: { in: notes.map((n) => n.id) }, userId: me.id } }) : [],
  ]);
  const reactorIds = unique(knownReactions.map((r) => r.userId));
  const reactors = new Map((await app.store.find('users', { where: { id: { in: reactorIds }, status: 'active' } })).map((u) => [u.id, u]));
  const authorMap = new Map(authors.map((u) => [u.id, u]));
  const circleMap = new Map(circles.map((c) => [c.id, c]));
  const spaceMap = new Map(spaces.map((s) => [s.id, s]));
  const planMap = new Map(plans.map((p) => [p.id, p]));
  const myReaction = new Map(mine.map((r) => [r.postId, r.type]));
  const saved = new Set(saves.map((s) => s.postId));
  const ratings = new Map(myRatings.map((r) => [r.noteId, r.helpful]));
  const meTeen = me ? isTeen(me.birthDate, app.now()) : false;

  return posts.flatMap((post) => {
    const author = authorMap.get(post.authorId);
    if (!author) return [];
    const own = me?.id === post.authorId;
    const showCounts = post.showCounts || own;
    let reactions: PostView['reactions'] = null;
    if (showCounts) {
      reactions = {};
      for (const r of countable) if (r.postId === post.id) reactions[r.type] = (reactions[r.type] ?? 0) + 1;
    }
    const reactedBy = knownReactions
      .filter((r) => r.postId === post.id)
      .map((r) => reactors.get(r.userId))
      .filter((u): u is UserRow => Boolean(u))
      .slice(0, 3)
      .map(userSummary);
    const postNotes = notes.filter((n) => n.postId === post.id);
    const shown = postNotes.find((n) => n.status === 'shown');
    const visibleNote: NoteRow | undefined =
      shown ?? postNotes.find((n) => n.authorId === me?.id) ?? (me && !own ? postNotes.find((n) => !ratings.has(n.id)) : undefined);
    const circle = post.circleId ? circleMap.get(post.circleId) : undefined;
    const space = post.spaceId ? spaceMap.get(post.spaceId) : undefined;
    const plan = post.planId ? planMap.get(post.planId) : undefined;
    const view: PostView = {
      id: post.id,
      kind: post.kind,
      text: post.text,
      media: post.media,
      audience: post.audience,
      circle: circle ? { id: circle.id, name: circle.name, emoji: circle.emoji } : null,
      space: space ? { id: space.id, slug: space.slug, name: space.name, emoji: space.emoji } : null,
      plan: plan ? { id: plan.id, title: plan.title } : null,
      origin: post.origin,
      topics: post.topics,
      replyControl: post.replyControl,
      showCounts: post.showCounts,
      createdAt: post.createdAt,
      editedAt: post.editedAt,
      status: post.status === 'removed' ? 'removed' : 'visible',
      author: userSummary(author),
      reactions,
      reactionTotal: showCounts ? post.reactionCount : null,
      commentCount: post.commentCount,
      reactedBy,
      myReaction: myReaction.get(post.id) ?? null,
      saved: saved.has(post.id),
      canReply: Boolean(me) && canReply(post, ctx) && post.status === 'visible',
      canEdit: own,
      canTip:
        Boolean(me) && !own && !meTeen && !isTeen(author.birthDate, app.now()) && author.settings.creator.tipsEnabled && !post.sponsored,
      tipCents: own ? post.tipCents : null,
      note: visibleNote
        ? {
            id: visibleNote.id,
            text: visibleNote.text,
            helpful: visibleNote.helpful,
            notHelpful: visibleNote.notHelpful,
            shown: visibleNote.status === 'shown',
            myRating: ratings.get(visibleNote.id) ?? null,
            mine: visibleNote.authorId === me?.id,
          }
        : null,
      sponsored: post.sponsored,
      sponsorName: post.sponsorName,
      why: why?.get(post.id) ?? null,
    };
    return [view];
  });
}

export async function getPost(app: App, me: UserRow | null, id: string): Promise<PostView> {
  const ctx = await viewerContext(app, me);
  const { post } = await loadPostFor(app, me, ctx, id);
  return (await hydratePosts(app, me, ctx, [post]))[0];
}

export async function postsByAuthor(
  app: App,
  me: UserRow | null,
  author: UserRow,
  opts: { kind?: PostKind; before?: number; limit?: number },
): Promise<{ items: PostView[]; nextCursor: string | null }> {
  const ctx = await viewerContext(app, me);
  const limit = opts.limit ?? 20;
  const rows = await app.store.find('posts', {
    where: {
      authorId: author.id,
      status: me?.id === author.id ? { in: ['visible', 'removed'] } : 'visible',
      ...(opts.kind ? { kind: opts.kind } : {}),
      ...(opts.before ? { createdAt: { lt: opts.before } } : {}),
    },
    orderBy: [['createdAt', 'desc']],
    limit: limit * 3,
  });
  const visible = rows.filter((p) => canViewPost(p, author, ctx));
  const page = visible.slice(0, limit);
  const hasMore = visible.length > limit || rows.length === limit * 3;
  return {
    items: await hydratePosts(app, me, ctx, page),
    nextCursor: hasMore && page.length ? String(page[page.length - 1].createdAt) : null,
  };
}

// ---- Writing -------------------------------------------------------------

async function validateMedia(app: App, me: UserRow, value: unknown): Promise<MediaItem[]> {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw badRequest('Media must be a list.');
  if (value.length > 10) throw badRequest('Up to 10 photos or videos per post.');
  const out: MediaItem[] = [];
  for (const item of value as Array<Record<string, unknown>>) {
    if (!item || typeof item !== 'object') throw badRequest('Invalid media item.');
    const alt = str(item.alt, 'Alt text', { max: 300 });
    if (item.type === 'art') {
      const art = item.art as Record<string, unknown> | undefined;
      const scene = oneOf(art?.scene, 'Scene', ART_SCENES);
      const seed = typeof art?.seed === 'number' && Number.isInteger(art.seed) ? Math.abs(art.seed) % 1_000_000 : 1;
      out.push({ id: newId(), type: 'art', art: { scene, seed }, alt });
      continue;
    }
    const media = typeof item.id === 'string' ? await app.store.get('media', item.id) : undefined;
    if (!media || media.ownerId !== me.id) throw badRequest('Upload the file first.');
    const type = media.mime.startsWith('video/') ? 'video' : 'image';
    out.push({ id: media.id, type, url: media.url, mime: media.mime, alt });
  }
  return out;
}

export interface PostInput {
  text?: unknown;
  kind?: unknown;
  media?: unknown;
  audience?: unknown;
  circleId?: unknown;
  spaceId?: unknown;
  planId?: unknown;
  origin?: unknown;
  topics?: unknown;
  replyControl?: unknown;
  showCounts?: unknown;
  confirmTone?: unknown;
  sponsored?: unknown;
  sponsorName?: unknown;
}

export async function createPost(app: App, me: UserRow, input: PostInput): Promise<PostView> {
  assertCanAct(app, me);
  const now = app.now();
  const teen = isTeen(me.birthDate, now);
  const text = str(input.text, 'Text', { max: MAX_POST_LENGTH });
  const kind = oneOf<PostKind>(input.kind, 'Kind', ['post', 'clip'], 'post');
  const media = await validateMedia(app, me, input.media);
  if (!text && media.length === 0) throw badRequest('Write something or add a photo.');
  if (kind === 'clip' && !media.some((m) => m.type === 'video' || m.type === 'art')) throw badRequest('A clip needs a video.');
  const origin = oneOf<Origin>(input.origin, 'Origin', ORIGINS);
  let audience = oneOf<Audience>(input.audience, 'Audience', AUDIENCES, me.settings.privacy.defaultAudience);
  let circleId: string | null = null;
  let spaceId: string | null = null;
  let planId: string | null = null;

  if (audience === 'circle') {
    const circle = typeof input.circleId === 'string' ? await app.store.get('circles', input.circleId) : undefined;
    if (!circle || circle.ownerId !== me.id) throw badRequest('Choose one of your circles.');
    circleId = circle.id;
  }
  if (input.spaceId !== undefined && input.spaceId !== null) {
    const space = typeof input.spaceId === 'string' ? await app.store.get('spaces', input.spaceId) : undefined;
    const member = space && (await app.store.findOne('spaceMembers', { spaceId: space.id, userId: me.id }));
    if (!space || !member) throw forbidden('Join the space to post in it.');
    spaceId = space.id;
    audience = 'space';
  } else if (audience === 'space') {
    throw badRequest('Choose a space.');
  }
  if (audience === 'supporters') {
    if (teen || !me.settings.creator.supportersEnabled) throw badRequest('Turn on supporters in Creator settings first.');
  }
  if (input.planId !== undefined && input.planId !== null) {
    const plan = typeof input.planId === 'string' ? await app.store.get('plans', input.planId) : undefined;
    const going = plan && (plan.hostId === me.id || (await app.store.findOne('rsvps', { planId: plan.id, userId: me.id, status: 'going' })));
    if (!plan || !going) throw forbidden('Only people who went can add memories to a plan.');
    planId = plan.id;
  }
  const sponsored = me.role === 'admin' && input.sponsored === true;
  const tone = enforceTone(text, input.confirmTone === true);
  const topics = [...new Set([...extractTopics(text), ...strList(input.topics, 'Topics', { maxItems: 5, maxLength: 30 })])].slice(0, 10);
  const mentions = extractMentions(text);

  const post: PostRow = {
    id: newId(),
    authorId: me.id,
    kind,
    text,
    media,
    audience,
    circleId,
    spaceId,
    planId,
    origin,
    topics,
    mentions,
    replyControl: oneOf<ReplyControl>(input.replyControl, 'Who can reply', REPLY_CONTROLS, me.settings.privacy.whoCanComment),
    showCounts: bool(input.showCounts, 'Show counts', me.settings.privacy.showCountsByDefault),
    sponsored,
    sponsorName: sponsored ? str(input.sponsorName, 'Sponsor', { required: true, max: 60 }) : null,
    heat: tone.heat,
    reactionCount: 0,
    commentCount: 0,
    saveCount: 0,
    tipCents: 0,
    status: 'visible',
    createdAt: now,
    editedAt: null,
  };
  await app.store.insert('posts', post);
  await indexTopics(app, post);
  await notifyMentions(app, me, post, mentions, 'mentioned you in a post');
  const ctx = await viewerContext(app, me);
  return (await hydratePosts(app, me, ctx, [post]))[0];
}

/** Keep the topic index in step with a post. */
export async function indexTopics(app: App, post: PostRow): Promise<void> {
  await app.store.delete('postTopics', { postId: post.id });
  if (post.status !== 'visible') return;
  const isPublic = post.audience === 'public' && !post.sponsored;
  for (const topic of post.topics) {
    await app.store.insert('postTopics', { id: `pt_${post.id}_${topic}`, postId: post.id, topic, authorId: post.authorId, isPublic, createdAt: post.createdAt });
  }
}

async function notifyMentions(app: App, me: UserRow, post: PostRow, handles: string[], what: string, commentId?: string) {
  if (handles.length === 0) return;
  const users = await app.store.find('users', { where: { handle: { in: handles }, status: 'active' } });
  for (const user of users) {
    if (user.id === me.id) continue;
    const ctx = await viewerContext(app, user);
    if (!canViewPost(post, me, ctx)) continue;
    await notify(app, { userId: user.id, actorId: me.id, type: 'mention', text: `${me.name} ${what}`, postId: post.id, commentId: commentId ?? null });
  }
}

export async function updatePost(app: App, me: UserRow, id: string, input: PostInput): Promise<PostView> {
  assertCanAct(app, me);
  const post = await app.store.get('posts', id);
  if (!post || post.authorId !== me.id || post.status === 'deleted') throw notFound('This post is not available.');
  const patch: Partial<PostRow> = { editedAt: app.now() };
  if (input.text !== undefined) {
    const text = str(input.text, 'Text', { max: MAX_POST_LENGTH });
    if (!text && post.media.length === 0) throw badRequest('Write something.');
    const tone = enforceTone(text, input.confirmTone === true);
    patch.text = text;
    patch.heat = tone.heat;
    patch.topics = extractTopics(text);
    patch.mentions = extractMentions(text);
  }
  if (input.origin !== undefined) patch.origin = oneOf<Origin>(input.origin, 'Origin', ORIGINS);
  if (input.replyControl !== undefined) patch.replyControl = oneOf<ReplyControl>(input.replyControl, 'Who can reply', REPLY_CONTROLS);
  if (input.showCounts !== undefined) patch.showCounts = bool(input.showCounts, 'Show counts');
  await app.store.update('posts', { id }, patch);
  const updated = await app.store.get('posts', id);
  if (updated) await indexTopics(app, updated);
  return getPost(app, me, id);
}

export async function deletePost(app: App, me: UserRow, id: string): Promise<void> {
  const post = await app.store.get('posts', id);
  if (!post || post.status === 'deleted') throw notFound('This post is not available.');
  if (post.authorId !== me.id && me.role !== 'admin') throw forbidden();
  await app.store.update('posts', { id }, { status: 'deleted', text: '', media: [] });
  await app.store.delete('postTopics', { postId: id });
}

// ---- Reactions and saves ---------------------------------------------------

export async function react(app: App, me: UserRow, postId: string, type: unknown): Promise<PostView> {
  assertCanAct(app, me);
  const reaction = oneOf<ReactionType>(type, 'Reaction', REACTION_TYPES);
  const ctx = await viewerContext(app, me);
  const { post } = await loadPostFor(app, me, ctx, postId);
  const id = `r_${postId}_${me.id}`;
  const existing = await app.store.get('reactions', id);
  await app.store.upsert('reactions', { id, postId, userId: me.id, type: reaction, createdAt: existing?.createdAt ?? app.now() });
  if (!existing) {
    await app.store.increment('posts', postId, 'reactionCount', 1);
    const label = REACTIONS.find((r) => r.type === reaction)!;
    await notify(app, { userId: post.authorId, actorId: me.id, type: 'reaction', postId, text: `${me.name} reacted ${label.emoji} to your post` });
  }
  return getPost(app, me, postId);
}

export async function unreact(app: App, me: UserRow, postId: string): Promise<PostView> {
  const removed = await app.store.delete('reactions', { id: `r_${postId}_${me.id}` });
  if (removed) await app.store.increment('posts', postId, 'reactionCount', -1);
  return getPost(app, me, postId);
}

export async function setSaved(app: App, me: UserRow, postId: string, saved: boolean): Promise<void> {
  const ctx = await viewerContext(app, me);
  await loadPostFor(app, me, ctx, postId);
  const id = `s_${me.id}_${postId}`;
  const existing = await app.store.get('saves', id);
  if (saved && !existing) {
    await app.store.insert('saves', { id, userId: me.id, postId, createdAt: app.now() });
    await app.store.increment('posts', postId, 'saveCount', 1);
  } else if (!saved && existing) {
    await app.store.delete('saves', { id });
    await app.store.increment('posts', postId, 'saveCount', -1);
  }
}

export async function savedPosts(app: App, me: UserRow): Promise<PostView[]> {
  const saves = await app.store.find('saves', { where: { userId: me.id }, orderBy: [['createdAt', 'desc']], limit: 100 });
  const ctx = await viewerContext(app, me);
  const posts = new Map((await app.store.find('posts', { where: { id: { in: saves.map((s) => s.postId) } } })).map((p) => [p.id, p]));
  const authors = new Map(
    (await app.store.find('users', { where: { id: { in: [...new Set([...posts.values()].map((p) => p.authorId))] } } })).map((u) => [u.id, u]),
  );
  const visible = saves
    .map((s) => posts.get(s.postId))
    .filter((p): p is PostRow => Boolean(p) && canViewPost(p!, authors.get(p!.authorId)!, ctx));
  return hydratePosts(app, me, ctx, visible);
}

// ---- Comments --------------------------------------------------------------

export async function listComments(app: App, me: UserRow | null, postId: string): Promise<{ items: CommentView[]; filteredCount: number }> {
  const ctx = await viewerContext(app, me);
  const { post, author } = await loadPostFor(app, me, ctx, postId);
  const muted = me ? await mutedIds(app, me) : new Set<string>();
  const rows = await app.store.find('comments', { where: { postId, status: 'visible' }, orderBy: [['createdAt', 'asc']], limit: 500 });
  const users = new Map(
    (await app.store.find('users', { where: { id: { in: [...new Set(rows.map((r) => r.authorId))] } } })).map((u) => [u.id, u]),
  );
  const hiddenWords = author.settings.privacy.hiddenWords;
  let filteredCount = 0;
  const items: CommentView[] = [];
  for (const row of rows) {
    const writer = users.get(row.authorId);
    if (!writer || writer.status === 'deleted') continue;
    if (ctx.blocked.has(row.authorId) || muted.has(row.authorId)) continue;
    const filtered = containsAnyWord(row.text, hiddenWords);
    if (filtered && row.authorId !== me?.id) {
      filteredCount++;
      if (me?.id !== post.authorId) continue;
    }
    items.push({
      id: row.id,
      postId,
      parentId: row.parentId,
      text: row.text,
      createdAt: row.createdAt,
      author: userSummary(writer),
      canDelete: Boolean(me) && (me!.id === row.authorId || me!.id === post.authorId || me!.role === 'admin'),
      filtered,
    });
  }
  return { items, filteredCount };
}

export async function addComment(
  app: App,
  me: UserRow,
  postId: string,
  input: { text?: unknown; parentId?: unknown; confirmTone?: unknown },
): Promise<CommentView> {
  assertCanAct(app, me);
  const ctx = await viewerContext(app, me);
  const { post } = await loadPostFor(app, me, ctx, postId);
  if (post.status !== 'visible' || !canReply(post, ctx)) throw forbidden('Replies are limited on this post.', 'replies_limited');
  const text = str(input.text, 'Comment', { required: true, max: MAX_COMMENT_LENGTH });
  const tone = enforceTone(text, input.confirmTone === true);
  let parent: CommentRow | undefined;
  if (typeof input.parentId === 'string') {
    parent = await app.store.get('comments', input.parentId);
    if (!parent || parent.postId !== postId) throw badRequest('That comment is gone.');
    if (parent.parentId) parent = (await app.store.get('comments', parent.parentId)) ?? parent; // one level of threading
  }
  const row: CommentRow = {
    id: newId(),
    postId,
    authorId: me.id,
    parentId: parent?.id ?? null,
    text,
    heat: tone.heat,
    nudged: tone.level === 'hurtful',
    status: 'visible',
    createdAt: app.now(),
  };
  await app.store.insert('comments', row);
  await app.store.increment('posts', postId, 'commentCount', 1);
  const snippet = text.length > 60 ? `${text.slice(0, 57)}…` : text;
  await notify(app, { userId: post.authorId, actorId: me.id, type: 'comment', postId, commentId: row.id, text: `${me.name} commented: “${snippet}”` });
  if (parent && parent.authorId !== post.authorId) {
    await notify(app, { userId: parent.authorId, actorId: me.id, type: 'reply', postId, commentId: row.id, text: `${me.name} replied: “${snippet}”` });
  }
  await notifyMentions(app, me, post, extractMentions(text), 'mentioned you in a comment', row.id);
  return { id: row.id, postId, parentId: row.parentId, text, createdAt: row.createdAt, author: userSummary(me), canDelete: true, filtered: false };
}

export async function deleteComment(app: App, me: UserRow, commentId: string): Promise<void> {
  const comment = await app.store.get('comments', commentId);
  if (!comment || comment.status !== 'visible') throw notFound('That comment is gone.');
  const post = await app.store.get('posts', comment.postId);
  if (comment.authorId !== me.id && post?.authorId !== me.id && me.role !== 'admin') throw forbidden();
  await app.store.update('comments', { id: commentId }, { status: 'deleted' });
  await app.store.increment('posts', comment.postId, 'commentCount', -1);
}

// ---- Community notes -------------------------------------------------------

export async function proposeNote(app: App, me: UserRow, postId: string, input: { text?: unknown }): Promise<PostView> {
  assertCanAct(app, me);
  if (!me.verifiedHuman) throw forbidden("Verify you're human to write community notes.", 'verify_required');
  const ctx = await viewerContext(app, me);
  const { post } = await loadPostFor(app, me, ctx, postId);
  if (post.authorId === me.id) throw badRequest("You can't add a note to your own post.");
  if (await app.store.findOne('notes', { postId, authorId: me.id })) throw conflict('You already proposed a note here.');
  const text = str(input.text, 'Note', { required: true, min: 10, max: 500 });
  enforceTone(text, false);
  await app.store.insert('notes', { id: newId(), postId, authorId: me.id, text, helpful: 0, notHelpful: 0, status: 'proposed', createdAt: app.now() });
  return getPost(app, me, postId);
}

export async function rateNote(app: App, me: UserRow, noteId: string, helpful: unknown): Promise<PostView> {
  assertCanAct(app, me);
  const note = await app.store.get('notes', noteId);
  if (!note) throw notFound('That note is gone.');
  const ctx = await viewerContext(app, me);
  const { post } = await loadPostFor(app, me, ctx, note.postId);
  if (note.authorId === me.id || post.authorId === me.id) throw badRequest("You can't rate this note.");
  await app.store.upsert('noteRatings', { id: `nr_${noteId}_${me.id}`, noteId, userId: me.id, helpful: bool(helpful, 'Helpful'), createdAt: app.now() });
  const ratings = await app.store.find('noteRatings', { where: { noteId } });
  const yes = ratings.filter((r) => r.helpful).length;
  const no = ratings.length - yes;
  const status = noteIsShown(yes, no) ? 'shown' : 'proposed';
  await app.store.update('notes', { id: noteId }, { helpful: yes, notHelpful: no, status });
  if (status === 'shown' && note.status !== 'shown') {
    await notify(app, { userId: post.authorId, type: 'note', postId: post.id, text: 'Readers added context to one of your posts.' });
    await notify(app, { userId: note.authorId, type: 'note', postId: post.id, text: 'Your community note was rated helpful and is now shown.' });
  }
  return getPost(app, me, note.postId);
}

// ---- Ranking context and "Why am I seeing this?" ---------------------------

export interface RankingContext {
  circleOf: Map<ID, string>;
  spaceNames: Map<ID, string>;
  interests: Record<string, number>;
}

export async function rankingContext(app: App, me: UserRow, ctx: ViewerContext): Promise<RankingContext> {
  const [members, circles, spaces] = await Promise.all([
    app.store.find('circleMembers', { where: { ownerId: me.id } }),
    app.store.find('circles', { where: { ownerId: me.id } }),
    app.store.find('spaces', { where: { id: { in: [...ctx.spaces] } } }),
  ]);
  const circleNames = new Map(circles.map((c) => [c.id, c.name]));
  const circleOf = new Map<ID, string>();
  for (const m of members) if (!circleOf.has(m.userId)) circleOf.set(m.userId, circleNames.get(m.circleId) ?? 'circle');
  const key = `interests:${me.id}`;
  let interests = cacheGet<Record<string, number>>(app, key, 10 * 60_000);
  if (!interests) {
    const since = app.now() - 30 * 86_400_000;
    const [reactions, saves] = await Promise.all([
      app.store.find('reactions', { where: { userId: me.id, createdAt: { gt: since } }, orderBy: [['createdAt', 'desc']], limit: 200 }),
      app.store.find('saves', { where: { userId: me.id, createdAt: { gt: since } }, limit: 100 }),
    ]);
    const engaged = await app.store.find('posts', { where: { id: { in: [...reactions, ...saves].map((r) => r.postId) } } });
    interests = computeInterests(me.topics, engaged.map((p) => p.topics));
    cacheSet(app, key, interests);
  }
  return { circleOf, spaceNames: new Map(spaces.map((s) => [s.id, s.name])), interests };
}

export function relationFor(me: UserRow, ctx: ViewerContext, rc: RankingContext, post: PostRow): Relation {
  return {
    self: post.authorId === me.id,
    circle: rc.circleOf.get(post.authorId) ?? null,
    friend: isFriend(ctx, post.authorId),
    follows: ctx.following.has(post.authorId),
    space: post.spaceId && ctx.spaces.has(post.spaceId) ? (rc.spaceNames.get(post.spaceId) ?? null) : null,
  };
}

export function candidateFor(me: UserRow, ctx: ViewerContext, rc: RankingContext, post: PostRow, author: UserRow): Candidate {
  return { post, authorHandle: author.handle, relation: relationFor(me, ctx, rc, post) };
}

export async function whyPost(app: App, me: UserRow, postId: string): Promise<WhyView> {
  const ctx = await viewerContext(app, me);
  const { post, author } = await loadPostFor(app, me, ctx, postId);
  const rc = await rankingContext(app, me, ctx);
  const dials = me.settings.feed;
  const candidate = candidateFor(me, ctx, rc, post, author);
  const excluded = exclusionReason(candidate, dials);
  const ranked = scoreCandidate(candidate, { dials, interests: rc.interests, now: app.now() });
  return {
    postId,
    shown: excluded === null,
    excludedBecause: excluded,
    reasons: post.sponsored
      ? [{ kind: 'discover', text: 'Sponsored. Matched to the topic of nearby posts, never to your activity or other apps.' }]
      : ranked.reasons,
    breakdown: post.sponsored ? null : ranked.breakdown,
    dials: { friendsVsDiscover: dials.friendsVsDiscover, freshVsPopular: dials.freshVsPopular, calm: dials.calm, ai: dials.ai },
    feedNote: 'This comes from the same code that ranks your Mix feed. Your Friends feed is always newest-first and complete.',
  };
}
