// Spaces (communities) and Plans (real-life meetups with RSVPs and shared
// memories afterwards).

import type { App } from './app.ts';
import type { ID, PlanRow, SpaceRow, UserRow } from '../store/types.ts';
import { newId } from '../store/store.ts';
import { isTeen } from '../core/age.ts';
import { slugify } from '../core/text.ts';
import { canViewPost, isFriend, type ViewerContext } from '../core/visibility.ts';
import { badRequest, forbidden, notFound } from './errors.ts';
import { assertCanAct, userByHandle, viewerContext } from './graph.ts';
import { notify } from './notify.ts';
import { hydratePosts } from './posts.ts';
import { int, oneOf, str, strList } from './validate.ts';
import { userSummary, type PlanView, type PostView, type SpaceView, type UserSummary } from './views.ts';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// ---- Spaces ----------------------------------------------------------------

async function spaceViews(app: App, me: UserRow | null, spaces: SpaceRow[]): Promise<SpaceView[]> {
  const owners = new Map(
    (await app.store.find('users', { where: { id: { in: [...new Set(spaces.map((s) => s.ownerId))] } } })).map((u) => [u.id, u]),
  );
  const memberships = me
    ? new Map((await app.store.find('spaceMembers', { where: { userId: me.id, spaceId: { in: spaces.map((s) => s.id) } } })).map((m) => [m.spaceId, m.role]))
    : new Map();
  return spaces.map((s) => {
    const owner = owners.get(s.ownerId);
    return {
      id: s.id,
      slug: s.slug,
      name: s.name,
      description: s.description,
      emoji: s.emoji,
      hue: s.hue,
      visibility: s.visibility,
      rules: s.rules,
      topics: s.topics,
      location: s.location,
      memberCount: s.memberCount,
      owner: owner && owner.status === 'active' ? userSummary(owner) : null,
      myRole: memberships.get(s.id) ?? null,
      createdAt: s.createdAt,
    };
  });
}

export async function listSpaces(app: App, me: UserRow | null, opts: { q?: string; mine?: boolean }): Promise<SpaceView[]> {
  const mineIds = me ? (await app.store.find('spaceMembers', { where: { userId: me.id } })).map((m) => m.spaceId) : [];
  const where = opts.mine
    ? { id: { in: mineIds } }
    : { $or: [{ visibility: 'public' as const }, { id: { in: mineIds } }], ...(opts.q ? { name: { contains: opts.q } } : {}) };
  const spaces = await app.store.find('spaces', { where, orderBy: [['memberCount', 'desc'], ['createdAt', 'asc']], limit: 60 });
  return spaceViews(app, me, spaces);
}

export async function spaceBySlug(app: App, slug: string): Promise<SpaceRow> {
  const space = await app.store.findOne('spaces', { slug: String(slug).toLowerCase() });
  if (!space) throw notFound('No such space.');
  return space;
}

export interface SpaceDetail {
  space: SpaceView;
  members: UserSummary[];
  plans: PlanView[];
  canSeeInside: boolean;
}

export async function getSpace(app: App, me: UserRow | null, slug: string): Promise<SpaceDetail> {
  const space = await spaceBySlug(app, slug);
  const [view] = await spaceViews(app, me, [space]);
  const canSeeInside = space.visibility === 'public' || view.myRole !== null;
  if (!canSeeInside) return { space: view, members: [], plans: [], canSeeInside };
  const memberRows = await app.store.find('spaceMembers', { where: { spaceId: space.id }, orderBy: [['createdAt', 'asc']], limit: 24 });
  const users = await app.store.find('users', { where: { id: { in: memberRows.map((m) => m.userId) }, status: 'active' } });
  const plans = (await listPlans(app, me, { scope: 'upcoming' })).filter((p) => p.space?.slug === space.slug);
  return { space: view, members: users.map(userSummary), plans, canSeeInside };
}

