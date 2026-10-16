// End-to-end tests through the real router, on both storage adapters.

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createApp, type App } from '../src/services/app.ts';
import { createApi, type Api } from '../src/api/routes.ts';
import { MemoryStore } from '../src/store/memory.ts';
import { SqliteStore } from '../src/store/sqlite.ts';
import type { Store } from '../src/store/store.ts';

const START = Date.UTC(2026, 9, 16, 12, 0, 0);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

interface Harness {
  app: App;
  api: Api;
  clock: { now: number };
  call(token: string | null, method: string, path: string, body?: unknown, raw?: Uint8Array): Promise<{ status: number; body: any; session?: string | null }>;
  signup(handle: string, extra?: Record<string, unknown>): Promise<{ token: string; id: string }>;
  makeAdmin(id: string): Promise<void>;
}

function harness(store: Store): Harness {
  const clock = { now: START };
  const app = createApp({ store, media: { save: async (_b, _m, id) => `/media/${id}` }, now: () => clock.now, passwordIterations: 1000, simulated: true, log: () => {} });
  const api = createApi(app);
  const call: Harness['call'] = async (token, method, path, body, raw) => {
    const url = new URL(path, 'http://zemvii.test');
    return api({ method, path: url.pathname, query: url.searchParams, body, raw, token, userAgent: 'test' }) as any;
  };
  return {
    app,
    api,
    clock,
    call,
    async signup(handle, extra = {}) {
      const res = await call(null, 'POST', '/api/auth/signup', {
        name: handle[0].toUpperCase() + handle.slice(1), handle, email: `${handle}@example.com`, password: 'correct horse battery', birthDate: '1995-04-02', ...extra,
      });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      return { token: res.session as string, id: res.body.me.id };
    },
    async makeAdmin(id) {
      await store.update('users', { id }, { role: 'admin' });
    },
  };
}

const ok = (res: { status: number; body: any }) => {
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body;
};

const adapters: Array<[string, () => Store]> = [
  ['memory', () => new MemoryStore()],
  ['sqlite', () => new SqliteStore(':memory:')],
];

