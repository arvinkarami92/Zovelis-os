// Reports, the moderation queue, Account Status and appeals.
//
// Every action against an account comes with a plain-language explanation
// the person can read on their Account Status page, and a one-tap appeal
// that a different moderator reviews. Reporters hear back about the outcome.

import type { App } from './app.ts';
import type { ModerationActionRow, ReportReason, ReportRow, ReportTarget, UserRow } from '../store/types.ts';
import { newId } from '../store/store.ts';
import { badRequest, conflict, forbidden, notFound } from './errors.ts';
import { notify } from './notify.ts';
import { indexTopics } from './posts.ts';
import { int, oneOf, str } from './validate.ts';
import { userSummary, type ModerationView, type ReportView } from './views.ts';

export const REPORT_REASONS: ReportReason[] = [
  'harassment', 'hate', 'violence', 'self_harm', 'spam', 'scam', 'nudity', 'misinformation', 'undisclosed_ai',
  'impersonation', 'underage', 'other',
];
const TARGETS: ReportTarget[] = ['post', 'comment', 'user', 'message', 'space', 'plan'];

export const REASON_LABELS: Record<ReportReason, string> = {
  harassment: 'Harassment or bullying',
  hate: 'Hate speech',
  violence: 'Violence or threats',
  self_harm: 'Self-harm or suicide',
  spam: 'Spam',
  scam: 'Scam or fraud',
  nudity: 'Nudity or sexual content',
  misinformation: 'False information',
  undisclosed_ai: 'AI content not labelled',
  impersonation: 'Pretending to be someone',
  underage: 'Under the minimum age',
  other: 'Something else',
};

async function targetInfo(app: App, type: ReportTarget, id: string): Promise<{ userId: string | null; preview: string }> {
  switch (type) {
    case 'post': {
      const post = await app.store.get('posts', id);
      if (!post || post.status === 'deleted') throw notFound('That post is gone.');
      return { userId: post.authorId, preview: post.text || `${post.media.length} photo(s)` };
    }
    case 'comment': {
      const comment = await app.store.get('comments', id);
      if (!comment || comment.status === 'deleted') throw notFound('That comment is gone.');
      return { userId: comment.authorId, preview: comment.text };
    }
    case 'message': {
      const message = await app.store.get('messages', id);
      if (!message) throw notFound('That message is gone.');
      return { userId: message.senderId, preview: message.text };
    }
    case 'user': {
      const user = await app.store.get('users', id);
      if (!user || user.status === 'deleted') throw notFound('No such person.');
      return { userId: user.id, preview: `@${user.handle}: ${user.bio}` };
    }
    case 'space': {
      const space = await app.store.get('spaces', id);
      if (!space) throw notFound('No such space.');
      return { userId: space.ownerId, preview: `${space.name}: ${space.description}` };
    }
    case 'plan': {
      const plan = await app.store.get('plans', id);
      if (!plan) throw notFound('No such plan.');
      return { userId: plan.hostId, preview: `${plan.title}: ${plan.description}` };
    }
  }
}

export async function fileReport(app: App, me: UserRow, input: Record<string, unknown>): Promise<{ id: string }> {
  const targetType = oneOf(input.targetType, 'Target', TARGETS);
  const targetId = str(input.targetId, 'Target id', { required: true, max: 40 });
  const reason = oneOf(input.reason, 'Reason', REPORT_REASONS);
  const details = str(input.details, 'Details', { max: 1000 });
  const info = await targetInfo(app, targetType, targetId);
  if (targetType === 'message') {
    const message = (await app.store.get('messages', targetId))!;
    if (!(await app.store.get('conversationMembers', `cm_${message.conversationId}_${me.id}`))) throw notFound('That message is gone.');
  }
  if (info.userId === me.id) throw badRequest("You can't report yourself.");
  if (await app.store.findOne('reports', { reporterId: me.id, targetId, status: 'open' })) throw conflict('You already reported this. A person is reviewing it.');
  const report: ReportRow = {
    id: newId(), reporterId: me.id, targetType, targetId, targetUserId: info.userId, reason, details, status: 'open',
    createdAt: app.now(), resolvedAt: null, resolvedBy: null,
  };
  await app.store.insert('reports', report);
  return { id: report.id };
}

function assertAdmin(me: UserRow): void {
  if (me.role !== 'admin') throw forbidden('Moderators only.');
}

