// Accounts, sessions and Recovery friends.
//
// Recovery friends answer the most common complaint about Facebook: being
// locked out with no way back. You pick up to three friends; if you lose
// access, two of them vouch for you and you set a new password.

import type { App } from './app.ts';
import type { ID, RecoveryRow, UserRow } from '../store/types.ts';
import { newId } from '../store/store.ts';
import { defaultSettings } from '../core/defaults.ts';
import { isTeen, validateBirthDate } from '../core/age.ts';
import { validateHandle } from '../core/text.ts';
import { badRequest, conflict, forbidden, notFound, unauthorized } from './errors.ts';
import { hashPassword, passwordProblem, randomToken, sha256Hex, verifyPassword } from './crypto.ts';
import { int, str } from './validate.ts';
import { notify } from './notify.ts';
import { areFriends, userByHandle } from './graph.ts';
import { userSummary, type UserSummary } from './views.ts';

export const SESSION_DAYS = 30;
const DAY = 86_400_000;
export const RECOVERY_APPROVALS_NEEDED = 2;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A real hash with the configured cost, checked when an account does not exist,
// so response time does not reveal which accounts exist.
const dummyHashes = new Map<number, Promise<string>>();
function dummyHash(iterations: number): Promise<string> {
  let hash = dummyHashes.get(iterations);
  if (!hash) {
    hash = hashPassword('zemvii-no-such-account', iterations);
    dummyHashes.set(iterations, hash);
  }
  return hash;
}

export interface SignupInput {
  name: unknown;
  handle: unknown;
  email: unknown;
  password: unknown;
  birthDate: unknown;
  tzOffsetMin?: unknown;
}

export async function createSession(app: App, user: UserRow, userAgent: string): Promise<string> {
  const token = randomToken();
  const now = app.now();
  await app.store.insert('sessions', {
    id: await sha256Hex(token),
    userId: user.id,
    userAgent: userAgent.slice(0, 200),
    createdAt: now,
    expiresAt: now + SESSION_DAYS * DAY,
    lastSeenAt: now,
  });
  return token;
}

export async function signup(app: App, input: SignupInput, userAgent = ''): Promise<{ user: UserRow; token: string }> {
  const now = app.now();
  const name = str(input.name, 'Name', { required: true, max: 50 });
  const handle = str(input.handle, 'Handle', { required: true, max: 20 }).toLowerCase().replace(/^@/, '');
  const handleError = validateHandle(handle);
  if (handleError) throw badRequest(handleError, { field: 'handle' });
  const email = str(input.email, 'Email', { required: true, max: 120 }).toLowerCase();
  if (!EMAIL.test(email)) throw badRequest('Enter a valid email address.', { field: 'email' });
  const passwordError = passwordProblem(input.password);
  if (passwordError) throw badRequest(passwordError, { field: 'password' });
  const birthError = validateBirthDate(input.birthDate, now, app.minAge);
  if (birthError) throw badRequest(birthError, { field: 'birthDate' });
  const birthDate = input.birthDate as string;
  if (await app.store.findOne('users', { handle })) throw conflict('That handle is taken.', 'handle_taken', { field: 'handle' });
  if (await app.store.findOne('users', { email })) throw conflict('An account with that email already exists.', 'email_taken', { field: 'email' });

  const teen = isTeen(birthDate, now);
  const settings = defaultSettings(teen);
  settings.tzOffsetMin = int(input.tzOffsetMin, 'Time zone', { min: -840, max: 840, fallback: 0 });
  const user: UserRow = {
    id: newId(),
    handle,
    name,
    email,
    passwordHash: await hashPassword(input.password as string, app.passwordIterations),
    bio: '',
    pronouns: '',
    location: '',
    website: '',
    avatarUrl: null,
    hue: Math.floor(Math.random() * 360),
    birthDate,
    verifiedHuman: false,
    role: 'user',
    status: 'active',
    suspendedUntil: null,
    settings,
    topics: [],
    walletCents: 0,
    feedSeenAt: 0,
    bot: false,
    createdAt: now,
    lastActiveAt: now,
  };
  try {
    await app.store.insert('users', user);
  } catch (error) {
    if (String(error).includes('UNIQUE')) throw conflict('That handle or email was just taken.', 'taken');
    throw error;
  }
  for (const [circleName, emoji, hue] of [['Close friends', '💛', 45], ['Family', '🏡', 200]] as const) {
    await app.store.insert('circles', { id: newId(), ownerId: user.id, name: circleName, emoji, hue, createdAt: now });
  }
  try {
    await app.onSignup(app, user);
  } catch (error) {
    app.log('onSignup hook failed', error);
  }
  await notify(app, {
    userId: user.id,
    type: 'system',
    urgent: true,
    text: teen
      ? 'Welcome to Zemvii! Your account is private and protected by default. Only people you approve can see your posts.'
      : 'Welcome to Zemvii! Your feed, your rules: tune it any time with Feed Dials.',
  });
  return { user, token: await createSession(app, user, userAgent) };
}

