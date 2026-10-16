// The creator economy: tips, supporter memberships, Zemvii+, and a wallet.
//
// Creators keep 90%. In this version the wallet holds test credits only;
// real payments (Stripe, on the web where app-store rules allow) are on the
// roadmap. Money moves in a transaction so balances never drift.

import type { App } from './app.ts';
import { invalidateFeeds } from './app.ts';
import type { ID, TransactionRow, UserRow } from '../store/types.ts';
import { newId } from '../store/store.ts';
import { isTeen } from '../core/age.ts';
import { appreciationOf } from '../core/feed.ts';
import { MAX_TIP_CENTS, MAX_TOPUP_CENTS, MIN_TIP_CENTS, PLUS_PRICE_CENTS, splitPayment } from '../core/money.ts';
import { badRequest, forbidden, HttpError } from './errors.ts';
import { assertCanAct, isBlockedBetween, userByHandle, viewerContext } from './graph.ts';
import { loadPostFor } from './posts.ts';
import { notify } from './notify.ts';
import { int, str } from './validate.ts';
import { userSummary, type UserSummary } from './views.ts';

const DAY = 86_400_000;

function assertAdult(app: App, user: UserRow): void {
  if (isTeen(user.birthDate, app.now())) throw forbidden('Payments are not available on teen accounts.', 'teen_payments');
}

export interface TransactionView extends TransactionRow {
  counterparty: UserSummary | null;
  direction: 'in' | 'out';
}

export interface WalletView {
  balanceCents: number;
  testMode: true;
  transactions: TransactionView[];
}

export async function wallet(app: App, me: UserRow): Promise<WalletView> {
  const rows = await app.store.find('transactions', {
    where: { $or: [{ fromUserId: me.id }, { toUserId: me.id }] },
    orderBy: [['createdAt', 'desc']],
    limit: 50,
  });
  const others = [...new Set(rows.map((r) => (r.fromUserId === me.id ? r.toUserId : r.fromUserId)).filter((x): x is string => Boolean(x)))];
  const users = new Map((await app.store.find('users', { where: { id: { in: others } } })).map((u) => [u.id, u]));
  const fresh = await app.store.get('users', me.id);
  return {
    balanceCents: fresh?.walletCents ?? me.walletCents,
    testMode: true,
    transactions: rows.map((r) => {
      const direction = r.toUserId === me.id ? 'in' : 'out';
      const other = direction === 'in' ? r.fromUserId : r.toUserId;
      const user = other ? users.get(other) : undefined;
      return { ...r, direction, counterparty: user ? userSummary(user) : null };
    }),
  };
}

export async function topUp(app: App, me: UserRow, amount: unknown): Promise<WalletView> {
  assertAdult(app, me);
  if (!app.simulated) throw new HttpError(501, 'payments_missing', 'Payments are not configured on this server yet.');
  const cents = int(amount, 'Amount', { min: 100, max: MAX_TOPUP_CENTS });
  await app.store.transaction(async (tx) => {
    await tx.increment('users', me.id, 'walletCents', cents);
    await tx.insert('transactions', {
      id: newId(), kind: 'topup', fromUserId: null, toUserId: me.id, grossCents: cents, feeCents: 0, netCents: cents,
      postId: null, note: 'Test credits', createdAt: app.now(),
    });
  });
  return wallet(app, me);
}

/** Move money from payer to creator; creators receive 90%. */
async function pay(app: App, payer: UserRow, creator: UserRow, grossCents: number, kind: 'tip' | 'support', postId: ID | null, note: string) {
  const split = splitPayment(grossCents);
  await app.store.transaction(async (tx) => {
    const fresh = await tx.get('users', payer.id);
    if (!fresh || fresh.walletCents < grossCents) throw badRequest('Not enough credits in your wallet.', { code: 'insufficient_funds' });
    await tx.increment('users', payer.id, 'walletCents', -grossCents);
    await tx.increment('users', creator.id, 'walletCents', split.netCents);
    await tx.insert('transactions', { id: newId(), kind, fromUserId: payer.id, toUserId: creator.id, ...split, postId, note, createdAt: app.now() });
    if (postId) await tx.increment('posts', postId, 'tipCents', grossCents);
  });
  return split;
}

export async function tip(app: App, me: UserRow, input: { postId?: unknown; handle?: unknown; amountCents?: unknown; note?: unknown }) {
  assertCanAct(app, me);
  assertAdult(app, me);
  const amount = int(input.amountCents, 'Amount', { min: MIN_TIP_CENTS, max: MAX_TIP_CENTS });
  const note = str(input.note, 'Note', { max: 140 });
  let creator: UserRow;
  let postId: ID | null = null;
  if (typeof input.postId === 'string') {
    const ctx = await viewerContext(app, me);
    const { post, author } = await loadPostFor(app, me, ctx, input.postId);
    if (post.sponsored) throw badRequest("Sponsored posts can't receive tips.");
    creator = author;
    postId = post.id;
  } else {
    creator = await userByHandle(app, input.handle);
  }
  if (creator.id === me.id) throw badRequest("You can't tip yourself.");
  if (isTeen(creator.birthDate, app.now()) || !creator.settings.creator.tipsEnabled) throw forbidden('This person does not accept tips.');
  if (await isBlockedBetween(app, me.id, creator.id)) throw forbidden('This person does not accept tips.');
  const split = await pay(app, me, creator, amount, 'tip', postId, note);
  await notify(app, {
    userId: creator.id,
    actorId: me.id,
    type: 'tip',
    postId,
    text: `${me.name} sent you a $${(amount / 100).toFixed(2)} tip${note ? `: “${note}”` : ''}. You keep $${(split.netCents / 100).toFixed(2)}.`,
  });
  return { ...split, wallet: await wallet(app, me) };
}