export async function moderationQueue(app: App, me: UserRow): Promise<{ reports: ReportView[]; appeals: ModerationView[] }> {
  assertAdmin(me);
  const open = await app.store.find('reports', { where: { status: 'open' }, orderBy: [['createdAt', 'asc']], limit: 500 });
  const groups = new Map<string, ReportRow[]>();
  for (const r of open) groups.set(`${r.targetType}:${r.targetId}`, [...(groups.get(`${r.targetType}:${r.targetId}`) ?? []), r]);
  const users = new Map(
    (await app.store.find('users', { where: { id: { in: [...new Set(open.map((r) => r.targetUserId).filter((x): x is string => Boolean(x)))] } } })).map((u) => [u.id, u]),
  );
  const reports: ReportView[] = [];
  for (const rows of groups.values()) {
    const first = rows[0];
    let preview = '';
    try {
      preview = (await targetInfo(app, first.targetType, first.targetId)).preview;
    } catch {
      preview = '(already removed)';
    }
    const user = first.targetUserId ? users.get(first.targetUserId) : undefined;
    reports.push({
      targetType: first.targetType,
      targetId: first.targetId,
      reasons: [...new Set(rows.map((r) => r.reason))],
      reports: rows.length,
      firstReportedAt: first.createdAt,
      reportIds: rows.map((r) => r.id),
      preview: preview.slice(0, 400),
      targetUser: user ? userSummary(user) : null,
      details: rows.map((r) => r.details).filter(Boolean).slice(0, 5),
    });
  }
  // Most-reported first, then oldest.
  reports.sort((a, b) => b.reports - a.reports || a.firstReportedAt - b.firstReportedAt);
  const appealRows = await app.store.find('moderationActions', { where: { appealStatus: 'pending' }, orderBy: [['appealAt', 'asc']] });
  const appeals = await Promise.all(appealRows.map((a) => moderationView(app, a)));
  return { reports, appeals };
}

async function moderationView(app: App, row: ModerationActionRow): Promise<ModerationView> {
  let preview = '';
  try {
    preview = (await targetInfo(app, row.targetType, row.targetId)).preview;
  } catch {
    preview = '';
  }
  const { createdBy: _hidden, ...rest } = row;
  return { ...rest, preview: preview.slice(0, 300) };
}

export async function resolveReports(app: App, me: UserRow, input: Record<string, unknown>): Promise<void> {
  assertAdmin(me);
  const targetType = oneOf(input.targetType, 'Target', TARGETS);
  const targetId = str(input.targetId, 'Target id', { required: true, max: 40 });
  const decision = oneOf(input.action, 'Action', ['dismiss', 'remove', 'warn', 'suspend', 'label_ai'] as const);
  const open = await app.store.find('reports', { where: { targetType, targetId, status: 'open' } });
  if (open.length === 0) throw notFound('Nothing open for that target.');
  const now = app.now();
  const info = await targetInfo(app, targetType, targetId).catch(() => ({ userId: open[0].targetUserId, preview: '' }));
  const reason = (input.reason ? oneOf(input.reason, 'Reason', REPORT_REASONS) : open[0].reason) as ReportReason;
  if (decision !== 'dismiss') {
    const explanation = str(input.explanation, 'Explanation', { required: true, min: 10, max: 1000 });
    if (!info.userId) throw badRequest('This target has no owner to act on.');
    if (decision === 'remove') {
      if (targetType === 'post') {
        await app.store.update('posts', { id: targetId }, { status: 'removed' });
        const post = await app.store.get('posts', targetId);
        if (post) await indexTopics(app, post);
      } else if (targetType === 'comment') {
        const comment = await app.store.get('comments', targetId);
        await app.store.update('comments', { id: targetId }, { status: 'removed' });
        if (comment?.status === 'visible') await app.store.increment('posts', comment.postId, 'commentCount', -1);
      } else if (targetType === 'message') {
        await app.store.update('messages', { id: targetId }, { status: 'removed' });
      } else if (targetType === 'plan') {
        await app.store.update('plans', { id: targetId }, { status: 'cancelled' });
      } else {
        throw badRequest('Use suspend for accounts and spaces.');
      }
    }
    if (decision === 'label_ai') {
      if (targetType !== 'post') throw badRequest('Only posts can be labelled.');
      await app.store.update('posts', { id: targetId }, { origin: 'ai_generated' });
    }
    if (decision === 'suspend') {
      const days = int(input.days, 'Days', { min: 1, max: 365, fallback: 7 });
      // Sessions stay valid so the person can read why and appeal; writes are blocked.
      await app.store.update('users', { id: info.userId }, { status: 'suspended', suspendedUntil: now + days * 86_400_000 });
    }
    await app.store.insert('moderationActions', {
      id: newId(), userId: info.userId, reportId: open[0].id, targetType, targetId, action: decision, reason, explanation,
      createdBy: me.id, createdAt: now, appealStatus: 'none', appealText: '', appealAt: null, appealResolvedAt: null,
    });
    const verb = { remove: 'removed one of your posts or comments', warn: 'sent you a warning', suspend: 'suspended your account', label_ai: 'labelled one of your posts as AI-generated' }[decision];
    await notify(app, { userId: info.userId, type: 'moderation', text: `Zemvii ${verb}. See Account Status for why, and to appeal.` });
  }
  await app.store.update('reports', { targetType, targetId, status: 'open' }, { status: decision === 'dismiss' ? 'dismissed' : 'actioned', resolvedAt: now, resolvedBy: me.id });
  for (const reporterId of new Set(open.map((r) => r.reporterId))) {
    await notify(app, {
      userId: reporterId,
      type: 'moderation',
      text: decision === 'dismiss'
        ? "We reviewed your report and didn't find a rule break. You can still block or mute the account."
        : 'We reviewed your report and took action. Thank you for helping keep Zemvii kind.',
    });
  }
}

