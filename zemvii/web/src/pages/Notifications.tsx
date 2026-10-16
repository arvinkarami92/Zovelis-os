// Notifications, follow requests and recovery requests. In digest mode,
// non-urgent notifications arrive in a few bundles a day.

import { useEffect, useState } from 'react';
import { AtSign, Bell, CalendarHeart, Coins, Heart, KeyRound, MessageCircle, NotebookPen, ShieldCheck, Sparkles, Star, UserPlus, UsersRound } from 'lucide-react';
import type { NotificationList } from '../../../server/src/services/notify.ts';
import type { NotificationView, UserSummary } from '../../../server/src/services/views.ts';
import { api, errorMessage } from '../api/client.ts';
import { useApi } from '../lib/hooks.ts';
import { Link } from '../lib/router.tsx';
import { useSession } from '../lib/session.tsx';
import { clock, timeAgo } from '../lib/format.ts';
import { Avatar, Empty, ErrorNote, Spinner, UserRow, useToast } from '../components/ui.tsx';

const ICONS: Partial<Record<NotificationView['type'], typeof Bell>> = {
  follow: UserPlus, follow_request: UserPlus, follow_accepted: UserPlus, reaction: Heart, comment: MessageCircle, reply: MessageCircle,
  mention: AtSign, tip: Coins, support: Star, plan_invite: CalendarHeart, plan_rsvp: CalendarHeart, space_join: UsersRound,
  note: NotebookPen, moderation: ShieldCheck, appeal: ShieldCheck, recovery_request: KeyRound, recovery_approved: KeyRound, system: Sparkles,
};

function target(n: NotificationView): string | null {
  if (n.type === 'moderation' || n.type === 'appeal') return '/status';
  if (n.postId) return `/p/${n.postId}`;
  if (n.planId) return `/plans/${n.planId}`;
  if (n.spaceSlug) return `/spaces/${n.spaceSlug}`;
  if (n.actor && (n.type === 'follow' || n.type === 'follow_accepted' || n.type === 'support')) return `/u/${n.actor.handle}`;
  return null;
}

function group(ms: number): string {
  const days = (Date.now() - ms) / 86_400_000;
  if (new Date(ms).toDateString() === new Date().toDateString()) return 'Today';
  if (days < 7) return 'This week';
  return 'Earlier';
}

interface RecoveryRequest {
  id: string;
  user: UserSummary;
  approvals: number;
  expiresAt: number;
  approvedByMe: boolean;
}

export function Notifications() {
  const { refresh, me } = useSession();
  const toast = useToast();
  const list = useApi<NotificationList>('/notifications');
  const requests = useApi<{ items: UserSummary[] }>('/me/follow-requests');
  const recovery = useApi<{ items: RecoveryRequest[] }>('/recovery/requests');
  const [answered, setAnswered] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!list.data?.unread) return;
    const id = setTimeout(() => void api.post('/notifications/read', {}).then(() => refresh()), 1500);
    return () => clearTimeout(id);
  }, [list.data?.unread]);

  const deliver = async () => {
    await api.post('/notifications/deliver-now');
    await list.reload();
    void refresh();
  };
  const answerFollow = async (handle: string, accept: boolean) => {
    try {
      await api.post(`/me/follow-requests/${handle}`, { accept });
      setAnswered((s) => new Set(s).add(handle));
      toast(accept ? `@${handle} can now see your posts` : 'Request declined');
      void refresh();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };
  const vouch = async (r: RecoveryRequest) => {
    try {
      const result = await api.post<{ approvals: number }>(`/recovery/requests/${r.id}/approve`);
      toast(`You vouched for ${r.user.name.split(' ')[0]} (${result.approvals} of 2)`);
      void recovery.reload();
      void refresh();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  const items = list.data?.items ?? [];
  const groups = new Map<string, NotificationView[]>();
  for (const n of items) groups.set(group(n.createdAt), [...(groups.get(group(n.createdAt)) ?? []), n]);
  const pendingFollows = (requests.data?.items ?? []).filter((u) => !answered.has(u.handle));

  return (
    <>
      <div className="page-head">
        <h1>Notifications</h1>
        <Link to="/settings/notifications" className="btn btn-ghost btn-small">
          Settings
        </Link>
      </div>

      {list.data && list.data.waiting > 0 && (
        <div className="digest-banner">
          <Bell size={18} />
          <span className="grow">
            <strong>{list.data.waiting} waiting</strong> for your {list.data.nextDigestAt ? `${clock(list.data.nextDigestAt)} ` : ''}digest. Messages from friends
            always come through right away.
          </span>
          <button className="btn btn-small btn-secondary" onClick={deliver}>
            Show them now
          </button>
        </div>
      )}

      {(recovery.data?.items ?? []).map((r) => (
        <div key={r.id} className="panel recovery-card">
          <div className="row">
            <KeyRound size={20} />
            <h2 className="grow">{r.user.name} asked you to vouch</h2>
          </div>
          <p className="small">
            {r.user.name.split(' ')[0]} is locked out and chose you as a recovery friend. <strong>Call or meet them first</strong> to make sure it's really
            them asking. Two friends need to vouch.
          </p>
          <div className="row-between">
            <span className="muted small num">
              {r.approvals} of 2 have vouched · expires in {Math.max(1, Math.round((r.expiresAt - Date.now()) / 3_600_000))} h
            </span>
            {r.approvedByMe ? (
              <span className="pill pill-brand">You vouched</span>
            ) : (
              <button className="btn btn-primary btn-small" onClick={() => vouch(r)}>
                I checked with them. Vouch
              </button>
            )}
          </div>
        </div>
      ))}

      {pendingFollows.length > 0 && (
        <section className="panel">
          <h2>Follow requests</h2>
          {pendingFollows.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              action={
                <div className="row">
                  <button className="btn btn-primary btn-small" onClick={() => answerFollow(u.handle, true)}>
                    Accept
                  </button>
                  <button className="btn btn-ghost btn-small" onClick={() => answerFollow(u.handle, false)}>
                    Decline
                  </button>
                </div>
              }
            />
          ))}
        </section>
      )}

      {list.loading && <Spinner />}
      <ErrorNote error={list.error} retry={list.reload} />
      {list.data && items.length === 0 && (
        <Empty icon={<Bell size={26} />} title="Nothing new">
          {me?.settings.wellbeing.notifications === 'digest' ? 'Non-urgent notifications arrive in your next digest.' : "You're all caught up."}
        </Empty>
      )}
      {[...groups.entries()].map(([label, notes]) => (
        <section key={label} className="section">
          <span className="eyebrow">{label}</span>
          <div className="panel panel-flush list">
            {notes.map((n) => {
              const Icon = ICONS[n.type] ?? Bell;
              const to = target(n);
              const body = (
                <>
                  <span className={`notif-icon notif-${n.type}`}>
                    <Icon size={16} />
                  </span>
                  {n.actor && <Avatar user={n.actor} size={36} />}
                  <span className="grow notif-text">
                    {n.text}
                    <span className="muted small"> · {timeAgo(n.createdAt)}</span>
                  </span>
                  {!n.read && <span className="unread-dot" aria-label="Unread" />}
                </>
              );
              return to ? (
                <Link key={n.id} to={to} className="list-item">
                  {body}
                </Link>
              ) : (
                <div key={n.id} className="list-item">
                  {body}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