export async function support(app: App, me: UserRow, handle: string) {
  assertCanAct(app, me);
  assertAdult(app, me);
  const creator = await userByHandle(app, handle);
  if (creator.id === me.id) throw badRequest("You can't support yourself.");
  if (isTeen(creator.birthDate, app.now()) || !creator.settings.creator.supportersEnabled) throw forbidden('This person does not have supporters yet.');
  if (await isBlockedBetween(app, me.id, creator.id)) throw forbidden('This person does not have supporters yet.');
  const id = `sup_${creator.id}_${me.id}`;
  const existing = await app.store.get('supports', id);
  if (existing?.status === 'active') return { status: 'active' as const };
  const price = creator.settings.creator.supportPriceCents;
  await pay(app, me, creator, price, 'support', null, 'Supporter membership');
  const now = app.now();
  await app.store.upsert('supports', { id, creatorId: creator.id, supporterId: me.id, priceCents: price, status: 'active', startedAt: now, renewsAt: now + 30 * DAY, cancelledAt: null });
  invalidateFeeds(app, me.id);
  await notify(app, { userId: creator.id, actorId: me.id, type: 'support', text: `${me.name} became a supporter 💛` });
  return { status: 'active' as const };
}

export async function cancelSupport(app: App, me: UserRow, handle: string): Promise<void> {
  const creator = await userByHandle(app, handle);
  await app.store.update('supports', { id: `sup_${creator.id}_${me.id}` }, { status: 'cancelled', cancelledAt: app.now() });
  invalidateFeeds(app, me.id);
}

export async function setPlus(app: App, me: UserRow, active: boolean) {
  assertAdult(app, me);
  if (active && !me.settings.plus) {
    if (!app.simulated) throw new HttpError(501, 'payments_missing', 'Payments are not configured on this server yet.');
    await app.store.transaction(async (tx) => {
      const fresh = await tx.get('users', me.id);
      if (!fresh || fresh.walletCents < PLUS_PRICE_CENTS) throw badRequest('Not enough credits in your wallet.', { code: 'insufficient_funds' });
      await tx.increment('users', me.id, 'walletCents', -PLUS_PRICE_CENTS);
      await tx.insert('transactions', {
        id: newId(), kind: 'support', fromUserId: me.id, toUserId: null, grossCents: PLUS_PRICE_CENTS, feeCents: PLUS_PRICE_CENTS,
        netCents: 0, postId: null, note: 'Zemvii+ (1 month)', createdAt: app.now(),
      });
    });
  }
  await app.store.update('users', { id: me.id }, { settings: { ...me.settings, plus: active } });
  invalidateFeeds(app, me.id);
}

export interface CreatorDashboard {
  earnedCents: number;
  earned30dCents: number;
  feesCents: number;
  tips: number;
  supporters: number;
  monthlySupportCents: number;
  followers: number;
  newFollowers30d: number;
  topPosts: Array<{ id: ID; text: string; reactions: number; comments: number; saves: number; tipsCents: number; createdAt: number }>;
  recentSupporters: UserSummary[];
  settings: UserRow['settings']['creator'];
  eligible: boolean;
}

export async function dashboard(app: App, me: UserRow): Promise<CreatorDashboard> {
  const now = app.now();
  const [incoming, supports, followers, newFollowers, posts] = await Promise.all([
    app.store.find('transactions', { where: { toUserId: me.id, kind: { in: ['tip', 'support'] } } }),
    app.store.find('supports', { where: { creatorId: me.id, status: 'active' }, orderBy: [['startedAt', 'desc']] }),
    app.store.count('follows', { followeeId: me.id, status: 'active' }),
    app.store.count('follows', { followeeId: me.id, status: 'active', createdAt: { gt: now - 30 * DAY } }),
    app.store.find('posts', { where: { authorId: me.id, status: 'visible', createdAt: { gt: now - 90 * DAY } }, limit: 500 }),
  ]);
  const supporterUsers = await app.store.find('users', { where: { id: { in: supports.slice(0, 8).map((s) => s.supporterId) }, status: 'active' } });
  const top = posts
    .map((p) => ({ p, score: appreciationOf(p) + p.tipCents / 10_000 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ p }) => ({ id: p.id, text: p.text, reactions: p.reactionCount, comments: p.commentCount, saves: p.saveCount, tipsCents: p.tipCents, createdAt: p.createdAt }));
  return {
    earnedCents: incoming.reduce((sum, t) => sum + t.netCents, 0),
    earned30dCents: incoming.filter((t) => t.createdAt > now - 30 * DAY).reduce((sum, t) => sum + t.netCents, 0),
    feesCents: incoming.reduce((sum, t) => sum + t.feeCents, 0),
    tips: incoming.filter((t) => t.kind === 'tip').length,
    supporters: supports.length,
    monthlySupportCents: supports.reduce((sum, s) => sum + Math.round(s.priceCents * 0.9), 0),
    followers,
    newFollowers30d: newFollowers,
    topPosts: top,
    recentSupporters: supporterUsers.map(userSummary),
    settings: me.settings.creator,
    eligible: !isTeen(me.birthDate, now),
  };
}

export async function supporterOf(app: App, me: UserRow): Promise<UserSummary[]> {
  const rows = await app.store.find('supports', { where: { supporterId: me.id, status: 'active' } });
  const users = await app.store.find('users', { where: { id: { in: rows.map((r) => r.creatorId) }, status: 'active' } });
  return users.map(userSummary);
}