export async function createSpace(app: App, me: UserRow, input: Record<string, unknown>): Promise<SpaceView> {
  assertCanAct(app, me);
  const name = str(input.name, 'Name', { required: true, min: 3, max: 50 });
  const base = slugify(name);
  let slug = base;
  for (let n = 2; await app.store.findOne('spaces', { slug }); n++) slug = `${base}-${n}`;
  const rules = Array.isArray(input.rules)
    ? input.rules.slice(0, 10).map((r) => str(r, 'Rule', { max: 120 })).filter(Boolean)
    : ['Be kind. Disagree with ideas, not people.', 'No spam or self-promotion without asking.'];
  const space: SpaceRow = {
    id: newId(),
    slug,
    name,
    description: str(input.description, 'Description', { max: 500 }),
    emoji: str(input.emoji, 'Emoji', { max: 8 }) || '🌿',
    hue: int(input.hue, 'Colour', { min: 0, max: 359, fallback: Math.floor(Math.random() * 360) }),
    visibility: oneOf(input.visibility, 'Visibility', ['public', 'private'] as const, 'public'),
    ownerId: me.id,
    rules,
    topics: strList(input.topics, 'Topics', { maxItems: 5, maxLength: 30 }),
    location: str(input.location, 'Location', { max: 80 }),
    memberCount: 1,
    createdAt: app.now(),
  };
  await app.store.insert('spaces', space);
  await app.store.insert('spaceMembers', { id: `sm_${space.id}_${me.id}`, spaceId: space.id, userId: me.id, role: 'owner', createdAt: app.now() });
  return (await spaceViews(app, me, [space]))[0];
}

export async function joinSpace(app: App, me: UserRow, slug: string): Promise<void> {
  assertCanAct(app, me);
  const space = await spaceBySlug(app, slug);
  if (space.visibility === 'private') throw forbidden('This space is private. Ask one of its moderators to add you.');
  const id = `sm_${space.id}_${me.id}`;
  if (await app.store.get('spaceMembers', id)) return;
  await app.store.insert('spaceMembers', { id, spaceId: space.id, userId: me.id, role: 'member', createdAt: app.now() });
  await app.store.increment('spaces', space.id, 'memberCount', 1);
  await notify(app, { userId: space.ownerId, actorId: me.id, type: 'space_join', spaceId: space.id, text: `${me.name} joined ${space.name}` });
}

export async function leaveSpace(app: App, me: UserRow, slug: string): Promise<void> {
  const space = await spaceBySlug(app, slug);
  if (space.ownerId === me.id) throw badRequest('Owners cannot leave their own space.');
  const removed = await app.store.delete('spaceMembers', { id: `sm_${space.id}_${me.id}` });
  if (removed) await app.store.increment('spaces', space.id, 'memberCount', -1);
}

async function assertModerator(app: App, me: UserRow, space: SpaceRow): Promise<void> {
  const membership = await app.store.get('spaceMembers', `sm_${space.id}_${me.id}`);
  if (!membership || membership.role === 'member') throw forbidden('Only moderators can do that.');
}

export async function addSpaceMember(app: App, me: UserRow, slug: string, handle: string): Promise<void> {
  const space = await spaceBySlug(app, slug);
  await assertModerator(app, me, space);
  const user = await userByHandle(app, handle);
  const id = `sm_${space.id}_${user.id}`;
  if (await app.store.get('spaceMembers', id)) return;
  await app.store.insert('spaceMembers', { id, spaceId: space.id, userId: user.id, role: 'member', createdAt: app.now() });
  await app.store.increment('spaces', space.id, 'memberCount', 1);
  await notify(app, { userId: user.id, actorId: me.id, type: 'space_join', spaceId: space.id, text: `${me.name} added you to ${space.name}. You can leave any time.` });
}

export async function updateSpace(app: App, me: UserRow, slug: string, input: Record<string, unknown>): Promise<SpaceView> {
  const space = await spaceBySlug(app, slug);
  await assertModerator(app, me, space);
  const patch: Partial<SpaceRow> = {};
  if (input.description !== undefined) patch.description = str(input.description, 'Description', { max: 500 });
  if (input.emoji !== undefined) patch.emoji = str(input.emoji, 'Emoji', { max: 8 }) || space.emoji;
  if (Array.isArray(input.rules)) patch.rules = input.rules.slice(0, 10).map((r) => str(r, 'Rule', { max: 120 })).filter(Boolean);
  await app.store.update('spaces', { id: space.id }, patch);
  return (await spaceViews(app, me, [{ ...space, ...patch }]))[0];
}

