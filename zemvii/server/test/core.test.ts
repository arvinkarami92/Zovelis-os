import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkTone } from '../src/core/tone.ts';
import { computeInterests, diversify, exclusionReason, rankFeed, scoreCandidate, type Candidate } from '../src/core/feed.ts';
import { defaultFeedDials, defaultSettings } from '../src/core/defaults.ts';
import { budgetStatus, dayKey, deliveryTime, inQuietHours, nextDigestAt, nextLocalTime } from '../src/core/wellbeing.ts';
import { formatMoney, splitPayment } from '../src/core/money.ts';
import { ageOn, isTeen, validateBirthDate } from '../src/core/age.ts';
import { canReply, canViewPost, emptyViewer, type ViewerContext } from '../src/core/visibility.ts';
import { cleanText, containsAnyWord, extractMentions, extractTopics, slugify, validateHandle } from '../src/core/text.ts';
import { noteIsShown } from '../src/core/notes.ts';
import type { FeedDials, PostRow, UserRow } from '../src/store/types.ts';

describe('tone check', () => {
  it('lets ordinary and warm text through', () => {
    for (const text of [
      'Sunset hike with the crew today #hiking',
      'Thank you, this cake is stupid good',
      "You're killing it with these photos!",
      'Ugly sweater party on Friday, who is in?',
      'Taking out the trash and then coffee',
    ]) {
      assert.equal(checkTone(text).level, 'ok', text);
    }
  });

  it('nudges insults aimed at a person, even when disguised', () => {
    for (const text of ["you're so stupid", 'You are an idiot', 'ur a l0000ser', 'shut up nobody asked', 'your take is pathetic']) {
      const result = checkTone(text);
      assert.equal(result.level, 'hurtful', text);
      assert.ok(result.heat >= 0.7);
      assert.ok(result.suggestion);
    }
  });

  it('treats venting about things as heated, not hurtful', () => {
    const result = checkTone('This is OUTRAGEOUS!!! The worst, most ridiculous decision ever');
    assert.equal(result.level, 'heated');
    assert.ok(result.heat >= 0.35 && result.heat < 0.7);
  });

  it('blocks threats and telling people to self-harm', () => {
    for (const text of ["I'm going to kill you", 'i will find you', 'kys', 'Go kill yourself', 'I know where you live']) {
      assert.equal(checkTone(text).level, 'threat', text);
    }
    assert.equal(checkTone("you're dead wrong about that").level, 'ok');
  });

  it('answers self-harm with support instead of a block', () => {
    const result = checkTone("I don't want to be here anymore, I keep thinking about ending my life");
    assert.equal(result.level, 'self_harm');
    assert.match(result.suggestion ?? '', /not alone/);
  });
});

function candidate(id: string, overrides: Partial<Candidate['post']> = {}, relation: Partial<Candidate['relation']> = {}): Candidate {
  return {
    authorHandle: `author_${id}`,
    relation: { self: false, circle: null, friend: false, follows: false, space: null, ...relation },
    post: {
      id, authorId: `a_${id}`, kind: 'post', text: 'hello', createdAt: NOW - 3_600_000, topics: [], origin: 'human', heat: 0,
      reactionCount: 0, commentCount: 0, saveCount: 0, spaceId: null, ...overrides,
    },
  };
}

const NOW = Date.UTC(2026, 9, 16, 12, 0, 0);
const dials = (overrides: Partial<FeedDials> = {}): FeedDials => ({ ...defaultFeedDials(), ...overrides });

