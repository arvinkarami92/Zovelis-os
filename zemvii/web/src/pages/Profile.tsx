// Profiles, followers/following lists and Circles.

import { useEffect, useState } from 'react';
import {
  ArrowLeft, Ban, CalendarDays, Coins, Heart, Link2, Lock, MapPin, MessageCircle, MoreHorizontal, Pencil, Plus, Star, Trash2,
  UserMinus, UsersRound, VolumeX,
} from 'lucide-react';
import type { CircleView } from '../../../server/src/services/graph.ts';
import type { PostView, ProfileView, UserSummary } from '../../../server/src/services/views.ts';
import { api, errorMessage } from '../api/client.ts';
import { invalidate, useApi } from '../lib/hooks.ts';
import { back, Link, navigate } from '../lib/router.tsx';
import { useSession } from '../lib/session.tsx';
import { compact, formatMoney } from '../lib/format.ts';
import { SceneArt } from '../art/SceneArt.tsx';
import { PostCard } from '../components/PostCard.tsx';
import { ReportSheet } from '../components/PostSheets.tsx';
import { RichText } from '../components/RichText.tsx';
import { Avatar, Confirm, Empty, ErrorNote, Segmented, Sheet, SkeletonPosts, Spinner, UserRow, VerifiedBadge, useToast } from '../components/ui.tsx';

export function FollowButton({ handle, initial = 'none', onChange }: { handle: string; initial?: 'none' | 'pending' | 'active'; onChange?: (s: 'none' | 'pending' | 'active') => void }) {
  const { me } = useSession();
  const toast = useToast();
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => setState(initial), [initial]);
  if (!me || me.handle === handle) return null;
  const click = async () => {
    setBusy(true);
    try {
      if (state === 'none') {
        const result = await api.post<{ status: 'active' | 'pending' }>(`/users/${handle}/follow`);
        setState(result.status);
        onChange?.(result.status);
        if (result.status === 'pending') toast('Request sent. They need to approve it.');
      } else {
        await api.del(`/users/${handle}/follow`);
        setState('none');
        onChange?.('none');
      }
      invalidate('/feed', '/users/suggested');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <button className={`btn btn-small ${state === 'none' ? 'btn-primary' : 'btn-secondary'}`} disabled={busy} onClick={click}>
      {state === 'none' ? 'Follow' : state === 'pending' ? 'Requested' : 'Following'}
    </button>
  );
}