export async function login(app: App, input: { identifier: unknown; password: unknown }, userAgent = ''): Promise<{ user: UserRow; token: string }> {
  const identifier = str(input.identifier, 'Email or handle', { required: true, max: 120 }).toLowerCase().replace(/^@/, '');
  const password = typeof input.password === 'string' ? input.password : '';
  const user = await app.store.findOne('users', identifier.includes('@') ? { email: identifier } : { handle: identifier });
  const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash(app.passwordIterations)));
  if (!user || !ok || user.status === 'deleted') throw unauthorized('That email/handle and password do not match.');
  return { user, token: await createSession(app, user, userAgent) };
}

export async function logout(app: App, token: string | null): Promise<void> {
  if (token) await app.store.delete('sessions', { id: await sha256Hex(token) });
}

/** Resolve a session token to its user, sliding the expiry and lifting finished suspensions. */
export async function resolveSession(app: App, token: string | null): Promise<UserRow | null> {
  if (!token || token.length > 100) return null;
  const id = await sha256Hex(token);
  const session = await app.store.get('sessions', id);
  const now = app.now();
  if (!session || session.expiresAt < now) {
    if (session) await app.store.delete('sessions', { id });
    return null;
  }
  let user = await app.store.get('users', session.userId);
  if (!user || user.status === 'deleted') return null;
  if (user.status === 'suspended' && user.suspendedUntil !== null && user.suspendedUntil <= now) {
    await app.store.update('users', { id: user.id }, { status: 'active', suspendedUntil: null });
    user = { ...user, status: 'active', suspendedUntil: null };
  }
  if (now - session.lastSeenAt > 3_600_000) {
    await app.store.update('sessions', { id }, { lastSeenAt: now, expiresAt: now + SESSION_DAYS * DAY });
    await app.store.update('users', { id: user.id }, { lastActiveAt: now });
  }
  return user;
}

export async function changePassword(app: App, me: UserRow, input: { current: unknown; next: unknown }, keepToken: string | null): Promise<void> {
  if (typeof input.current !== 'string' || !(await verifyPassword(input.current, me.passwordHash))) {
    throw forbidden('Your current password is not right.', 'wrong_password');
  }
  const problem = passwordProblem(input.next);
  if (problem) throw badRequest(problem, { field: 'next' });
  await app.store.update('users', { id: me.id }, { passwordHash: await hashPassword(input.next as string, app.passwordIterations) });
  const keep = keepToken ? await sha256Hex(keepToken) : '';
  await app.store.delete('sessions', { userId: me.id, id: { ne: keep } });
}

// ---- Recovery friends ----------------------------------------------------

export async function setRecoveryFriends(app: App, me: UserRow, ids: unknown): Promise<UserSummary[]> {
  if (!Array.isArray(ids) || ids.length > 3 || ids.some((id) => typeof id !== 'string')) {
    throw badRequest('Choose up to three recovery friends.');
  }
  const unique = [...new Set(ids as string[])];
  const friends: UserRow[] = [];
  for (const id of unique) {
    const user = await app.store.get('users', id);
    if (!user || user.status !== 'active' || !(await areFriends(app, me.id, id))) {
      throw badRequest('Recovery friends must be people you follow who follow you back.');
    }
    friends.push(user);
  }
  await app.store.update('users', { id: me.id }, { settings: { ...me.settings, recoveryFriendIds: unique } });
  return friends.map(userSummary);
}

