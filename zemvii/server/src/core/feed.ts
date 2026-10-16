// Explainable feed ranking for the Mix feed and Clips.
//
// Every score is a small, readable formula driven by the user's Feed Dials,
// and the same code that ranks a post produces its "Why am I seeing this?"
// explanation, so the explanation is always what actually happened.
//
//   people     how close you are to the author (you, circle, friend, follow, space)
//   discovery  how well a post matches your interests (dominant for strangers)
//   quality    freshness and appreciation, mixed by the Fresh↔Popular dial
//   ×boost     topics you boosted
//   ×calm      heated posts sink when the Calm dial is up

import type { FeedDials, Origin, PostKind } from '../store/types.ts';
import { containsAnyWord } from './text.ts';

export interface RankablePost {
  id: string;
  authorId: string;
  kind: PostKind;
  text: string;
  createdAt: number;
  topics: string[];
  origin: Origin;
  heat: number;
  reactionCount: number;
  commentCount: number;
  saveCount: number;
  spaceId: string | null;
}

export interface Relation {
  self: boolean;
  /** Name of the viewer's circle the author belongs to, if any. */
  circle: string | null;
  friend: boolean;
  follows: boolean;
  /** Name of the joined space the post was shared in, if any. */
  space: string | null;
}

export interface Candidate {
  post: RankablePost;
  relation: Relation;
  authorHandle: string;
}

export interface RankInput {
  candidates: Candidate[];
  dials: FeedDials;
  /** Topic -> affinity 0–1 (see computeInterests). */
  interests: Record<string, number>;
  now: number;
}

export type ReasonKind =
  | 'self' | 'circle' | 'friend' | 'follow' | 'space' | 'interest' | 'discover' | 'boost' | 'fresh' | 'popular'
  | 'calm' | 'origin';

export interface Reason {
  kind: ReasonKind;
  text: string;
}

export interface Breakdown {
  /** Shares of the base score (sum to 1). */
  people: number;
  interests: number;
  freshness: number;
  appreciation: number;
  /** Multipliers applied after the base score. */
  boost: number;
  calm: number;
}

export interface Ranked {
  postId: string;
  authorId: string;
  score: number;
  discovered: boolean;
  reasons: Reason[];
  breakdown: Breakdown;
}

const HOUR = 3_600_000;

export function relationshipStrength(r: Relation): number {
  if (r.self) return 0.7;
  if (r.circle) return 1;
  if (r.friend) return 0.9;
  if (r.follows) return 0.75;
  if (r.space) return 0.6;
  return 0;
}

export function appreciationOf(p: Pick<RankablePost, 'reactionCount' | 'commentCount' | 'saveCount'>): number {
  const signal = p.reactionCount + 2 * p.commentCount + 3 * p.saveCount;
  return Math.min(1, Math.log1p(signal) / Math.log1p(150));
}

export function freshnessOf(createdAt: number, now: number, dials: Pick<FeedDials, 'freshVsPopular'>): number {
  const ageHours = Math.max(0, (now - createdAt) / HOUR);
  const halfLife = 6 + 42 * (dials.freshVsPopular / 100);
  return Math.pow(0.5, ageHours / halfLife);
}

/** Why a candidate is left out entirely, or null when it may be shown. */
export function exclusionReason(c: Candidate, dials: FeedDials): string | null {
  if (dials.ai === 'hide' && c.post.origin === 'ai_generated') return 'AI-generated posts are hidden by your settings.';
  if (c.post.topics.some((t) => dials.muteTopics.includes(t))) return 'It is about a topic you muted.';
  if (containsAnyWord(c.post.text, dials.mutedWords)) return 'It contains a word you muted.';
  if (dials.friendsVsDiscover === 0 && relationshipStrength(c.relation) === 0) {
    return 'Your dial is set to people you follow only.';
  }
  return null;
}