function SupportSheet({ profile, onClose, onDone }: { profile: ProfileView; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const price = profile.creator.supportPriceCents;
  const join = async () => {
    try {
      await api.post(`/users/${profile.handle}/support`);
      toast(`You're supporting ${profile.name.split(' ')[0]} 💛`);
      onDone();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <Sheet
      title={`Support ${profile.name}`}
      onClose={onClose}
      footer={
        <button className="btn btn-primary" onClick={join}>
          <Star size={16} /> Support for {formatMoney(price)}/month
        </button>
      }
    >
      {profile.creator.supportPerks && (
        <div className="panel">
          <span className="eyebrow">What supporters get</span>
          <p>{profile.creator.supportPerks}</p>
        </div>
      )}
      <div className="dial-summary num">
        <strong>
          {profile.name.split(' ')[0]} receives {formatMoney(Math.round(price * 0.9))} a month
        </strong>
        . Zemvii keeps 10%. Cancel any time.
      </div>
      <p className="muted small">Paid from your wallet's test credits. No real money moves in this version.</p>
      {error && (
        <div className="field-error">
          {error} <Link to="/wallet">Add test credits</Link>
        </div>
      )}
    </Sheet>
  );
}

function CirclePicker({ profile, onClose, onSaved }: { profile: ProfileView; onClose: () => void; onSaved: () => void }) {
  const circles = useApi<{ items: CircleView[] }>('/circles');
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set(profile.relationship?.circleIds ?? []));
  const save = async () => {
    const before = new Set(profile.relationship?.circleIds ?? []);
    for (const c of circles.data?.items ?? []) {
      const was = before.has(c.id);
      const now = selected.has(c.id);
      if (was !== now) await api.post(`/circles/${c.id}/members`, now ? { add: [profile.id] } : { remove: [profile.id] });
    }
    toast('Circles updated');
    onSaved();
    onClose();
  };
  return (
    <Sheet title={`${profile.name.split(' ')[0]} in your circles`} onClose={onClose} footer={<button className="btn btn-primary" onClick={save}>Save</button>}>
      <p className="muted">Circles are private: people never see which of your circles they're in. Posts you share with a circle reach only its members.</p>
      {!circles.data && <Spinner />}
      <div className="list panel panel-flush">
        {circles.data?.items.map((c) => (
          <label key={c.id} className="list-item" htmlFor={`circle-${c.id}`}>
            <span className="circle-emoji" aria-hidden="true">
              {c.emoji}
            </span>
            <span className="grow">
              <strong>{c.name}</strong>
              <span className="muted small"> · {c.members.length} people</span>
            </span>
            <input id={`circle-${c.id}`} type="checkbox" className="switch" checked={selected.has(c.id)} onChange={(e) => setSelected((s) => {
              const next = new Set(s);
              if (e.target.checked) next.add(c.id);
              else next.delete(c.id);
              return next;
            })} />
          </label>
        ))}
      </div>
      <Link to="/circles" className="small">
        Manage circles
      </Link>
    </Sheet>
  );
}

type ProfileSheet = 'more' | 'support' | 'circles' | 'report' | 'block' | 'tip' | null;

export function Profile({ handle }: { handle: string }) {
  const { me } = useSession();
  const toast = useToast();
  const profile = useApi<ProfileView>(`/users/${handle}`);
  const [tab, setTab] = useState<'post' | 'clip'>('post');
  const posts = useApi<{ items: PostView[]; nextCursor: string | null }>(profile.data?.canSeePosts ? `/users/${handle}/posts?kind=${tab}` : null);
  const [sheet, setSheet] = useState<ProfileSheet>(null);
  const p = profile.data;

  if (profile.loading) return <Spinner />;
  if (profile.error || !p) return <Empty title="We couldn't find that person">The account may have been deleted, or the handle is wrong.</Empty>;

  const rel = p.relationship;
  const message = async () => {
    try {
      const chat = await api.post<{ id: string }>('/conversations', { handles: [p.handle] });
      navigate(`/messages/${chat.id}`);
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };
  const simple = async (method: 'post' | 'del', path: string, done: string) => {
    setSheet(null);
    try {
      if (method === 'post') await api.post(path);
      else await api.del(path);
      toast(done);
      void profile.reload();
      invalidate('/feed');
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  return (
    <>
      <div className="profile">
        <div className="profile-cover" style={{ ['--h' as string]: String(p.hue) }}>
          <SceneArt scene={['mountains', 'ocean', 'aurora', 'lake', 'blobs', 'waves'][p.hue % 6]} seed={p.hue * 7 + 3} />
        </div>
        <div className="profile-main">
          <Avatar user={p} size={92} />
          <div className="profile-actions">
            {p.isMe ? (
              <>
                <Link to="/settings/profile" className="btn btn-secondary btn-small">
                  <Pencil size={15} /> Edit profile
                </Link>
                <Link to="/circles" className="btn btn-secondary btn-small">
                  <UsersRound size={15} /> Circles
                </Link>
              </>
            ) : me ? (
              <>
                {rel?.blocked ? (
                  <button className="btn btn-secondary btn-small" onClick={() => simple('del', `/users/${p.handle}/block`, `Unblocked @${p.handle}`)}>
                    Unblock
                  </button>
                ) : (
                  <>
                    <FollowButton handle={p.handle} initial={rel?.following ?? 'none'} onChange={() => void profile.reload()} />
                    <button className="btn btn-secondary btn-small" onClick={message} aria-label="Message">
                      <MessageCircle size={15} /> <span className="hide-narrow">Message</span>
                    </button>
                    {p.creator.supportersEnabled &&
                      (rel?.supporting ? (
                        <button className="btn btn-soft btn-small" onClick={() => simple('del', `/users/${p.handle}/support`, 'Support cancelled')}>
                          <Star size={15} fill="currentColor" /> Supporting
                        </button>
                      ) : (
                        <button className="btn btn-soft btn-small" onClick={() => setSheet('support')}>
                          <Star size={15} /> Support
                        </button>
                      ))}
                  </>
                )}
                <button className="icon-btn" aria-label="More options" onClick={() => setSheet('more')}>
                  <MoreHorizontal size={20} />
                </button>
              </>
            ) : (
              <Link to="/signup" className="btn btn-primary btn-small">
                Join to follow
              </Link>
            )}
          </div>
        </div>
        <div className="profile-info">
          <h1 className="profile-name">
            {p.name} {p.verifiedHuman && <VerifiedBadge />}
          </h1>
          <div className="muted">
            @{p.handle}
            {p.pronouns && ` · ${p.pronouns}`}
            {rel?.followsYou && <span className="pill" style={{ marginLeft: 8 }}>Follows you</span>}
            {rel?.friend && <span className="pill pill-brand" style={{ marginLeft: 6 }}><Heart size={11} /> Friends</span>}
          </div>
          {p.bio && (
            <p className="profile-bio">
              <RichText text={p.bio} />
            </p>
          )}
          <div className="profile-facts muted small">
            {p.location && (
              <span>
                <MapPin size={14} /> {p.location}
              </span>
            )}
            {p.website && (
              <a href={p.website} target="_blank" rel="noopener noreferrer nofollow">
                <Link2 size={14} /> {p.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
              </a>
            )}
            <span>
              <CalendarDays size={14} /> Joined {new Date(p.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </span>
          </div>
          <div className="profile-counts num">
            {p.counts.followers !== null ? (
              <>
                <Link to={`/u/${p.handle}/followers`}>
                  <strong>{compact(p.counts.followers)}</strong> followers
                </Link>
                <Link to={`/u/${p.handle}/following`}>
                  <strong>{compact(p.counts.following ?? 0)}</strong> following
                </Link>
              </>
            ) : (
              <span className="muted">Connections are private</span>
            )}
            <span>
              <strong>{compact(p.counts.posts)}</strong> posts
            </span>
            {p.isMe && p.creator.supporters !== null && p.creator.supporters > 0 && (
              <Link to="/creator">
                <strong>{p.creator.supporters}</strong> supporters
              </Link>
            )}
          </div>
        </div>
      </div>

      {!p.canSeePosts ? (
        <Empty icon={<Lock size={26} />} title={rel?.blocked ? `You blocked @${p.handle}` : 'This account is private'}>
          {rel?.blocked ? 'Unblock to see their posts again.' : 'Follow to send a request. If they approve, you will see their posts.'}
        </Empty>
      ) : (
        <>
          <Segmented label="Posts" value={tab} onChange={setTab} options={[{ value: 'post', label: 'Posts' }, { value: 'clip', label: 'Clips' }]} />
          {posts.loading && <SkeletonPosts />}
          <ErrorNote error={posts.error} />
          {posts.data?.items.length === 0 && <Empty title={tab === 'clip' ? 'No clips yet' : 'No posts yet'}>{p.isMe ? 'Share something with your people.' : 'Nothing to see here yet.'}</Empty>}
          <div className="feed">
            {posts.data?.items.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        </>
      )}

      {sheet === 'more' && rel && (
        <Sheet title={`@${p.handle}`} onClose={() => setSheet(null)}>
          <div className="list panel panel-flush">
            <button className="list-item" onClick={() => setSheet('circles')}>
              <UsersRound size={18} /> Add to a circle
            </button>
            {p.creator.tipsEnabled && (
              <button
                className="list-item"
                onClick={async () => {
                  setSheet(null);
                  try {
                    await api.post('/tips', { handle: p.handle, amountCents: 300, note: '' });
                    toast(`Sent $3.00 to ${p.name.split(' ')[0]}. They keep $2.70.`);
                  } catch (e) {
                    toast(errorMessage(e), 'error');
                  }
                }}
              >
                <Coins size={18} /> Send a $3 tip
              </button>
            )}
            {rel.followsYou && (
              <button className="list-item" onClick={() => simple('del', `/users/${p.handle}/follower`, `@${p.handle} no longer follows you`)}>
                <UserMinus size={18} /> Remove follower
              </button>
            )}
            <button className="list-item" onClick={() => simple(rel.muted ? 'del' : 'post', `/users/${p.handle}/mute`, rel.muted ? 'Unmuted' : "Muted. They won't know.")}>
              <VolumeX size={18} /> {rel.muted ? 'Unmute' : 'Mute'} @{p.handle}
            </button>
            {!rel.blocked && (
              <button className="list-item" onClick={() => setSheet('block')}>
                <Ban size={18} /> Block @{p.handle}
              </button>
            )}
            <button className="list-item" onClick={() => setSheet('report')}>
              <Trash2 size={18} /> Report @{p.handle}
            </button>
          </div>
        </Sheet>
      )}
      {sheet === 'support' && <SupportSheet profile={p} onClose={() => setSheet(null)} onDone={() => void profile.reload()} />}
      {sheet === 'circles' && <CirclePicker profile={p} onClose={() => setSheet(null)} onSaved={() => void profile.reload()} />}
      {sheet === 'report' && <ReportSheet targetType="user" targetId={p.id} handle={p.handle} onClose={() => setSheet(null)} />}
      {sheet === 'block' && (
        <Confirm
          title={`Block @${p.handle}?`}
          body="They won't be able to see your profile, find your posts, follow you or message you. They won't be notified."
          confirm="Block"
          danger
          onClose={() => setSheet(null)}
          onConfirm={() => simple('post', `/users/${p.handle}/block`, `Blocked @${p.handle}`)}
        />
      )}
    </>
  );
}

export function Connections({ handle, direction }: { handle: string; direction: 'followers' | 'following' }) {
  const list = useApi<{ items: UserSummary[] }>(`/users/${handle}/${direction}`);
  return (
    <>
      <div className="page-head">
        <button className="icon-btn back-btn" onClick={() => back(`/u/${handle}`)} aria-label="Back">
          <ArrowLeft size={22} />
        </button>
        <h1>
          {direction === 'followers' ? 'Followers' : 'Following'} <span className="muted">@{handle}</span>
        </h1>
      </div>
      {list.loading && <Spinner />}
      {list.error && <Empty icon={<Lock size={24} />} title="This list is private">{list.error.message}</Empty>}
      {list.data && (
        <div className="panel">
          {list.data.items.length === 0 && <p className="muted">Nobody yet.</p>}
          {list.data.items.map((u) => (
            <UserRow key={u.id} user={u} />
          ))}
        </div>
      )}
    </>
  );
}

export function CirclesPage() {
  const { me } = useSession();
  const toast = useToast();
  const circles = useApi<{ items: CircleView[] }>('/circles');
  const following = useApi<{ items: UserSummary[] }>(me ? `/users/${me.handle}/following` : null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('⭐');
  const [editing, setEditing] = useState<CircleView | null>(null);
  const [deleting, setDeleting] = useState<CircleView | null>(null);

  const create = async () => {
    try {
      await api.post('/circles', { name, emoji });
      setCreating(false);
      setName('');
      void circles.reload();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };
  const toggleMember = async (circle: CircleView, user: UserSummary) => {
    const inIt = circle.members.some((m) => m.id === user.id);
    await api.post(`/circles/${circle.id}/members`, inIt ? { remove: [user.id] } : { add: [user.id] });
    void circles.reload();
    setEditing((c) => (c ? { ...c, members: inIt ? c.members.filter((m) => m.id !== user.id) : [...c.members, user] } : c));
  };
  const chat = async (circle: CircleView) => {
    try {
      const result = await api.post<{ id: string }>(`/circles/${circle.id}/chat`);
      navigate(`/messages/${result.id}`);
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  return (
    <>
      <div className="page-head">
        <h1>Circles</h1>
        <button className="btn btn-primary btn-small" onClick={() => setCreating(true)}>
          <Plus size={16} /> New circle
        </button>
      </div>
      <p className="muted">
        Circles are your private lists of people: close friends, family, your team. Share a post with just one circle, invite a circle to a plan,
        or start a group chat with it. Nobody sees your circles but you.
      </p>
      {circles.loading && <Spinner />}
      <div className="stack">
        {circles.data?.items.map((c) => (
          <div key={c.id} className="panel circle-card">
            <div className="row-between">
              <h2>
                <span aria-hidden="true">{c.emoji}</span> {c.name}
              </h2>
              <span className="muted small num">{c.members.length} people</span>
            </div>
            <div className="avatar-stack">
              {c.members.slice(0, 10).map((m) => (
                <Avatar key={m.id} user={m} size={32} />
              ))}
            </div>
            <div className="row">
              <button className="btn btn-secondary btn-small" onClick={() => setEditing(c)}>
                Edit people
              </button>
              {c.members.length > 0 && (
                <button className="btn btn-ghost btn-small" onClick={() => chat(c)}>
                  <MessageCircle size={15} /> Group chat
                </button>
              )}
              <button className="btn btn-ghost btn-small" onClick={() => setDeleting(c)}>
                <Trash2 size={15} /> Delete
              </button>
            </div>
          </div>
        ))}
      </div>
      {creating && (
        <Sheet title="New circle" onClose={() => setCreating(false)} footer={<button className="btn btn-primary" disabled={!name.trim()} onClick={create}>Create</button>}>
          <div className="form-grid">
            <label className="field">
              <span>Name</span>
              <input id="circle-name" className="input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="Team, Book club, Neighbours…" />
            </label>
            <div className="field">
              <span className="field-label">Emoji</span>
              <div className="chips">
                {['⭐', '💛', '🏡', '💼', '🎓', '🏃', '📚', '🎮', '🌱', '🎶'].map((e) => (
                  <button key={e} className="chip" aria-pressed={emoji === e} onClick={() => setEmoji(e)}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Sheet>
      )}
      {editing && (
        <Sheet title={`${editing.emoji} ${editing.name}`} onClose={() => setEditing(null)}>
          <p className="muted">Tap people you follow to add or remove them.</p>
          {!following.data && <Spinner />}
          <div className="list panel panel-flush">
            {following.data?.items.map((u) => {
              const inIt = editing.members.some((m) => m.id === u.id);
              return (
                <button key={u.id} className="list-item" onClick={() => void toggleMember(editing, u)} aria-pressed={inIt}>
                  <Avatar user={u} size={36} />
                  <span className="grow">{u.name}</span>
                  {inIt ? <span className="pill pill-brand">In circle</span> : <span className="pill">Add</span>}
                </button>
              );
            })}
          </div>
        </Sheet>
      )}
      {deleting && (
        <Confirm
          title={`Delete ${deleting.name}?`}
          body="Posts you shared with this circle will become visible only to you."
          confirm="Delete circle"
          danger
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await api.del(`/circles/${deleting.id}`);
            setDeleting(null);
            void circles.reload();
          }}
        />
      )}
    </>
  );
}