describe('feed ranking', () => {
  it('puts people you follow first at low discovery, strangers can win at high discovery', () => {
    const friend = candidate('friend', { topics: [] }, { follows: true });
    const stranger = candidate('stranger', { topics: ['hiking'], reactionCount: 80 });
    const interests = { hiking: 1 };
    const low = rankFeed({ candidates: [stranger, friend], dials: dials({ friendsVsDiscover: 10 }), interests, now: NOW });
    assert.equal(low[0].postId, 'friend');
    const high = rankFeed({ candidates: [stranger, friend], dials: dials({ friendsVsDiscover: 100 }), interests, now: NOW });
    assert.equal(high[0].postId, 'stranger');
  });

  it('shows only people you follow when discovery is at zero', () => {
    const ranked = rankFeed({
      candidates: [candidate('s'), candidate('f', {}, { follows: true }), candidate('sp', {}, { space: 'Trail Club' })],
      dials: dials({ friendsVsDiscover: 0 }), interests: {}, now: NOW,
    });
    assert.deepEqual(ranked.map((r) => r.postId).sort(), ['f', 'sp']);
  });

  it('Fresh↔Popular trades recency for appreciation', () => {
    const fresh = candidate('fresh', { createdAt: NOW - 10 * 60_000 }, { follows: true });
    const popular = candidate('popular', { createdAt: NOW - 20 * 3_600_000, reactionCount: 120, commentCount: 30 }, { follows: true });
    const byFresh = rankFeed({ candidates: [popular, fresh], dials: dials({ freshVsPopular: 0 }), interests: {}, now: NOW });
    const byPopular = rankFeed({ candidates: [popular, fresh], dials: dials({ freshVsPopular: 100 }), interests: {}, now: NOW });
    assert.equal(byFresh[0].postId, 'fresh');
    assert.equal(byPopular[0].postId, 'popular');
  });

  it('the Calm dial sinks heated posts and says so', () => {
    const heated = candidate('heated', { heat: 0.9 }, { follows: true });
    const calm = candidate('calm', { heat: 0, createdAt: NOW - 2 * 3_600_000 }, { follows: true });
    const off = rankFeed({ candidates: [heated, calm], dials: dials({ calm: 0 }), interests: {}, now: NOW });
    const on = rankFeed({ candidates: [heated, calm], dials: dials({ calm: 100 }), interests: {}, now: NOW });
    assert.equal(off[0].postId, 'heated');
    assert.equal(on[0].postId, 'calm');
    assert.ok(on.find((r) => r.postId === 'heated')!.reasons.some((r) => r.kind === 'calm'));
  });

  it('excludes hidden AI, muted topics and muted words with a reason', () => {
    const d = dials({ ai: 'hide', muteTopics: ['politics'], mutedWords: ['spoiler'] });
    assert.match(exclusionReason(candidate('a', { origin: 'ai_generated' }), d) ?? '', /AI-generated/);
    assert.match(exclusionReason(candidate('b', { topics: ['politics'] }), d) ?? '', /muted/);
    assert.match(exclusionReason(candidate('c', { text: 'Big SPOILER ahead' }), d) ?? '', /word/);
    assert.equal(exclusionReason(candidate('d', { origin: 'ai_assisted' }), d), null);
  });

  it('explains every ranking in plain language with a breakdown that sums to 1', () => {
    const ranked = scoreCandidate(candidate('x', { topics: ['hiking'], createdAt: NOW - 20 * 60_000 }, { circle: 'Close friends' }), {
      dials: dials({ boostTopics: ['hiking'] }), interests: {}, now: NOW,
    });
    const kinds = ranked.reasons.map((r) => r.kind);
    assert.deepEqual(kinds, ['circle', 'boost', 'fresh']);
    assert.match(ranked.reasons[0].text, /@author_x is in your Close friends circle/);
    const b = ranked.breakdown;
    assert.ok(Math.abs(b.people + b.interests + b.freshness + b.appreciation - 1) < 1e-9);
    assert.equal(b.boost, 1.3);
  });

  it('spreads authors out', () => {
    const items = ['a', 'a', 'a', 'b', 'c'].map((author, i) => ({
      postId: `p${i}`, authorId: author, score: 1 - i * 0.1, discovered: false, reasons: [],
      breakdown: { people: 0, interests: 0, freshness: 0, appreciation: 0, boost: 1, calm: 1 },
    }));
    assert.deepEqual(diversify(items).map((i) => i.authorId), ['a', 'b', 'c', 'a', 'a']);
  });

  it('learns interests from engagement on top of chosen topics', () => {
    const interests = computeInterests(['books'], [['hiking'], ['hiking', 'photography'], ['hiking']]);
    assert.equal(interests.books, 0.6);
    assert.equal(interests.hiking, 0.7);
    assert.ok(interests.photography > 0 && interests.photography < interests.hiking);
  });
});