function ago(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.round(minutes / 60)} h ago`;
}

export function scoreCandidate(c: Candidate, input: Omit<RankInput, 'candidates'>): Ranked {
  const { dials, interests, now } = input;
  const d = dials.friendsVsDiscover / 100;
  const p = dials.freshVsPopular / 100;
  const calmDial = dials.calm / 100;
  const post = c.post;
  const rel = relationshipStrength(c.relation);

  const boosted = post.topics.find((t) => dials.boostTopics.includes(t)) ?? null;
  let interest = 0;
  let topTopic: string | null = null;
  for (const topic of post.topics) {
    const weight = dials.boostTopics.includes(topic) ? 1 : (interests[topic] ?? 0);
    if (weight > interest) {
      interest = weight;
      topTopic = topic;
    }
  }

  const fresh = freshnessOf(post.createdAt, now, dials);
  const appreciation = appreciationOf(post);

  const people = rel * (1 - 0.65 * d);
  const discovery = rel > 0 ? interest * 0.25 : (0.2 + 0.8 * interest) * (0.1 + 0.9 * d);
  const freshnessPart = 0.35 * ((1 - p) * fresh + p * 0.35 * fresh);
  const appreciationPart = 0.35 * p * 0.65 * appreciation;
  const base = 0.5 * people + 0.3 * discovery + freshnessPart + appreciationPart;

  const boost = boosted ? 1.3 : 1;
  const calm = 1 - calmDial * post.heat * 0.85;
  const score = base * boost * calm;

  const reasons: Reason[] = [];
  const r = c.relation;
  const h = `@${c.authorHandle}`;
  if (r.self) reasons.push({ kind: 'self', text: 'This is your post.' });
  else if (r.circle) reasons.push({ kind: 'circle', text: `${h} is in your ${r.circle} circle.` });
  else if (r.friend) reasons.push({ kind: 'friend', text: `You and ${h} follow each other.` });
  else if (r.follows) reasons.push({ kind: 'follow', text: `You follow ${h}.` });
  if (r.space && !r.self) reasons.push({ kind: 'space', text: `Shared in ${r.space}, a space you joined.` });
  if (rel === 0) {
    reasons.push(
      topTopic && interest > 0
        ? { kind: 'interest', text: `Suggested because you're into #${topTopic}.` }
        : { kind: 'discover', text: 'Suggested: a new voice from Discover.' },
    );
  }
  if (boosted) reasons.push({ kind: 'boost', text: `#${boosted} is one of your boosted topics.` });
  if (now - post.createdAt < 3 * HOUR) reasons.push({ kind: 'fresh', text: `Fresh: posted ${ago(now - post.createdAt)}.` });
  if (appreciation >= 0.5 && p >= 0.3) reasons.push({ kind: 'popular', text: 'Lots of people appreciated it.' });
  if (calm < 0.75) reasons.push({ kind: 'calm', text: 'Moved down by your Calm dial because it looks heated.' });
  if (post.origin !== 'human') {
    reasons.push({
      kind: 'origin',
      text: post.origin === 'ai_generated' ? 'Its author labelled it AI-generated.' : 'Its author says AI helped make it.',
    });
  }

  const total = base || 1;
  return {
    postId: post.id,
    authorId: post.authorId,
    score: Math.round(score * 10_000) / 10_000,
    discovered: rel === 0,
    reasons,
    breakdown: {
      people: (0.5 * people) / total,
      interests: (0.3 * discovery) / total,
      freshness: freshnessPart / total,
      appreciation: appreciationPart / total,
      boost,
      calm: Math.round(calm * 100) / 100,
    },
  };
}

/**
 * Rank candidates: drop excluded posts, score the rest, sort, then spread
 * authors out so nobody fills the screen.
 */
export function rankFeed(input: RankInput): Ranked[] {
  const scored = input.candidates
    .filter((c) => exclusionReason(c, input.dials) === null)
    .map((c) => scoreCandidate(c, input))
    .sort((a, b) => b.score - a.score || a.postId.localeCompare(b.postId));
  return diversify(scored);
}

/** Greedy re-ordering: avoid the same author twice within three places when possible. */
export function diversify(items: Ranked[]): Ranked[] {
  const pool = [...items];
  const out: Ranked[] = [];
  while (pool.length) {
    const recent = out.slice(-2).map((i) => i.authorId);
    let index = pool.findIndex((i) => !recent.includes(i.authorId));
    if (index === -1) index = 0;
    out.push(pool.splice(index, 1)[0]);
  }
  return out;
}

/**
 * Topic affinities from the topics chosen at onboarding and the topics of
 * posts the user recently reacted to or saved.
 */
export function computeInterests(chosen: string[], engagedTopics: string[][]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const topics of engagedTopics) for (const t of topics) counts.set(t, (counts.get(t) ?? 0) + 1);
  const max = Math.max(1, ...counts.values());
  const interests: Record<string, number> = {};
  for (const t of chosen) interests[t] = 0.6;
  for (const [t, n] of counts) interests[t] = Math.min(1, (interests[t] ?? 0) + 0.7 * (n / max));
  for (const t of Object.keys(interests)) interests[t] = Math.round(interests[t] * 100) / 100;
  return interests;
}

/** The explanation shown for a sponsored post. Sponsors match the feed's topic, never a profile of you. */
export function sponsoredReason(topic: string | null): Reason {
  return {
    kind: 'discover',
    text: topic
      ? `Sponsored. Shown because nearby posts are about #${topic}. Zemvii never targets ads using your activity or other apps.`
      : 'Sponsored. Zemvii never targets ads using your activity or other apps.',
  };
}