export async function spacePosts(app: App, me: UserRow | null, slug: string, before?: number): Promise<{ items: PostView[]; nextCursor: string | null }> {
  const space = await spaceBySlug(app, slug);
  const ctx = await viewerContext(app, me);
  if (space.visibility === 'private' && !ctx.spaces.has(space.id)) throw forbidden('This space is private.');
  const rows = await app.store.find('posts', {
    where: { spaceId: space.id, status: 'visible', ...(before ? { createdAt: { lt: before } } : {}) },
    orderBy: [['createdAt', 'desc']],
    limit: 20,
  });
  const authors = new Map((await app.store.find('users', { where: { id: { in: rows.map((r) => r.authorId) } } })).map((u) => [u.id, u]));
  const visible = rows.filter((p) => authors.has(p.authorId) && canViewPost(p, authors.get(p.authorId)!, ctx));
  return {
    items: await hydratePosts(app, me, ctx, visible),
    nextCursor: rows.length === 20 ? String(rows[rows.length - 1].createdAt) : null,
  };
}

// ---- Plans -----------------------------------------------------------------

export function canSeePlan(plan: PlanRow, host: UserRow, ctx: ViewerContext, viewer: UserRow | null, now: number): boolean {
  if (viewer?.id === plan.hostId) return true;
  if (host.status !== 'active' || ctx.blocked.has(plan.hostId)) return false;
  switch (plan.audience) {
    case 'public':
      // Teens only see public plans from people they follow.
      if (viewer && isTeen(viewer.birthDate, now) && !ctx.following.has(plan.hostId)) return false;
      return true;
    case 'friends':
      return isFriend(ctx, plan.hostId);
    case 'circle':
      return plan.circleId !== null && ctx.inCircles.has(plan.circleId);
    case 'space':
      return plan.spaceId !== null && (ctx.spaces.has(plan.spaceId) || ctx.publicSpaces.has(plan.spaceId));
  }
}

export async function planViews(app: App, me: UserRow | null, ctx: ViewerContext, plans: PlanRow[]): Promise<PlanView[]> {
  if (plans.length === 0) return [];
  const ids = plans.map((p) => p.id);
  const [hosts, circles, spaces, myRsvps, going] = await Promise.all([
    app.store.find('users', { where: { id: { in: [...new Set(plans.map((p) => p.hostId))] } } }),
    app.store.find('circles', { where: { id: { in: plans.map((p) => p.circleId).filter((x): x is string => Boolean(x)) } } }),
    app.store.find('spaces', { where: { id: { in: plans.map((p) => p.spaceId).filter((x): x is string => Boolean(x)) } } }),
    me ? app.store.find('rsvps', { where: { planId: { in: ids }, userId: me.id } }) : [],
    app.store.find('rsvps', { where: { planId: { in: ids }, status: 'going', userId: { in: [...ctx.following] } } }),
  ]);
  const friendUsers = new Map(
    (await app.store.find('users', { where: { id: { in: [...new Set(going.map((g) => g.userId))] }, status: 'active' } })).map((u) => [u.id, u]),
  );
  const hostMap = new Map(hosts.map((u) => [u.id, u]));
  const circleMap = new Map(circles.map((c) => [c.id, c]));
  const spaceMap = new Map(spaces.map((s) => [s.id, s]));
  const rsvpMap = new Map(myRsvps.map((r) => [r.planId, r.status]));
  return plans.flatMap((p) => {
    const host = hostMap.get(p.hostId);
    if (!host) return [];
    const circle = p.circleId ? circleMap.get(p.circleId) : undefined;
    const space = p.spaceId ? spaceMap.get(p.spaceId) : undefined;
    return [
      {
        id: p.id,
        title: p.title,
        description: p.description,
        startsAt: p.startsAt,
        endsAt: p.endsAt,
        location: p.location,
        audience: p.audience,
        // Circle names are the host's private labels; only the host sees them.
        circle: circle && me?.id === p.hostId ? { id: circle.id, name: circle.name } : null,
        space: space ? { slug: space.slug, name: space.name } : null,
        capacity: p.capacity,
        hue: p.hue,
        emoji: p.emoji,
        goingCount: p.goingCount,
        host: userSummary(host),
        myRsvp: rsvpMap.get(p.id) ?? null,
        friendsGoing: going
          .filter((g) => g.planId === p.id)
          .map((g) => friendUsers.get(g.userId))
          .filter((u): u is UserRow => Boolean(u))
          .slice(0, 4)
          .map(userSummary),
        cancelled: p.status === 'cancelled',
        isHost: me?.id === p.hostId,
      },
    ];
  });
}