export async function startRecovery(app: App, input: { handle: unknown }): Promise<{ requestId: ID; secret: string; friendsAsked: number }> {
  const user = await userByHandle(app, input.handle);
  const friendIds = user.settings.recoveryFriendIds;
  if (friendIds.length < RECOVERY_APPROVALS_NEEDED) {
    throw badRequest("This account hasn't set up recovery friends. Contact support to verify your identity another way.");
  }
  const now = app.now();
  const pending = await app.store.findOne('recoveries', { userId: user.id, status: 'pending', expiresAt: { gt: now } });
  if (pending) throw conflict('A recovery request is already waiting for your friends. It expires within 24 hours.', 'recovery_pending');
  const secret = randomToken();
  const row: RecoveryRow = {
    id: newId(),
    userId: user.id,
    secretHash: await sha256Hex(secret),
    approvals: [],
    status: 'pending',
    createdAt: now,
    expiresAt: now + DAY,
  };
  await app.store.insert('recoveries', row);
  for (const friendId of friendIds) {
    await notify(app, {
      userId: friendId,
      actorId: user.id,
      type: 'recovery_request',
      text: `${user.name} is locked out and asked you to vouch for them. Check with them directly (call or meet) before you approve.`,
    });
  }
  return { requestId: row.id, secret, friendsAsked: friendIds.length };
}

export async function pendingRecoveryRequests(app: App, me: UserRow): Promise<Array<{ id: ID; user: UserSummary; approvals: number; expiresAt: number; approvedByMe: boolean }>> {
  const now = app.now();
  const rows = await app.store.find('recoveries', { where: { status: { in: ['pending', 'approved'] }, expiresAt: { gt: now } } });
  const out = [];
  for (const row of rows) {
    const user = await app.store.get('users', row.userId);
    if (!user || !user.settings.recoveryFriendIds.includes(me.id)) continue;
    out.push({ id: row.id, user: userSummary(user), approvals: row.approvals.length, expiresAt: row.expiresAt, approvedByMe: row.approvals.includes(me.id) });
  }
  return out;
}

export async function approveRecovery(app: App, me: UserRow, requestId: string): Promise<{ approvals: number }> {
  const row = await app.store.get('recoveries', requestId);
  if (!row || row.expiresAt < app.now() || row.status === 'completed') throw notFound('That request has expired.');
  const user = await app.store.get('users', row.userId);
  if (!user || !user.settings.recoveryFriendIds.includes(me.id)) throw forbidden('Only their recovery friends can vouch.');
  const approvals = row.approvals.includes(me.id) ? row.approvals : [...row.approvals, me.id];
  const status = approvals.length >= RECOVERY_APPROVALS_NEEDED ? 'approved' : row.status;
  await app.store.update('recoveries', { id: row.id }, { approvals, status });
  return { approvals: approvals.length };
}

async function recoveryWithSecret(app: App, requestId: unknown, secret: unknown): Promise<RecoveryRow> {
  if (typeof requestId !== 'string' || typeof secret !== 'string') throw notFound('No such recovery request.');
  const row = await app.store.get('recoveries', requestId);
  if (!row || row.secretHash !== (await sha256Hex(secret))) throw notFound('No such recovery request.');
  if (row.expiresAt < app.now() && row.status !== 'completed') {
    await app.store.update('recoveries', { id: row.id }, { status: 'expired' });
    return { ...row, status: 'expired' };
  }
  return row;
}

export async function recoveryStatus(app: App, input: { requestId: unknown; secret: unknown }) {
  const row = await recoveryWithSecret(app, input.requestId, input.secret);
  return { status: row.status, approvals: row.approvals.length, needed: RECOVERY_APPROVALS_NEEDED, expiresAt: row.expiresAt };
}

export async function completeRecovery(
  app: App,
  input: { requestId: unknown; secret: unknown; password: unknown },
  userAgent = '',
): Promise<{ user: UserRow; token: string }> {
  const row = await recoveryWithSecret(app, input.requestId, input.secret);
  if (row.status !== 'approved') throw forbidden('Your friends have not vouched for you yet.', 'not_approved');
  const problem = passwordProblem(input.password);
  if (problem) throw badRequest(problem, { field: 'password' });
  const user = await app.store.get('users', row.userId);
  if (!user || user.status === 'deleted') throw notFound('No such account.');
  await app.store.update('users', { id: user.id }, { passwordHash: await hashPassword(input.password as string, app.passwordIterations) });
  await app.store.delete('sessions', { userId: user.id });
  await app.store.update('recoveries', { id: row.id }, { status: 'completed' });
  await notify(app, {
    userId: user.id,
    type: 'recovery_approved',
    text: 'Your password was reset with help from your recovery friends. All other devices were signed out.',
  });
  return { user, token: await createSession(app, user, userAgent) };
}
