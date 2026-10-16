// Every Zemvii API endpoint, in one place.

import { Router, type ApiRequest, type ApiResponse } from './router.ts';
import type { App } from '../services/app.ts';
import type { UserRow } from '../store/types.ts';
import { ART_SCENES, FEED_PRESETS, MIN_AGE, REACTIONS, TOPICS } from '../core/defaults.ts';
import { INTENTS } from '../core/wellbeing.ts';
import { checkTone } from '../core/tone.ts';
import { MAX_TIP_CENTS, MIN_TIP_CENTS, PLATFORM_FEE_RATE, PLUS_PRICE_CENTS, TIP_PRESETS } from '../core/money.ts';
import * as auth from '../services/auth.ts';
import * as graph from '../services/graph.ts';
import * as users from '../services/users.ts';
import * as posts from '../services/posts.ts';
import * as feed from '../services/feed.ts';
import * as notifications from '../services/notify.ts';
import * as messages from '../services/messages.ts';
import * as community from '../services/community.ts';
import * as creator from '../services/creator.ts';
import * as wellbeing from '../services/wellbeing.ts';
import * as safety from '../services/safety.ts';
import { uploadMedia } from '../services/media.ts';
import { meView, userSummary } from '../services/views.ts';
import { str } from '../services/validate.ts';