export async function accountStatus(app: App, me: UserRow): Promise<{ standing: 'good' | 'warned' | 'suspended'; suspendedUntil: number | null; actions: ModerationView[] }> {
  const rows = await app.store.find('moderationActions', { where: { userId: me.id }, orderBy: [['createdAt', 'desc']] });
  const actions = await Promise.all(rows.map((r) => moderationView(app, r)));
  const active = rows.filter((r) => r.appealStatus !== 'overturned');
  const standing = me.status === 'suspended' ? 'suspended' : active.some((r) => r.createdAt > app.now() - 90 * 86_400_000) ? 'warned' : 'good';
  return { standing, suspendedUntil: me.suspendedUntil, actions };
}

export async function appeal(app: App, me: UserRow, actionId: string, text: unknown): Promise<void> {
  const action = await app.store.get('moderationActions', actionId);
  if (!action || action.userId !== me.id) throw notFound('No such decision.');
  if (action.appealStatus !== 'none') throw conflict('You already appealed this decision.');
  await app.store.update('moderationActions', { id: actionId }, {
    appealStatus: 'pending', appealText: str(text, 'Appeal', { required: true, min: 5, max: 1000 }), appealAt: app.now(),
  });
}

export async function resolveAppeal(app: App, me: UserRow, actionId: string, overturn: unknown): Promise<void> {
  assertAdmin(me);
  const action = await app.store.get('moderationActions', actionId);
  if (!action || action.appealStatus !== 'pending') throw notFound('No pending appeal.');
  if (action.createdBy === me.id) throw forbidden('A different moderator has to review an appeal.');
  const overturned = overturn === true;
  if (overturned) {
    if (action.action === 'remove') {
      if (action.targetType === 'post') {
        await app.store.update('posts', { id: action.targetId }, { status: 'visible' });
        const post = await app.store.get('posts', action.targetId);
        if (post) await indexTopics(app, post);
      }
      if (action.targetType === 'comment') {
        await app.store.update('comments', { id: action.targetId }, { status: 'visible' });
        const comment = await app.store.get('comments', action.targetId);
        if (comment) await app.store.increment('posts', comment.postId, 'commentCount', 1);
      }
      if (action.targetType === 'message') await app.store.update('messages', { id: action.targetId }, { status: 'visible' });
    }
    if (action.action === 'label_ai') await app.store.update('posts', { id: action.targetId }, { origin: 'human' });
    if (action.action === 'suspend') await app.store.update('users', { id: action.userId }, { status: 'active', suspendedUntil: null });
  }
  await app.store.update('moderationActions', { id: actionId }, { appealStatus: overturned ? 'overturned' : 'upheld', appealResolvedAt: app.now() });
  await notify(app, {
    userId: action.userId,
    type: 'appeal',
    text: overturned ? 'Your appeal was accepted and the decision was reversed. Sorry about that.' : 'A second moderator reviewed your appeal and kept the decision.',
  });
}