export async function listPlans(app: App, me: UserRow | null, opts: { scope: 'upcoming' | 'mine' | 'past' }): Promise<PlanView[]> {
  const now = app.now();
  const ctx = await viewerContext(app, me);
  let rows: PlanRow[];
  if (opts.scope === 'upcoming') {
    rows = await app.store.find('plans', { where: { status: 'active', startsAt: { gte: now - 3 * HOUR } }, orderBy: [['startsAt', 'asc']], limit: 300 });
  } else {
    if (!me) return [];
    const mine = await app.store.find('rsvps', { where: { userId: me.id, status: { in: ['going', 'maybe'] } } });
    rows = await app.store.find('plans', {
      where: { $or: [{ hostId: me.id }, { id: { in: mine.map((r) => r.planId) } }], ...(opts.scope === 'past' ? { startsAt: { lt: now } } : {}) },
      orderBy: [['startsAt', opts.scope === 'past' ? 'desc' : 'asc']],
      limit: 100,
    });
  }
  const hosts = new Map((await app.store.find('users', { where: { id: { in: [...new Set(rows.map((r) => r.hostId))] } } })).map((u) => [u.id, u]));
  const visible = rows.filter((p) => hosts.has(p.hostId) && canSeePlan(p, hosts.get(p.hostId)!, ctx, me, now)).slice(0, 60);
  return planViews(app, me, ctx, visible);
}

export interface PlanDetail {
  plan: PlanView;
  going: UserSummary[];
  maybe: UserSummary[];
  memories: PostView[];
}

async function visiblePlan(app: App, me: UserRow | null, id: string): Promise<{ plan: PlanRow; ctx: ViewerContext }> {
  const plan = await app.store.get('plans', id);
  if (!plan) throw notFound('No such plan.');
  const host = await app.store.get('users', plan.hostId);
  const ctx = await viewerContext(app, me);
  if (!host || !canSeePlan(plan, host, ctx, me, app.now())) throw notFound('No such plan.');
  return { plan, ctx };
}

export async function getPlan(app: App, me: UserRow | null, id: string): Promise<PlanDetail> {
  const { plan, ctx } = await visiblePlan(app, me, id);
  const rsvps = await app.store.find('rsvps', { where: { planId: id, status: { in: ['going', 'maybe'] } }, orderBy: [['createdAt', 'asc']] });
  const users = new Map(
    (await app.store.find('users', { where: { id: { in: rsvps.map((r) => r.userId) }, status: 'active' } })).map((u) => [u.id, u]),
  );
  const pick = (status: 'going' | 'maybe') =>
    rsvps.filter((r) => r.status === status && !ctx.blocked.has(r.userId)).map((r) => users.get(r.userId)).filter((u): u is UserRow => Boolean(u)).map(userSummary);
  const memoryRows = await app.store.find('posts', { where: { planId: id, status: 'visible' }, orderBy: [['createdAt', 'desc']], limit: 30 });
  const authors = new Map((await app.store.find('users', { where: { id: { in: memoryRows.map((m) => m.authorId) } } })).map((u) => [u.id, u]));
  const memories = memoryRows.filter((p) => authors.has(p.authorId) && canViewPost(p, authors.get(p.authorId)!, ctx));
  return {
    plan: (await planViews(app, me, ctx, [plan]))[0],
    going: pick('going'),
    maybe: pick('maybe'),
    memories: await hydratePosts(app, me, ctx, memories),
  };
}