for (const [name, makeStore] of adapters) {
  describe(`API (${name})`, () => {
    let h: Harness;
    beforeEach(() => {
      h = harness(makeStore());
    });

    it('signs up, validates input, logs in and out', async () => {
      const weak = await h.call(null, 'POST', '/api/auth/signup', { name: 'A', handle: 'abc', email: 'a@b.co', password: 'short', birthDate: '1990-01-01' });
      assert.equal(weak.status, 400);
      const young = await h.call(null, 'POST', '/api/auth/signup', { name: 'A', handle: 'kid', email: 'k@b.co', password: 'long enough pass', birthDate: '2016-01-01' });
      assert.match(young.body.error.message, /at least 13/);
      const reserved = await h.call(null, 'POST', '/api/auth/signup', { name: 'A', handle: 'admin', email: 'x@b.co', password: 'long enough pass', birthDate: '1990-01-01' });
      assert.match(reserved.body.error.message, /reserved/);

      const maya = await h.signup('maya');
      const dupe = await h.call(null, 'POST', '/api/auth/signup', { name: 'M', handle: 'maya', email: 'other@b.co', password: 'long enough pass', birthDate: '1990-01-01' });
      assert.equal(dupe.status, 409);
      const me = ok(await h.call(maya.token, 'GET', '/api/me'));
      assert.equal(me.me.handle, 'maya');
      assert.equal(me.me.passwordHash, undefined);
      assert.equal(me.counts.notifications, 1); // the welcome note

      assert.equal((await h.call(null, 'POST', '/api/auth/login', { identifier: 'maya', password: 'nope nope nope' })).status, 401);
      const login = await h.call(null, 'POST', '/api/auth/login', { identifier: 'MAYA@example.com', password: 'correct horse battery' });
      assert.equal(login.status, 200);
      const logout = await h.call(login.session as string, 'POST', '/api/auth/logout');
      assert.equal(logout.session, null);
      assert.equal((await h.call(login.session as string, 'GET', '/api/me')).status, 401);
    });

    it('enforces every post audience', async () => {
      const maya = await h.signup('maya');
      const leo = await h.signup('leo');
      const sam = await h.signup('sam');
      ok(await h.call(leo.token, 'POST', '/api/users/maya/follow'));
      const circles = ok(await h.call(maya.token, 'GET', '/api/circles')).items;
      const close = circles.find((c: any) => c.name === 'Close friends');
      ok(await h.call(maya.token, 'POST', `/api/circles/${close.id}/members`, { add: [sam.id] }));

      const post = async (audience: string, extra = {}) =>
        ok(await h.call(maya.token, 'POST', '/api/posts', { text: `for ${audience}`, origin: 'human', audience, ...extra })).id;
      const ids = {
        public: await post('public'),
        followers: await post('followers'),
        friends: await post('friends'),
        circle: await post('circle', { circleId: close.id }),
        private: await post('private'),
      };
      const sees = async (token: string, id: string) => (await h.call(token, 'GET', `/api/posts/${id}`)).status === 200;
      assert.deepEqual(
        await Promise.all(Object.values(ids).map((id) => sees(leo.token, id))),
        [true, true, false, false, false],
      );
      assert.deepEqual(
        await Promise.all(Object.values(ids).map((id) => sees(sam.token, id))),
        [true, false, false, true, false],
      );
      ok(await h.call(maya.token, 'POST', '/api/users/leo/follow'));
      assert.equal(await sees(leo.token, ids.friends), true);
      assert.equal((await h.call(null, 'GET', `/api/posts/${ids.public}`)).status, 200);
      assert.equal((await h.call(null, 'GET', `/api/posts/${ids.followers}`)).status, 404);
    });

    it('nudges hurtful words, blocks threats, lets confirmed posts through', async () => {
      const maya = await h.signup('maya');
      const leo = await h.signup('leo');
      const p = ok(await h.call(maya.token, 'POST', '/api/posts', { text: 'New trail map is up #hiking', origin: 'human', audience: 'public' }));
      const nudge = await h.call(leo.token, 'POST', `/api/posts/${p.id}/comments`, { text: "you're an idiot" });
      assert.equal(nudge.status, 409);
      assert.equal(nudge.body.error.details.tone.level, 'hurtful');
      const threat = await h.call(leo.token, 'POST', `/api/posts/${p.id}/comments`, { text: 'i will find you', confirmTone: true });
      assert.equal(threat.status, 422);
      ok(await h.call(leo.token, 'POST', `/api/posts/${p.id}/comments`, { text: "you're an idiot", confirmTone: true }));
      ok(await h.call(leo.token, 'POST', `/api/posts/${p.id}/comments`, { text: 'Gorgeous route, thanks for sharing!' }));
      const comments = ok(await h.call(maya.token, 'GET', `/api/posts/${p.id}/comments`));
      assert.equal(comments.items.length, 2);
    });

    it('keeps reaction counts private to the author and shows friends who reacted', async () => {
      const maya = await h.signup('maya');
      const leo = await h.signup('leo');
      const sam = await h.signup('sam');
      ok(await h.call(sam.token, 'POST', '/api/users/leo/follow'));
      const p = ok(await h.call(maya.token, 'POST', '/api/posts', { text: 'Sunset', origin: 'human', audience: 'public' }));
      ok(await h.call(leo.token, 'POST', `/api/posts/${p.id}/react`, { type: 'love' }));
      ok(await h.call(leo.token, 'POST', `/api/posts/${p.id}/react`, { type: 'wow' })); // changing a reaction doesn't double count
      const forSam = ok(await h.call(sam.token, 'GET', `/api/posts/${p.id}`));
      assert.equal(forSam.reactions, null);
      assert.equal(forSam.reactionTotal, null);
      assert.deepEqual(forSam.reactedBy.map((u: any) => u.handle), ['leo']);
      const forMaya = ok(await h.call(maya.token, 'GET', `/api/posts/${p.id}`));
      assert.deepEqual(forMaya.reactions, { wow: 1 });
      assert.equal(forMaya.reactionTotal, 1);
    });

    it('runs the Friends feed to a finish line and explains the Mix feed', async () => {
      const maya = await h.signup('maya', { birthDate: '1990-01-01' });
      const leo = await h.signup('leo');
      const stranger = await h.signup('stranger');
      ok(await h.call(maya.token, 'PATCH', '/api/me', { topics: ['hiking'] }));
      ok(await h.call(maya.token, 'POST', '/api/users/leo/follow'));
      for (let i = 0; i < 3; i++) {
        h.clock.now += 60_000;
        ok(await h.call(leo.token, 'POST', '/api/posts', { text: `Leo post ${i}`, origin: 'human', audience: 'followers' }));
      }
      h.clock.now += 60_000;
      ok(await h.call(stranger.token, 'POST', '/api/posts', { text: 'Ridge walk #hiking', origin: 'human', audience: 'public' }));
      ok(await h.call(stranger.token, 'POST', '/api/posts', { text: 'Made with a generator #hiking', origin: 'ai_generated', audience: 'public' }));

      const friends = ok(await h.call(maya.token, 'GET', '/api/feed/friends'));
      assert.deepEqual(friends.items.map((p: any) => p.text), ['Leo post 2', 'Leo post 1', 'Leo post 0']);
      assert.equal(friends.end, true);
      assert.equal(friends.newCount, 3);
      ok(await h.call(maya.token, 'POST', '/api/feed/friends/seen', { until: friends.items[0].createdAt }));
      assert.equal(ok(await h.call(maya.token, 'GET', '/api/feed/friends')).newCount, 0);

      const mix = ok(await h.call(maya.token, 'GET', '/api/feed/mix'));
      assert.equal(mix.items.length, 5);
      const ridge = mix.items.find((p: any) => p.text.startsWith('Ridge'));
      assert.match(ridge.why[0].text, /#hiking/);
      const why = ok(await h.call(maya.token, 'GET', `/api/posts/${ridge.id}/why`));
      assert.equal(why.shown, true);
      assert.ok(why.breakdown.interests > 0);

      ok(await h.call(maya.token, 'PATCH', '/api/me/settings', { feed: { preset: 'people', ai: 'hide' } }));
      const people = ok(await h.call(maya.token, 'GET', '/api/feed/mix'));
      assert.deepEqual(people.items.map((p: any) => p.author.handle), ['leo', 'leo', 'leo']);
      assert.equal(people.end, true);
      const whyHidden = ok(await h.call(maya.token, 'GET', `/api/posts/${ridge.id}/why`));
      assert.match(whyHidden.excludedBecause, /people you follow only/);
    });

    it('protects teens by default', async () => {
      const adult = await h.signup('adult');
      const teen = await h.signup('teenager', { birthDate: '2011-03-01' });
      const teenMe = ok(await h.call(teen.token, 'GET', '/api/me')).me;
      assert.equal(teenMe.teen, true);
      assert.equal(teenMe.settings.privacy.privateAccount, true);
      // Under 16: the account cannot be made public; tips cannot be switched on.
      const s = ok(await h.call(teen.token, 'PATCH', '/api/me/settings', { privacy: { privateAccount: false }, creator: { tipsEnabled: true }, wellbeing: { quietHours: false } })).me.settings;
      assert.equal(s.privacy.privateAccount, true);
      assert.equal(s.creator.tipsEnabled, false);
      assert.equal(s.wellbeing.quietHours, true);
      // Adults need approval to follow, can't message, can't find them in search.
      assert.equal(ok(await h.call(adult.token, 'POST', '/api/users/teenager/follow')).status, 'pending');
      const dm = await h.call(adult.token, 'POST', '/api/conversations', { handles: ['teenager'] });
      assert.equal(dm.status, 403);
      assert.equal(ok(await h.call(adult.token, 'GET', '/api/search?q=teen')).people.length, 0);
      // No public meetups from teen accounts, no payments.
      const plan = await h.call(teen.token, 'POST', '/api/plans', { title: 'Skate park', startsAt: START + 86_400_000, audience: 'public' });
      assert.equal(plan.status, 400);
      assert.equal((await h.call(teen.token, 'POST', '/api/wallet/topup', { amountCents: 500 })).status, 403);
    });

    it('blocks cut every connection', async () => {
      const maya = await h.signup('maya');
      const troll = await h.signup('troll');
      ok(await h.call(troll.token, 'POST', '/api/users/maya/follow'));
      const p = ok(await h.call(maya.token, 'POST', '/api/posts', { text: 'Public post', origin: 'human', audience: 'public' }));
      ok(await h.call(maya.token, 'POST', '/api/users/troll/block'));
      assert.equal((await h.call(troll.token, 'GET', '/api/users/maya')).status, 404);
      assert.equal((await h.call(troll.token, 'GET', `/api/posts/${p.id}`)).status, 404);
      assert.equal((await h.call(troll.token, 'POST', '/api/conversations', { handles: ['maya'] })).status, 403);
      assert.equal((await h.call(troll.token, 'POST', '/api/users/maya/follow')).status, 403);
      const profile = ok(await h.call(maya.token, 'GET', '/api/users/troll'));
      assert.equal(profile.relationship.blocked, true);
      assert.equal(profile.relationship.followsYou, false);
    });

    it('routes messages from strangers to requests and counts unread', async () => {
      const maya = await h.signup('maya');
      const leo = await h.signup('leo');
      const chat = ok(await h.call(leo.token, 'POST', '/api/conversations', { handles: ['maya'] }));
      ok(await h.call(leo.token, 'POST', `/api/conversations/${chat.id}/messages`, { text: 'Hi Maya! Loved your trail post.' }));
      let list = ok(await h.call(maya.token, 'GET', '/api/conversations')).items;
      assert.equal(list[0].accepted, false);
      assert.equal(ok(await h.call(maya.token, 'GET', '/api/me')).counts.messages, 0); // requests don't badge
      ok(await h.call(maya.token, 'POST', `/api/conversations/${chat.id}/request`, { accept: true }));
      assert.equal(ok(await h.call(maya.token, 'GET', '/api/me')).counts.messages, 1);
      ok(await h.call(maya.token, 'POST', `/api/conversations/${chat.id}/read`));
      list = ok(await h.call(maya.token, 'GET', '/api/conversations')).items;
      assert.equal(list[0].unread, 0);
      const same = ok(await h.call(maya.token, 'POST', '/api/conversations', { handles: ['leo'] }));
      assert.equal(same.id, chat.id);
    });

    it('runs spaces and plans with capacity and memories', async () => {
      const maya = await h.signup('maya');
      const leo = await h.signup('leo');
      const sam = await h.signup('sam');
      const space = ok(await h.call(maya.token, 'POST', '/api/spaces', { name: 'Lisbon Trail Club', topics: ['hiking'] }));
      assert.equal(space.slug, 'lisbon-trail-club');
      ok(await h.call(leo.token, 'POST', '/api/spaces/lisbon-trail-club/join'));
      ok(await h.call(leo.token, 'POST', '/api/posts', { text: 'Who is in for Sunday?', origin: 'human', spaceId: space.id }));
      assert.equal(ok(await h.call(sam.token, 'GET', '/api/spaces/lisbon-trail-club/posts')).items.length, 1);
      assert.equal(ok(await h.call(sam.token, 'GET', '/api/spaces/lisbon-trail-club')).space.memberCount, 2);

      const plan = ok(await h.call(maya.token, 'POST', '/api/plans', { title: 'Sintra ridge hike', startsAt: START + 2 * 86_400_000, audience: 'space', spaceId: space.id, capacity: 2 }));
      assert.equal(plan.goingCount, 1);
      ok(await h.call(leo.token, 'POST', `/api/plans/${plan.id}/rsvp`, { status: 'going' }));
      const full = await h.call(sam.token, 'POST', `/api/plans/${plan.id}/rsvp`, { status: 'going' });
      assert.match(full.body.error.message, /full/);
      ok(await h.call(leo.token, 'POST', `/api/plans/${plan.id}/rsvp`, { status: 'maybe' }));
      ok(await h.call(sam.token, 'POST', `/api/plans/${plan.id}/rsvp`, { status: 'going' }));
      h.clock.now = START + 3 * 86_400_000;
      const memory = await h.call(leo.token, 'POST', '/api/posts', { text: 'What a day', origin: 'human', audience: 'public', planId: plan.id });
      assert.equal(memory.status, 403); // only people who went
      ok(await h.call(sam.token, 'POST', '/api/posts', { text: 'What a day', origin: 'human', audience: 'public', planId: plan.id }));
      const detail = ok(await h.call(maya.token, 'GET', `/api/plans/${plan.id}`));
      assert.deepEqual(detail.going.map((u: any) => u.handle).sort(), ['maya', 'sam']);
      assert.equal(detail.memories.length, 1);
    });

    it('pays creators 90% and unlocks supporters-only posts', async () => {
      const creator = await h.signup('artist');
      const fan = await h.signup('fan');
      ok(await h.call(creator.token, 'PATCH', '/api/me/settings', { creator: { supportersEnabled: true, supportPriceCents: 400 } }));
      const p = ok(await h.call(creator.token, 'POST', '/api/posts', { text: 'Behind the scenes', origin: 'human', audience: 'supporters' }));
      assert.equal((await h.call(fan.token, 'GET', `/api/posts/${p.id}`)).status, 404);
      const broke = await h.call(fan.token, 'POST', '/api/tips', { handle: 'artist', amountCents: 500 });
      assert.match(broke.body.error.message, /Not enough credits/);
      ok(await h.call(fan.token, 'POST', '/api/wallet/topup', { amountCents: 2000 }));
      const tip = ok(await h.call(fan.token, 'POST', '/api/tips', { handle: 'artist', amountCents: 500, note: 'Thank you!' }));
      assert.deepEqual([tip.grossCents, tip.feeCents, tip.netCents], [500, 50, 450]);
      ok(await h.call(fan.token, 'POST', '/api/users/artist/support'));
      assert.equal((await h.call(fan.token, 'GET', `/api/posts/${p.id}`)).status, 200);
      const wallet = ok(await h.call(fan.token, 'GET', '/api/wallet'));
      assert.equal(wallet.balanceCents, 2000 - 500 - 400);
      const dash = ok(await h.call(creator.token, 'GET', '/api/creator/dashboard'));
      assert.equal(dash.earnedCents, 450 + 360);
      assert.equal(dash.feesCents, 50 + 40);
      assert.equal(dash.supporters, 1);
    });

    it('explains moderation and lets a second moderator overturn on appeal', async () => {
      const author = await h.signup('author');
      const reporter = await h.signup('reporter');
      const mod1 = await h.signup('modone');
      const mod2 = await h.signup('modtwo');
      await h.makeAdmin(mod1.id);
      await h.makeAdmin(mod2.id);
      const p = ok(await h.call(author.token, 'POST', '/api/posts', { text: 'My painting #art', origin: 'human', audience: 'public' }));
      ok(await h.call(reporter.token, 'POST', '/api/reports', { targetType: 'post', targetId: p.id, reason: 'undisclosed_ai' }));
      assert.equal((await h.call(reporter.token, 'GET', '/api/admin/queue')).status, 403);
      const queue = ok(await h.call(mod1.token, 'GET', '/api/admin/queue'));
      assert.equal(queue.reports[0].targetId, p.id);
      ok(await h.call(mod1.token, 'POST', '/api/admin/resolve', { targetType: 'post', targetId: p.id, action: 'remove', explanation: 'This looked AI-generated without a label.' }));
      assert.equal((await h.call(reporter.token, 'GET', `/api/posts/${p.id}`)).status, 404);
      assert.equal(ok(await h.call(author.token, 'GET', `/api/posts/${p.id}`)).status, 'removed');
      const status = ok(await h.call(author.token, 'GET', '/api/me/status'));
      assert.equal(status.standing, 'warned');
      assert.match(status.actions[0].explanation, /without a label/);
      ok(await h.call(author.token, 'POST', `/api/me/appeals/${status.actions[0].id}`, { text: 'I painted this by hand, here is a timelapse.' }));
      assert.equal((await h.call(mod1.token, 'POST', `/api/admin/appeals/${status.actions[0].id}`, { overturn: true })).status, 403);
      ok(await h.call(mod2.token, 'POST', `/api/admin/appeals/${status.actions[0].id}`, { overturn: true }));
      assert.equal((await h.call(reporter.token, 'GET', `/api/posts/${p.id}`)).status, 200);
      const reporterNotes = ok(await h.call(reporter.token, 'GET', '/api/notifications')).items.map((n: any) => n.text).join(' ');
      assert.match(reporterNotes, /took action/);
    });

    it('recovers an account with two recovery friends', async () => {
      const maya = await h.signup('maya');
      const friends = [await h.signup('leo'), await h.signup('sam'), await h.signup('ana')];
      const notFriend = await h.signup('zed');
      for (const f of friends) {
        ok(await h.call(maya.token, 'POST', `/api/users/${f.id === friends[0].id ? 'leo' : f.id === friends[1].id ? 'sam' : 'ana'}/follow`));
      }
      for (const [token] of friends.map((f) => [f.token])) ok(await h.call(token, 'POST', '/api/users/maya/follow'));
      assert.equal((await h.call(maya.token, 'PUT', '/api/me/recovery-friends', { userIds: [notFriend.id] })).status, 400);
      ok(await h.call(maya.token, 'PUT', '/api/me/recovery-friends', { userIds: friends.map((f) => f.id) }));

      const start = ok(await h.call(null, 'POST', '/api/recovery/start', { handle: 'maya' }));
      assert.equal(start.friendsAsked, 3);
      const early = await h.call(null, 'POST', '/api/recovery/complete', { requestId: start.requestId, secret: start.secret, password: 'a brand new password' });
      assert.equal(early.status, 403);
      assert.equal((await h.call(notFriend.token, 'POST', `/api/recovery/requests/${start.requestId}/approve`)).status, 403);
      ok(await h.call(friends[0].token, 'POST', `/api/recovery/requests/${start.requestId}/approve`));
      ok(await h.call(friends[1].token, 'POST', `/api/recovery/requests/${start.requestId}/approve`));
      const wrongSecret = await h.call(null, 'POST', '/api/recovery/status', { requestId: start.requestId, secret: 'guess' });
      assert.equal(wrongSecret.status, 404);
      assert.equal(ok(await h.call(null, 'POST', '/api/recovery/status', { requestId: start.requestId, secret: start.secret })).status, 'approved');
      const done = await h.call(null, 'POST', '/api/recovery/complete', { requestId: start.requestId, secret: start.secret, password: 'a brand new password' });
      assert.equal(done.status, 200);
      assert.equal((await h.call(maya.token, 'GET', '/api/me')).status, 401); // old sessions signed out
      ok(await h.call(null, 'POST', '/api/auth/login', { identifier: 'maya', password: 'a brand new password' }));
    });

    it('holds non-urgent notifications for the digest', async () => {
      const maya = await h.signup('maya');
      const leo = await h.signup('leo');
      const p = ok(await h.call(maya.token, 'POST', '/api/posts', { text: 'Hello', origin: 'human', audience: 'public' }));
      h.clock.now += 60_000;
      ok(await h.call(leo.token, 'POST', `/api/posts/${p.id}/react`, { type: 'love' }));
      let list = ok(await h.call(maya.token, 'GET', '/api/notifications'));
      assert.equal(list.waiting, 1);
      assert.ok(list.nextDigestAt > h.clock.now);
      ok(await h.call(maya.token, 'POST', '/api/notifications/deliver-now'));
      list = ok(await h.call(maya.token, 'GET', '/api/notifications'));
      assert.equal(list.waiting, 0);
      assert.match(list.items[0].text, /Leo reacted/);
      ok(await h.call(maya.token, 'PATCH', '/api/me/settings', { wellbeing: { notifications: 'realtime', quietHours: false } }));
      ok(await h.call(leo.token, 'POST', `/api/posts/${p.id}/comments`, { text: 'So good!' }));
      assert.equal(ok(await h.call(maya.token, 'GET', '/api/notifications')).waiting, 0);
    });

    it('shows community notes once rated helpful by verified humans', async () => {
      const author = await h.signup('author');
      const raters = [await h.signup('ra'.padEnd(3, 'a')), await h.signup('rbb'), await h.signup('rcc'), await h.signup('rdd')];
      const p = ok(await h.call(author.token, 'POST', '/api/posts', { text: 'The moon is made of cheese', origin: 'human', audience: 'public' }));
      assert.equal((await h.call(raters[0].token, 'POST', `/api/posts/${p.id}/notes`, { text: 'The moon is rock; see NASA lunar samples.' })).status, 403);
      ok(await h.call(raters[0].token, 'POST', '/api/me/verify-human'));
      const proposed = ok(await h.call(raters[0].token, 'POST', `/api/posts/${p.id}/notes`, { text: 'The moon is rock; see NASA lunar samples.' }));
      assert.equal(proposed.note.shown, false);
      for (const r of raters.slice(1)) ok(await h.call(r.token, 'POST', `/api/notes/${proposed.note.id}/rate`, { helpful: true }));
      const view = ok(await h.call(author.token, 'GET', `/api/posts/${p.id}`));
      assert.equal(view.note.shown, true);
    });

    it('checks uploads by content, exports and deletes accounts', async () => {
      const maya = await h.signup('maya');
      assert.equal((await h.call(maya.token, 'POST', '/api/media', undefined, new TextEncoder().encode('<script>'))).status, 400);
      const media = ok(await h.call(maya.token, 'POST', '/api/media', undefined, PNG));
      assert.equal(media.mime, 'image/png');
      ok(await h.call(maya.token, 'POST', '/api/posts', { text: 'Photo day', origin: 'human', audience: 'public', media: [{ type: 'image', id: media.id, alt: 'A beach' }] }));
      const exported = ok(await h.call(maya.token, 'GET', '/api/me/export'));
      assert.equal(exported.posts.length, 1);
      assert.equal(exported.account.passwordHash, undefined);
      assert.equal((await h.call(maya.token, 'POST', '/api/me/delete', { password: 'wrong password!' })).status, 403);
      const del = await h.call(maya.token, 'POST', '/api/me/delete', { password: 'correct horse battery' });
      assert.equal(del.status, 200);
      assert.equal((await h.call(null, 'POST', '/api/auth/login', { identifier: 'maya', password: 'correct horse battery' })).status, 401);
      assert.equal((await h.call(null, 'GET', '/api/users/maya')).status, 404);
      await h.signup('maya', { email: 'maya2@example.com' }); // the handle is free again
    });

    it('rejects unknown routes, wrong methods and missing auth cleanly', async () => {
      assert.equal((await h.call(null, 'GET', '/api/nope')).status, 404);
      assert.equal((await h.call(null, 'PUT', '/api/explore')).status, 405);
      assert.equal((await h.call(null, 'GET', '/api/feed/friends')).status, 401);
      assert.equal(ok(await h.call(null, 'GET', '/api/meta')).topics.length > 10, true);
    });
  });
}