describe('wellbeing', () => {
  const ws = defaultSettings(false).wellbeing; // quiet 23:00–07:00, digest
  const at = (h: number, m = 0) => Date.UTC(2026, 9, 16, h, m);

  it('computes local days and quiet hours across midnight and time zones', () => {
    assert.equal(dayKey(Date.UTC(2026, 9, 16, 23, 30), 60), '2026-10-17');
    assert.equal(inQuietHours(at(23, 30), 0, ws), true);
    assert.equal(inQuietHours(at(6, 59), 0, ws), true);
    assert.equal(inQuietHours(at(7, 0), 0, ws), false);
    assert.equal(inQuietHours(at(21, 30), 120, ws), true); // 23:30 local
  });

  it('finds the next local clock time strictly after now', () => {
    assert.equal(nextLocalTime(at(12, 0), 0, 13 * 60), at(13, 0));
    assert.equal(nextLocalTime(at(13, 0), 0, 13 * 60), at(13, 0) + 86_400_000);
  });

  it('batches non-urgent notifications into digests and holds them in quiet hours', () => {
    assert.equal(nextDigestAt(at(9, 0), 0, ws), at(13, 0));
    assert.equal(nextDigestAt(at(20, 0), 0, ws), Date.UTC(2026, 9, 17, 8, 0));
    assert.equal(deliveryTime(at(9, 0), 0, ws, true), at(9, 0));
    const realtime = { ...ws, notifications: 'realtime' as const };
    assert.equal(deliveryTime(at(12, 0), 0, realtime, false), at(12, 0));
    assert.equal(deliveryTime(at(23, 30), 0, realtime, false), Date.UTC(2026, 9, 17, 7, 0));
  });

  it('reports the daily budget state', () => {
    assert.equal(budgetStatus(30 * 60, 60).state, 'ok');
    assert.equal(budgetStatus(50 * 60, 60).state, 'near');
    assert.equal(budgetStatus(61 * 60, 60).state, 'over');
    assert.equal(budgetStatus(999, 0).state, 'off');
  });
});

describe('money, age, text, notes', () => {
  it('splits payments 90/10 in whole cents and formats them', () => {
    assert.deepEqual(splitPayment(500), { grossCents: 500, feeCents: 50, netCents: 450 });
    assert.deepEqual(splitPayment(299), { grossCents: 299, feeCents: 30, netCents: 269 });
    assert.equal(formatMoney(450), '$4.50');
    assert.equal(formatMoney(-5), '-$0.05');
  });

  it('applies age rules', () => {
    const now = Date.UTC(2026, 9, 16);
    assert.equal(ageOn('2010-10-16', now), 16);
    assert.equal(ageOn('2010-10-17', now), 15);
    assert.equal(isTeen('2009-01-01', now), true);
    assert.equal(isTeen('2008-10-16', now), false);
    assert.match(validateBirthDate('2015-01-01', now) ?? '', /at least 13/);
    assert.match(validateBirthDate('2001-02-30', now) ?? '', /real date/);
    assert.equal(validateBirthDate('1990-05-04', now), null);
  });

  it('extracts topics and mentions, validates handles', () => {
    assert.deepEqual(extractTopics('Golden hour #Hiking #photography #hiking and a#notatag'), ['hiking', 'photography']);
    assert.deepEqual(extractMentions('Thanks @Maya_R and @leo! email me@example.com'), ['maya_r', 'leo']);
    assert.equal(validateHandle('maya_r'), null);
    assert.match(validateHandle('Ma') ?? '', /3–20/);
    assert.match(validateHandle('admin') ?? '', /reserved/);
    assert.equal(slugify('Lisbon Trail Club!'), 'lisbon-trail-club');
    assert.equal(cleanText('  hi\u0007\r\n\n\n\nthere ', 100), 'hi\n\nthere');
    assert.equal(containsAnyWord('No spoilers please', ['spoiler']), false);
    assert.equal(containsAnyWord('Spoiler: he lives', ['spoiler']), true);
  });

  it('shows community notes once enough raters agree', () => {
    assert.equal(noteIsShown(2, 0), false);
    assert.equal(noteIsShown(3, 1), true);
    assert.equal(noteIsShown(3, 2), false);
  });
});