export async function createPlan(app: App, me: UserRow, input: Record<string, unknown>): Promise<PlanView> {
  assertCanAct(app, me);
  const now = app.now();
  const startsAt = Number(input.startsAt);
  if (!Number.isFinite(startsAt) || startsAt < now - 5 * 60_000 || startsAt > now + 365 * DAY) {
    throw badRequest('Pick a start time within the next year.', { field: 'startsAt' });
  }
  const endsAt = input.endsAt === undefined || input.endsAt === null || input.endsAt === '' ? null : Number(input.endsAt);
  if (endsAt !== null && (!Number.isFinite(endsAt) || endsAt <= startsAt)) throw badRequest('The end must be after the start.', { field: 'endsAt' });
  const teen = isTeen(me.birthDate, now);
  const audience = oneOf(input.audience, 'Who is invited', ['public', 'friends', 'circle', 'space'] as const, 'friends');
  if (teen && audience === 'public') throw badRequest('For your safety, plans from teen accounts are for friends, circles or spaces.');
  let circleId: ID | null = null;
  let spaceId: ID | null = null;
  if (audience === 'circle') {
    const circle = typeof input.circleId === 'string' ? await app.store.get('circles', input.circleId) : undefined;
    if (!circle || circle.ownerId !== me.id) throw badRequest('Choose one of your circles.');
    circleId = circle.id;
  }
  if (audience === 'space') {
    const space = typeof input.spaceId === 'string' ? await app.store.get('spaces', input.spaceId) : undefined;
    if (!space || !(await app.store.get('spaceMembers', `sm_${space.id}_${me.id}`))) throw badRequest('Choose a space you are in.');
    spaceId = space.id;
  }
  const capacity = input.capacity === undefined || input.capacity === null || input.capacity === '' ? null : int(input.capacity, 'Capacity', { min: 2, max: 10_000 });
  const plan: PlanRow = {
    id: newId(),
    hostId: me.id,
    title: str(input.title, 'Title', { required: true, min: 3, max: 80 }),
    description: str(input.description, 'Description', { max: 1000 }),
    startsAt,
    endsAt,
    location: str(input.location, 'Location', { max: 120 }),
    audience,
    circleId,
    spaceId,
    capacity,
    hue: int(input.hue, 'Colour', { min: 0, max: 359, fallback: Math.floor(Math.random() * 360) }),
    emoji: str(input.emoji, 'Emoji', { max: 8 }) || '📅',
    goingCount: 1,
    status: 'active',
    createdAt: now,
  };
  await app.store.insert('plans', plan);
  await app.store.insert('rsvps', { id: `rsvp_${plan.id}_${me.id}`, planId: plan.id, userId: me.id, status: 'going', createdAt: now });
  if (circleId) {
    const members = await app.store.find('circleMembers', { where: { circleId } });
    for (const m of members) {
      await notify(app, { userId: m.userId, actorId: me.id, type: 'plan_invite', planId: plan.id, text: `${me.name} invited you: ${plan.title}` });
    }
  }
  const ctx = await viewerContext(app, me);
  return (await planViews(app, me, ctx, [plan]))[0];
}

export async function rsvp(app: App, me: UserRow, id: string, status: unknown): Promise<PlanView> {
  assertCanAct(app, me);
  const answer = oneOf(status, 'RSVP', ['going', 'maybe', 'no'] as const);
  const { plan, ctx } = await visiblePlan(app, me, id);
  if (plan.status === 'cancelled') throw badRequest('This plan was cancelled.');
  if (plan.startsAt < app.now() - 3 * HOUR) throw badRequest('This plan already happened.');
  if (plan.hostId === me.id && answer !== 'going') throw badRequest('Hosts are always going. Cancel the plan instead.');
  const rsvpId = `rsvp_${plan.id}_${me.id}`;
  const previous = await app.store.get('rsvps', rsvpId);
  if (answer === 'going' && previous?.status !== 'going' && plan.capacity !== null && plan.goingCount >= plan.capacity) {
    throw badRequest('This plan is full.');
  }
  await app.store.upsert('rsvps', { id: rsvpId, planId: plan.id, userId: me.id, status: answer, createdAt: app.now() });
  const delta = (answer === 'going' ? 1 : 0) - (previous?.status === 'going' ? 1 : 0);
  if (delta) await app.store.increment('plans', plan.id, 'goingCount', delta);
  if (answer !== 'no' && previous?.status !== answer) {
    await notify(app, {
      userId: plan.hostId,
      actorId: me.id,
      type: 'plan_rsvp',
      planId: plan.id,
      text: `${me.name} ${answer === 'going' ? 'is going to' : 'might come to'} ${plan.title}`,
    });
  }
  const updated = (await app.store.get('plans', plan.id))!;
  return (await planViews(app, me, ctx, [updated]))[0];
}

export async function cancelPlan(app: App, me: UserRow, id: string): Promise<void> {
  const plan = await app.store.get('plans', id);
  if (!plan || plan.hostId !== me.id) throw notFound('No such plan.');
  await app.store.update('plans', { id }, { status: 'cancelled' });
  const attendees = await app.store.find('rsvps', { where: { planId: id, status: { in: ['going', 'maybe'] } } });
  for (const a of attendees) {
    await notify(app, { userId: a.userId, actorId: me.id, type: 'plan_invite', planId: id, urgent: true, text: `${plan.title} was cancelled by ${me.name}` });
  }
}