const num = (value: string | null): number | undefined => {
  if (value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

export const API_VERSION = '0.1.0';

export function buildRouter(): Router {
  const r = new Router();

  // ---- Meta ----------------------------------------------------------------
  r.get('/api/meta', 'public', async ({ app }) => ({
    version: API_VERSION,
    topics: TOPICS,
    presets: FEED_PRESETS,
    reactions: REACTIONS,
    intents: INTENTS,
    reportReasons: safety.REPORT_REASONS.map((id) => ({ id, label: safety.REASON_LABELS[id] })),
    artScenes: ART_SCENES,
    minAge: Math.max(MIN_AGE, app.minAge),
    simulated: app.simulated,
    money: { feeRate: PLATFORM_FEE_RATE, tipPresets: TIP_PRESETS, minTip: MIN_TIP_CENTS, maxTip: MAX_TIP_CENTS, plusPrice: PLUS_PRICE_CENTS },
  }));
  r.post('/api/tone', 'public', async ({ body }) => checkTone(str(body.text, 'Text', { max: 2200 })));

  // ---- Accounts ------------------------------------------------------------
  r.post('/api/auth/signup', 'public', async ({ app, body, req, setSession }) => {
    const { user, token } = await auth.signup(app, body as unknown as auth.SignupInput, req.userAgent);
    setSession(token);
    return { me: meView(user, app.now()) };
  });
  r.post('/api/auth/login', 'public', async ({ app, body, req, setSession }) => {
    const { user, token } = await auth.login(app, { identifier: body.identifier, password: body.password }, req.userAgent);
    setSession(token);
    return { me: meView(user, app.now()) };
  });
  r.post('/api/auth/logout', 'public', async ({ app, req, setSession }) => {
    await auth.logout(app, req.token);
    setSession(null);
  });

  // Like /api/me, but answers "nobody" instead of 401 when logged out.
  r.get('/api/session', 'public', async ({ app, viewer }) => (viewer ? sessionView(app, viewer) : { me: null, counts: null }));
  r.get('/api/me', 'user', async ({ app, me }) => sessionView(app, me));
  r.patch('/api/me', 'user', async ({ app, me, body }) => ({ me: await users.updateProfile(app, me, body) }));
  r.patch('/api/me/settings', 'user', async ({ app, me, body }) => ({ me: await users.updateSettings(app, me, body) }));
  r.post('/api/me/password', 'user', async ({ app, me, body, req }) => auth.changePassword(app, me, { current: body.current, next: body.next }, req.token));
  r.post('/api/me/verify-human', 'user', async ({ app, me }) => ({ me: await users.verifyHuman(app, me) }));
  r.get('/api/me/export', 'user', async ({ app, me }) => users.exportData(app, me));
  r.post('/api/me/delete', 'user', async ({ app, me, body, setSession }) => {
    await users.deleteAccount(app, me, body.password);
    setSession(null);
  });
  r.get('/api/me/status', 'user', async ({ app, me }) => safety.accountStatus(app, me));
  r.post('/api/me/appeals/:id', 'user', async ({ app, me, params, body }) => safety.appeal(app, me, params.id, body.text));
  r.get('/api/me/saved', 'user', async ({ app, me }) => ({ items: await posts.savedPosts(app, me) }));
  r.get('/api/me/follow-requests', 'user', async ({ app, me }) => ({ items: await graph.followRequests(app, me) }));
  r.post('/api/me/follow-requests/:handle', 'user', async ({ app, me, params, body }) =>
    graph.answerFollowRequest(app, me, params.handle, body.accept === true),
  );
  r.get('/api/me/supporting', 'user', async ({ app, me }) => ({ items: await creator.supporterOf(app, me) }));
  r.get('/api/me/recovery-friends', 'user', async ({ app, me }) => {
    const ctx = await graph.viewerContext(app, me);
    const friendIds = [...ctx.following].filter((id) => ctx.followers.has(id));
    const friends = await app.store.find('users', { where: { id: { in: friendIds }, status: 'active' } });
    return {
      chosen: friends.filter((f) => me.settings.recoveryFriendIds.includes(f.id)).map(userSummary),
      eligible: friends.map(userSummary),
    };
  });
  r.put('/api/me/recovery-friends', 'user', async ({ app, me, body }) => ({ chosen: await auth.setRecoveryFriends(app, me, body.userIds) }));

  // ---- Recovery friends ------------------------------------------------------
  r.post('/api/recovery/start', 'public', async ({ app, body }) => auth.startRecovery(app, { handle: body.handle }));
  r.post('/api/recovery/status', 'public', async ({ app, body }) => auth.recoveryStatus(app, { requestId: body.requestId, secret: body.secret }));
  r.post('/api/recovery/complete', 'public', async ({ app, body, req, setSession }) => {
    const { user, token } = await auth.completeRecovery(app, { requestId: body.requestId, secret: body.secret, password: body.password }, req.userAgent);
    setSession(token);
    return { me: meView(user, app.now()) };
  });
  r.get('/api/recovery/requests', 'user', async ({ app, me }) => ({ items: await auth.pendingRecoveryRequests(app, me) }));
  r.post('/api/recovery/requests/:id/approve', 'user', async ({ app, me, params }) => auth.approveRecovery(app, me, params.id));

  // ---- People ----------------------------------------------------------------
  r.get('/api/users/suggested', 'user', async ({ app, me }) => ({ items: await users.suggestPeople(app, me, 20) }));
  r.get('/api/users/:handle', 'public', async ({ app, viewer, params }) => users.getProfile(app, viewer, params.handle));
  r.get('/api/users/:handle/posts', 'public', async ({ app, viewer, params, query }) => {
    const author = await graph.userByHandle(app, params.handle);
    const kind = query.get('kind') === 'clip' ? 'clip' : query.get('kind') === 'post' ? 'post' : undefined;
    return posts.postsByAuthor(app, viewer, author, { kind, before: num(query.get('before')) });
  });
  r.get('/api/users/:handle/followers', 'public', async ({ app, viewer, params }) => ({ items: await graph.listFollows(app, viewer, params.handle, 'followers') }));
  r.get('/api/users/:handle/following', 'public', async ({ app, viewer, params }) => ({ items: await graph.listFollows(app, viewer, params.handle, 'following') }));
  r.post('/api/users/:handle/follow', 'user', async ({ app, me, params }) => {
    const result = await graph.follow(app, me, params.handle);
    feedChanged(app, me.id);
    return result;
  });
  r.delete('/api/users/:handle/follow', 'user', async ({ app, me, params }) => {
    await graph.unfollow(app, me, params.handle);
    feedChanged(app, me.id);
  });
  r.delete('/api/users/:handle/follower', 'user', async ({ app, me, params }) => graph.removeFollower(app, me, params.handle));
  r.post('/api/users/:handle/block', 'user', async ({ app, me, params }) => {
    await graph.block(app, me, params.handle);
    feedChanged(app, me.id);
  });
  r.delete('/api/users/:handle/block', 'user', async ({ app, me, params }) => graph.unblock(app, me, params.handle));
  r.post('/api/users/:handle/mute', 'user', async ({ app, me, params }) => {
    await graph.mute(app, me, params.handle, true);
    feedChanged(app, me.id);
  });
  r.delete('/api/users/:handle/mute', 'user', async ({ app, me, params }) => {
    await graph.mute(app, me, params.handle, false);
    feedChanged(app, me.id);
  });
  r.post('/api/users/:handle/support', 'user', async ({ app, me, params }) => creator.support(app, me, params.handle));
  r.delete('/api/users/:handle/support', 'user', async ({ app, me, params }) => creator.cancelSupport(app, me, params.handle));

  // ---- Circles -----------------------------------------------------------------
  r.get('/api/circles', 'user', async ({ app, me }) => ({ items: await graph.listCircles(app, me) }));
  r.post('/api/circles', 'user', async ({ app, me, body }) => graph.createCircle(app, me, body));
  r.patch('/api/circles/:id', 'user', async ({ app, me, params, body }) => graph.updateCircle(app, me, params.id, body));
  r.delete('/api/circles/:id', 'user', async ({ app, me, params }) => graph.deleteCircle(app, me, params.id));
  r.post('/api/circles/:id/members', 'user', async ({ app, me, params, body }) => {
    await graph.setCircleMembers(app, me, params.id, body.add, body.remove);
    feedChanged(app, me.id);
  });
  r.post('/api/circles/:id/chat', 'user', async ({ app, me, params }) => messages.chatWithCircle(app, me, params.id));

  // ---- Posts -------------------------------------------------------------------
  r.post('/api/posts', 'user', async ({ app, me, body }) => posts.createPost(app, me, body));
  r.get('/api/posts/:id', 'public', async ({ app, viewer, params }) => posts.getPost(app, viewer, params.id));
  r.patch('/api/posts/:id', 'user', async ({ app, me, params, body }) => posts.updatePost(app, me, params.id, body));
  r.delete('/api/posts/:id', 'user', async ({ app, me, params }) => posts.deletePost(app, me, params.id));
  r.post('/api/posts/:id/react', 'user', async ({ app, me, params, body }) => posts.react(app, me, params.id, body.type));
  r.delete('/api/posts/:id/react', 'user', async ({ app, me, params }) => posts.unreact(app, me, params.id));
  r.post('/api/posts/:id/save', 'user', async ({ app, me, params }) => posts.setSaved(app, me, params.id, true));
  r.delete('/api/posts/:id/save', 'user', async ({ app, me, params }) => posts.setSaved(app, me, params.id, false));
  r.get('/api/posts/:id/comments', 'public', async ({ app, viewer, params }) => posts.listComments(app, viewer, params.id));
  r.post('/api/posts/:id/comments', 'user', async ({ app, me, params, body }) => posts.addComment(app, me, params.id, body));
  r.delete('/api/comments/:id', 'user', async ({ app, me, params }) => posts.deleteComment(app, me, params.id));
  r.get('/api/posts/:id/why', 'user', async ({ app, me, params }) => posts.whyPost(app, me, params.id));
  r.post('/api/posts/:id/notes', 'user', async ({ app, me, params, body }) => posts.proposeNote(app, me, params.id, body));
  r.post('/api/notes/:id/rate', 'user', async ({ app, me, params, body }) => posts.rateNote(app, me, params.id, body.helpful));
  r.post('/api/posts/:id/tip', 'user', async ({ app, me, params, body }) =>
    creator.tip(app, me, { postId: params.id, amountCents: body.amountCents, note: body.note }),
  );

  // ---- Feeds and discovery -------------------------------------------------------
  r.get('/api/feed/friends', 'user', async ({ app, me, query }) => feed.friendsFeed(app, me, { before: num(query.get('before')) }));
  r.post('/api/feed/friends/seen', 'user', async ({ app, me, body }) => feed.markFeedSeen(app, me, body.until));
  r.get('/api/feed/mix', 'user', async ({ app, me, query }) => feed.mixFeed(app, me, { page: num(query.get('page')) }));
  r.get('/api/feed/clips', 'user', async ({ app, me, query }) => feed.clipsSet(app, me, { set: num(query.get('set')) }));
  r.get('/api/explore', 'public', async ({ app, viewer }) => feed.explore(app, viewer));
  r.get('/api/topics/:tag', 'public', async ({ app, viewer, params, query }) => feed.topicPage(app, viewer, params.tag, num(query.get('before'))));
  r.get('/api/search', 'public', async ({ app, viewer, query }) => feed.search(app, viewer, query.get('q') ?? ''));

  // ---- Notifications ---------------------------------------------------------------
  r.get('/api/notifications', 'user', async ({ app, me }) => notifications.listNotifications(app, me));
  r.post('/api/notifications/read', 'user', async ({ app, me, body }) =>
    notifications.markNotificationsRead(app, me, Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string') : 'all'),
  );
  r.post('/api/notifications/deliver-now', 'user', async ({ app, me }) => notifications.deliverNow(app, me));

  // ---- Messages ------------------------------------------------------------------------
  r.get('/api/conversations', 'user', async ({ app, me }) => ({ items: await messages.listConversations(app, me) }));
  r.post('/api/conversations', 'user', async ({ app, me, body }) => messages.startConversation(app, me, body));
  r.get('/api/conversations/:id', 'user', async ({ app, me, params }) => messages.getConversation(app, me, params.id));
  r.get('/api/conversations/:id/messages', 'user', async ({ app, me, params, query }) => ({
    items: await messages.listMessages(app, me, params.id, { after: num(query.get('after')), before: num(query.get('before')) }),
  }));
  r.post('/api/conversations/:id/messages', 'user', async ({ app, me, params, body }) => messages.sendMessage(app, me, params.id, body));
  r.post('/api/conversations/:id/read', 'user', async ({ app, me, params }) => messages.markConversationRead(app, me, params.id));
  r.post('/api/conversations/:id/request', 'user', async ({ app, me, params, body }) => messages.answerRequest(app, me, params.id, body.accept === true));
  r.post('/api/conversations/:id/mute', 'user', async ({ app, me, params, body }) => messages.setConversationMuted(app, me, params.id, body.muted === true));
  r.delete('/api/conversations/:id', 'user', async ({ app, me, params }) => messages.leaveConversation(app, me, params.id));

  // ---- Spaces and plans ------------------------------------------------------------------
  r.get('/api/spaces', 'public', async ({ app, viewer, query }) => ({
    items: await community.listSpaces(app, viewer, { q: query.get('q') ?? undefined, mine: query.get('mine') === '1' }),
  }));
  r.post('/api/spaces', 'user', async ({ app, me, body }) => community.createSpace(app, me, body));
  r.get('/api/spaces/:slug', 'public', async ({ app, viewer, params }) => community.getSpace(app, viewer, params.slug));
  r.patch('/api/spaces/:slug', 'user', async ({ app, me, params, body }) => community.updateSpace(app, me, params.slug, body));
  r.post('/api/spaces/:slug/join', 'user', async ({ app, me, params }) => {
    await community.joinSpace(app, me, params.slug);
    feedChanged(app, me.id);
  });
  r.delete('/api/spaces/:slug/join', 'user', async ({ app, me, params }) => {
    await community.leaveSpace(app, me, params.slug);
    feedChanged(app, me.id);
  });
  r.post('/api/spaces/:slug/members', 'user', async ({ app, me, params, body }) => community.addSpaceMember(app, me, params.slug, String(body.handle ?? '')));
  r.get('/api/spaces/:slug/posts', 'public', async ({ app, viewer, params, query }) => community.spacePosts(app, viewer, params.slug, num(query.get('before'))));

  r.get('/api/plans', 'public', async ({ app, viewer, query }) => {
    const scope = query.get('scope');
    return { items: await community.listPlans(app, viewer, { scope: scope === 'mine' || scope === 'past' ? scope : 'upcoming' }) };
  });
  r.post('/api/plans', 'user', async ({ app, me, body }) => community.createPlan(app, me, body));
  r.get('/api/plans/:id', 'public', async ({ app, viewer, params }) => community.getPlan(app, viewer, params.id));
  r.post('/api/plans/:id/rsvp', 'user', async ({ app, me, params, body }) => community.rsvp(app, me, params.id, body.status));
  r.post('/api/plans/:id/cancel', 'user', async ({ app, me, params }) => community.cancelPlan(app, me, params.id));

  // ---- Creators ------------------------------------------------------------------------------
  r.get('/api/creator/dashboard', 'user', async ({ app, me }) => creator.dashboard(app, me));
  r.get('/api/wallet', 'user', async ({ app, me }) => creator.wallet(app, me));
  r.post('/api/wallet/topup', 'user', async ({ app, me, body }) => creator.topUp(app, me, body.amountCents));
  r.post('/api/tips', 'user', async ({ app, me, body }) => creator.tip(app, me, { handle: body.handle, amountCents: body.amountCents, note: body.note }));
  r.post('/api/plus', 'user', async ({ app, me, body }) => creator.setPlus(app, me, body.active === true));

  // ---- Wellbeing ---------------------------------------------------------------------------------
  r.post('/api/wellbeing/heartbeat', 'user', async ({ app, me, body }) => wellbeing.heartbeat(app, me, body));
  r.post('/api/wellbeing/intent', 'user', async ({ app, me, body }) => wellbeing.recordIntent(app, me, body.intent));
  r.get('/api/wellbeing/summary', 'user', async ({ app, me }) => wellbeing.summary(app, me));

  // ---- Safety ------------------------------------------------------------------------------------
  r.post('/api/reports', 'user', async ({ app, me, body }) => safety.fileReport(app, me, body));
  r.get('/api/admin/queue', 'admin', async ({ app, me }) => safety.moderationQueue(app, me));
  r.post('/api/admin/resolve', 'admin', async ({ app, me, body }) => safety.resolveReports(app, me, body));
  r.post('/api/admin/appeals/:id', 'admin', async ({ app, me, params, body }) => safety.resolveAppeal(app, me, params.id, body.overturn));

  // ---- Media -------------------------------------------------------------------------------------
  r.post('/api/media', 'user', async ({ app, me, req }) => uploadMedia(app, me, req.raw));

  return r;
}

async function sessionView(app: App, me: UserRow) {
  const [unreadNotifications, unreadMessages, followRequests, recovery] = await Promise.all([
    notifications.unreadNotificationCount(app, me),
    messages.unreadMessageCount(app, me),
    app.store.count('follows', { followeeId: me.id, status: 'pending' }),
    auth.pendingRecoveryRequests(app, me),
  ]);
  return {
    me: meView(me, app.now()),
    counts: {
      notifications: unreadNotifications,
      messages: unreadMessages,
      followRequests,
      recoveryRequests: recovery.filter((x) => !x.approvedByMe).length,
    },
  };
}

function feedChanged(app: App, userId: string): void {
  for (const key of [...app.cache.keys()]) if (key.endsWith(`:${userId}`)) app.cache.delete(key);
}

export type Api = (req: ApiRequest) => Promise<ApiResponse>;

export function createApi(app: App): Api {
  const router = buildRouter();
  return (req) => router.handle(app, req);
}