describe('visibility', () => {
  const author = (privateAccount = false): Pick<UserRow, 'id' | 'status' | 'settings'> => {
    const settings = defaultSettings(false);
    settings.privacy.privateAccount = privateAccount;
    return { id: 'author', status: 'active', settings };
  };
  const post = (audience: PostRow['audience'], extra: Partial<PostRow> = {}) =>
    ({ authorId: 'author', audience, circleId: null, spaceId: null, status: 'visible', replyControl: 'everyone', ...extra }) as PostRow;
  const viewer = (extra: Partial<ViewerContext> = {}): ViewerContext => ({ ...emptyViewer(), viewerId: 'viewer', ...extra });

  it('applies each audience', () => {
    assert.equal(canViewPost(post('public'), author(), viewer()), true);
    assert.equal(canViewPost(post('followers'), author(), viewer()), false);
    assert.equal(canViewPost(post('followers'), author(), viewer({ following: new Set(['author']) })), true);
    assert.equal(canViewPost(post('friends'), author(), viewer({ following: new Set(['author']) })), false);
    assert.equal(
      canViewPost(post('friends'), author(), viewer({ following: new Set(['author']), followers: new Set(['author']) })),
      true,
    );
    assert.equal(canViewPost(post('circle', { circleId: 'c1' }), author(), viewer({ inCircles: new Set(['c1']) })), true);
    assert.equal(canViewPost(post('circle', { circleId: 'c2' }), author(), viewer({ inCircles: new Set(['c1']) })), false);
    assert.equal(canViewPost(post('supporters'), author(), viewer({ supporting: new Set(['author']) })), true);
    assert.equal(canViewPost(post('private'), author(), viewer({ following: new Set(['author']) })), false);
  });

  it('protects private accounts, blocks, removed posts', () => {
    assert.equal(canViewPost(post('public'), author(true), viewer()), false);
    assert.equal(canViewPost(post('public'), author(true), viewer({ following: new Set(['author']) })), true);
    assert.equal(canViewPost(post('public'), author(), viewer({ blocked: new Set(['author']) })), false);
    assert.equal(canViewPost(post('public', { status: 'removed' }), author(), viewer()), false);
    assert.equal(canViewPost(post('public', { status: 'removed' }), author(), viewer({ viewerId: 'author' })), true);
    assert.equal(canViewPost(post('public', { status: 'removed' }), author(), viewer({ isAdmin: true })), true);
  });

  it('lets space posts follow the space rules', () => {
    const p = post('space', { spaceId: 's1' });
    assert.equal(canViewPost(p, author(true), viewer({ spaces: new Set(['s1']) })), true);
    assert.equal(canViewPost(p, author(), viewer({ publicSpaces: new Set(['s1']) })), true);
    assert.equal(canViewPost(p, author(), viewer()), false);
  });

  it('applies reply controls', () => {
    assert.equal(canReply(post('public', { replyControl: 'friends' }), viewer({ following: new Set(['author']) })), false);
    assert.equal(canReply(post('public', { replyControl: 'followers' }), viewer({ following: new Set(['author']) })), true);
    assert.equal(canReply(post('public', { replyControl: 'nobody' }), viewer({ viewerId: 'author' })), true);
  });
});
