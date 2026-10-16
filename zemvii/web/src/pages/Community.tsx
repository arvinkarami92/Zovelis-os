// Spaces (communities) and Plans (meetups).

import { useState, type FormEvent } from 'react';
import { ArrowLeft, CalendarPlus, Globe, Lock, MapPin, Plus, Send, UsersRound } from 'lucide-react';
import type { CircleView } from '../../../server/src/services/graph.ts';
import type { PlanDetail, SpaceDetail } from '../../../server/src/services/community.ts';
import type { ConversationView, PlanView, PostView, SpaceView } from '../../../server/src/services/views.ts';
import { api, errorMessage } from '../api/client.ts';
import { invalidate, useApi } from '../lib/hooks.ts';
import { back, Link, navigate, useRoute } from '../lib/router.tsx';
import { useSession } from '../lib/session.tsx';
import { dateBlock, fromLocalInput, planWhen, toLocalInput } from '../lib/format.ts';
import { PostCard } from '../components/PostCard.tsx';
import { Composer } from '../components/Composer.tsx';
import { ReportSheet } from '../components/PostSheets.tsx';
import { Avatar, Confirm, Empty, ErrorNote, Segmented, Sheet, SkeletonPosts, Spinner, UserRow, useToast } from '../components/ui.tsx';

// ---- Plans -------------------------------------------------------------------------

export function PlanCard({ plan: initial, compact }: { plan: PlanView; compact?: boolean }) {
  const { me } = useSession();
  const toast = useToast();
  const [plan, setPlan] = useState(initial);
  const d = dateBlock(plan.startsAt);
  const past = plan.startsAt < Date.now() - 3 * 3_600_000;
  const rsvp = async (status: 'going' | 'maybe' | 'no') => {
    if (!me) return navigate('/login');
    try {
      setPlan(await api.post<PlanView>(`/plans/${plan.id}/rsvp`, { status }));
      invalidate('/plans');
      if (status === 'going') toast(`You're going to ${plan.title} 🎉`);
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };
  return (
    <article className={`plan-card${plan.cancelled ? ' is-cancelled' : ''}${compact ? ' is-compact' : ''}`} style={{ ['--h' as string]: String(plan.hue) }}>
      <Link to={`/plans/${plan.id}`} className="plan-date" aria-hidden="true" tabIndex={-1}>
        <span className="plan-month">{d.month}</span>
        <span className="plan-day">{d.day}</span>
        <span className="plan-weekday">{d.weekday}</span>
      </Link>
      <div className="plan-body">
        <Link to={`/plans/${plan.id}`} className="plan-title">
          <span aria-hidden="true">{plan.emoji}</span> {plan.title}
        </Link>
        <div className="plan-meta muted small">
          <span>{planWhen(plan.startsAt)}</span>
          {plan.location && (
            <span>
              <MapPin size={13} /> {plan.location}
            </span>
          )}
        </div>
        <div className="plan-people small">
          {plan.friendsGoing.length > 0 && (
            <span className="avatar-stack">
              {plan.friendsGoing.slice(0, 4).map((u) => (
                <Avatar key={u.id} user={u} size={22} />
              ))}
            </span>
          )}
          <span className="num">
            {plan.goingCount} going{plan.capacity ? ` · ${Math.max(0, plan.capacity - plan.goingCount)} spots left` : ''}
          </span>
          {plan.cancelled && <span className="pill pill-danger">Cancelled</span>}
        </div>
        {!compact && !plan.cancelled && !past && !plan.isHost && me && (
          <div className="rsvp" role="group" aria-label="RSVP">
            {(['going', 'maybe', 'no'] as const).map((s) => (
              <button key={s} className="chip" aria-pressed={plan.myRsvp === s} onClick={() => rsvp(s)}>
                {s === 'going' ? 'Going' : s === 'maybe' ? 'Maybe' : "Can't go"}
              </button>
            ))}
          </div>
        )}
        {plan.isHost && !compact && <span className="pill pill-brand">You're hosting</span>}
      </div>
    </article>
  );
}

export function Plans() {
  const [scope, setScope] = useState<'upcoming' | 'mine' | 'past'>('upcoming');
  const plans = useApi<{ items: PlanView[] }>(`/plans?scope=${scope}`);
  return (
    <>
      <div className="page-head">
        <h1>Plans</h1>
        <Link to="/plans/new" className="btn btn-primary btn-small">
          <CalendarPlus size={16} /> New plan
        </Link>
      </div>
      <p className="muted">Turn chats into real meetups. Plans from friends, your circles and your spaces show up here.</p>
      <Segmented
        label="Plans"
        value={scope}
        onChange={setScope}
        options={[
          { value: 'upcoming', label: 'Upcoming' },
          { value: 'mine', label: 'Mine' },
          { value: 'past', label: 'Memories' },
        ]}
      />
      {plans.loading && <Spinner />}
      <ErrorNote error={plans.error} retry={plans.reload} />
      {plans.data?.items.length === 0 && (
        <Empty icon={<CalendarPlus size={26} />} title={scope === 'past' ? 'No memories yet' : 'No plans yet'} action={<Link to="/plans/new" className="btn btn-primary">Make a plan</Link>}>
          A walk, a coffee, a game night. Invite your friends or a circle.
        </Empty>
      )}
      <div className="stack">
        {plans.data?.items.map((p) => (
          <PlanCard key={p.id} plan={p} />
        ))}
      </div>
    </>
  );
}

function ShareToChat({ plan, onClose }: { plan: PlanView; onClose: () => void }) {
  const chats = useApi<{ items: ConversationView[] }>('/conversations');
  const toast = useToast();
  const share = async (c: ConversationView) => {
    try {
      await api.post(`/conversations/${c.id}/messages`, { planId: plan.id, text: '' });
      toast(`Shared with ${c.title}`);
      onClose();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };
  return (
    <Sheet title="Share to a chat" onClose={onClose}>
      {!chats.data && <Spinner />}
      <div className="list panel panel-flush">
        {chats.data?.items
          .filter((c) => c.accepted)
          .map((c) => (
            <button key={c.id} className="list-item" onClick={() => share(c)}>
              <Send size={16} /> <span className="grow">{c.title}</span>
            </button>
          ))}
      </div>
    </Sheet>
  );
}

export function PlanPage({ id }: { id: string }) {
  const { me } = useSession();
  const toast = useToast();
  const detail = useApi<PlanDetail>(`/plans/${id}`);
  const [share, setShare] = useState(false);
  const [cancel, setCancel] = useState(false);
  const [report, setReport] = useState(false);
  const d = detail.data;
  if (detail.loading) return <Spinner />;
  if (!d) return <Empty title="This plan isn't available">It may be for a group you're not in, or it was removed.</Empty>;
  const plan = d.plan;
  const past = plan.startsAt < Date.now() - 3 * 3_600_000;
  const went = plan.isHost || plan.myRsvp === 'going';
  const audience = plan.audience === 'public' ? 'Anyone' : plan.audience === 'friends' ? `${plan.host.name.split(' ')[0]}'s friends` : plan.audience === 'circle' ? (plan.circle ? `Circle: ${plan.circle.name}` : 'A circle') : `Space: ${plan.space?.name ?? ''}`;
  return (
    <>
      <div className="page-head">
        <button className="icon-btn back-btn" onClick={() => back('/plans')} aria-label="Back">
          <ArrowLeft size={22} />
        </button>
        <h1>Plan</h1>
      </div>
      <div className="plan-hero" style={{ ['--h' as string]: String(plan.hue) }}>
        <span className="plan-hero-emoji" aria-hidden="true">
          {plan.emoji}
        </span>
        <div className="stack" style={{ gap: 6 }}>
          <h2 className="plan-hero-title">{plan.title}</h2>
          <span>{planWhen(plan.startsAt)}</span>
          {plan.location && (
            <span>
              <MapPin size={14} /> {plan.location}
            </span>
          )}
        </div>
      </div>
      {plan.cancelled && <div className="error-note">This plan was cancelled.</div>}
      <PlanCard plan={plan} />
      {plan.description && <p className="plan-description">{plan.description}</p>}
      <div className="row small muted">
        <span>Hosted by</span>
        <Link to={`/u/${plan.host.handle}`} className="row" style={{ gap: 6 }}>
          <Avatar user={plan.host} size={22} /> {plan.host.name}
        </Link>
        <span>· Who's invited: {audience}</span>
      </div>
      <div className="row">
        {me && !plan.cancelled && (
          <button className="btn btn-secondary btn-small" onClick={() => setShare(true)}>
            <Send size={15} /> Share to a chat
          </button>
        )}
        {plan.isHost && !plan.cancelled && !past && (
          <button className="btn btn-danger-soft btn-small" onClick={() => setCancel(true)}>
            Cancel plan
          </button>
        )}
        {me && !plan.isHost && (
          <button className="btn btn-ghost btn-small" onClick={() => setReport(true)}>
            Report
          </button>
        )}
      </div>
      <section className="panel">
        <h2>Going ({d.going.length})</h2>
        {d.going.map((u) => (
          <UserRow key={u.id} user={u} />
        ))}
        {d.maybe.length > 0 && (
          <>
            <span className="eyebrow">Maybe</span>
            {d.maybe.map((u) => (
              <UserRow key={u.id} user={u} />
            ))}
          </>
        )}
      </section>
      <section className="section">
        <div className="section-head">
          <h2>Memories</h2>
          <span className="muted small">Photos and notes from people who went</span>
        </div>
        {went && (past || plan.startsAt < Date.now()) && <Composer compact defaults={{ planId: plan.id, planTitle: plan.title }} onPosted={() => void detail.reload()} />}
        {d.memories.length === 0 && <p className="muted">{past ? 'No memories shared yet.' : 'After the plan, people who went can add photos here.'}</p>}
        <div className="feed">
          {d.memories.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
        </div>
      </section>
      {share && <ShareToChat plan={plan} onClose={() => setShare(false)} />}
      {report && <ReportSheet targetType="plan" targetId={plan.id} handle={plan.host.handle} onClose={() => setReport(false)} />}
      {cancel && (
        <Confirm
          title="Cancel this plan?"
          body="Everyone who said they're going or might come will be told right away."
          confirm="Cancel plan"
          danger
          onClose={() => setCancel(false)}
          onConfirm={async () => {
            await api.post(`/plans/${plan.id}/cancel`);
            setCancel(false);
            toast('Plan cancelled. Attendees were told.');
            void detail.reload();
            invalidate('/plans');
          }}
        />
      )}
    </>
  );
}

const PLAN_EMOJI = ['📅', '☕', '🥾', '🍕', '🎲', '🎬', '🏃', '🎸', '🌱', '🧺', '🌠', '✏️'];

export function NewPlan() {
  const { me } = useSession();
  const { query } = useRoute();
  const chatId = query.get('chat');
  const toast = useToast();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(18, 0, 0, 0);
  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState('📅');
  const [when, setWhen] = useState(toLocalInput(tomorrow.getTime()));
  const [hours, setHours] = useState(2);
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [audience, setAudience] = useState<'friends' | 'circle' | 'space' | 'public'>('friends');
  const [circleId, setCircleId] = useState('');
  const [spaceId, setSpaceId] = useState('');
  const [capacity, setCapacity] = useState('');
  const [error, setError] = useState<string | null>(null);
  const circles = useApi<{ items: CircleView[] }>(audience === 'circle' ? '/circles' : null);
  const spaces = useApi<{ items: SpaceView[] }>(audience === 'space' ? '/spaces?mine=1' : null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const startsAt = fromLocalInput(when);
      const plan = await api.post<PlanView>('/plans', {
        title, emoji, startsAt, endsAt: startsAt + hours * 3_600_000, location, description, audience,
        circleId: audience === 'circle' ? circleId : undefined, spaceId: audience === 'space' ? spaceId : undefined,
        capacity: capacity ? Number(capacity) : undefined,
      });
      invalidate('/plans');
      if (chatId) {
        await api.post(`/conversations/${chatId}/messages`, { planId: plan.id, text: '' });
        navigate(`/messages/${chatId}`, { replace: true });
      } else navigate(`/plans/${plan.id}`, { replace: true });
      toast('Plan created');
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <>
      <div className="page-head">
        <button className="icon-btn back-btn" onClick={() => back('/plans')} aria-label="Back">
          <ArrowLeft size={22} />
        </button>
        <h1>New plan</h1>
      </div>
      {chatId && <div className="info-note">We'll share this plan in your chat when you create it.</div>}
      <form className="form-grid panel" onSubmit={submit}>
        <label className="field">
          <span>What's the plan?</span>
          <input id="plan-title" className="input" maxLength={80} required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sunday walk and brunch" />
        </label>
        <div className="field">
          <span className="field-label">Icon</span>
          <div className="chips">
            {PLAN_EMOJI.map((e) => (
              <button type="button" key={e} className="chip" aria-pressed={emoji === e} onClick={() => setEmoji(e)}>
                {e}
              </button>
            ))}
          </div>
        </div>
        <div className="form-grid two">
          <label className="field">
            <span>When</span>
            <input id="plan-when" className="input" type="datetime-local" required value={when} onChange={(e) => setWhen(e.target.value)} />
          </label>
          <label className="field">
            <span>How long</span>
            <select id="plan-hours" className="select" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
              {[1, 2, 3, 4, 6, 8].map((h) => (
                <option key={h} value={h}>
                  {h} hour{h === 1 ? '' : 's'}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span>Where</span>
          <input id="plan-where" className="input" maxLength={120} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="A public place is best for new groups" />
        </label>
        <label className="field">
          <span>Details</span>
          <textarea id="plan-details" className="textarea" maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What to bring, where to meet…" />
        </label>
        <div className="field">
          <span className="field-label">Who's invited</span>
          <div className="chips" role="radiogroup" aria-label="Who's invited">
            {(['friends', 'circle', 'space', ...(me?.teen ? [] : ['public'])] as const).map((a) => (
              <button type="button" key={a} role="radio" aria-checked={audience === a} className="chip" aria-pressed={audience === a} onClick={() => setAudience(a as typeof audience)}>
                {a === 'friends' ? 'Friends' : a === 'circle' ? 'A circle' : a === 'space' ? 'A space' : 'Anyone'}
              </button>
            ))}
          </div>
          {audience === 'circle' && (
            <select id="plan-circle" className="select" value={circleId} onChange={(e) => setCircleId(e.target.value)} required>
              <option value="">Choose a circle…</option>
              {circles.data?.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji} {c.name}
                </option>
              ))}
            </select>
          )}
          {audience === 'space' && (
            <select id="plan-space" className="select" value={spaceId} onChange={(e) => setSpaceId(e.target.value)} required>
              <option value="">Choose a space…</option>
              {spaces.data?.items.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.emoji} {s.name}
                </option>
              ))}
            </select>
          )}
          {me?.teen && <span className="field-help">Plans from teen accounts are for friends, circles and spaces.</span>}
        </div>
        <label className="field">
          <span>Spots (optional)</span>
          <input id="plan-capacity" className="input" type="number" min={2} max={10000} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
        </label>
        {error && <div className="field-error">{error}</div>}
        <button className="btn btn-primary" disabled={!title.trim()}>
          Create plan
        </button>
      </form>
    </>
  );
}

// ---- Spaces --------------------------------------------------------------------------

export function SpaceCard({ space }: { space: SpaceView }) {
  return (
    <Link to={`/spaces/${space.slug}`} className="space-card" style={{ ['--h' as string]: String(space.hue) }}>
      <span className="space-emoji" aria-hidden="true">
        {space.emoji}
      </span>
      <span className="space-card-body">
        <strong>{space.name}</strong>
        <span className="muted small num">
          {space.visibility === 'private' ? <Lock size={12} /> : <Globe size={12} />} {space.memberCount} members{space.location ? ` · ${space.location}` : ''}
        </span>
        <span className="space-desc small">{space.description}</span>
      </span>
      {space.myRole && <span className="pill pill-brand">Joined</span>}
    </Link>
  );
}

export function Spaces() {
  const [tab, setTab] = useState<'all' | 'mine'>('all');
  const [q, setQ] = useState('');
  const spaces = useApi<{ items: SpaceView[] }>(tab === 'mine' ? '/spaces?mine=1' : `/spaces${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  return (
    <>
      <div className="page-head">
        <h1>Spaces</h1>
        <Link to="/spaces/new" className="btn btn-primary btn-small">
          <Plus size={16} /> New space
        </Link>
      </div>
      <p className="muted">Communities with their own rules and moderators: clubs, neighbourhoods, hobbies.</p>
      <Segmented label="Spaces" value={tab} onChange={setTab} options={[{ value: 'all', label: 'Explore' }, { value: 'mine', label: 'Joined' }]} />
      {tab === 'all' && (
        <input id="space-search" className="input" type="search" placeholder="Search spaces" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search spaces" />
      )}
      {spaces.loading && <Spinner />}
      <ErrorNote error={spaces.error} />
      {spaces.data?.items.length === 0 && <Empty icon={<UsersRound size={26} />} title="No spaces here yet">Start one for your club, street or hobby.</Empty>}
      <div className="space-grid">
        {spaces.data?.items.map((s) => (
          <SpaceCard key={s.id} space={s} />
        ))}
      </div>
    </>
  );
}

export function SpacePage({ slug }: { slug: string }) {
  const { me } = useSession();
  const toast = useToast();
  const detail = useApi<SpaceDetail>(`/spaces/${slug}`);
  const posts = useApi<{ items: PostView[] }>(detail.data?.canSeeInside ? `/spaces/${slug}/posts` : null);
  const [leave, setLeave] = useState(false);
  const d = detail.data;
  if (detail.loading) return <Spinner />;
  if (!d) return <Empty title="No such space">It may have been renamed or removed.</Empty>;
  const s = d.space;
  const join = async () => {
    if (!me) return navigate('/login');
    try {
      await api.post(`/spaces/${slug}/join`);
      toast(`Welcome to ${s.name}`);
      void detail.reload();
      invalidate('/spaces', '/feed');
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };
  return (
    <>
      <div className="page-head">
        <button className="icon-btn back-btn" onClick={() => back('/spaces')} aria-label="Back">
          <ArrowLeft size={22} />
        </button>
        <h1>Space</h1>
      </div>
      <header className="space-hero" style={{ ['--h' as string]: String(s.hue) }}>
        <span className="space-hero-emoji" aria-hidden="true">
          {s.emoji}
        </span>
        <div className="grow stack" style={{ gap: 6 }}>
          <h2>{s.name}</h2>
          <span className="small num">
            {s.visibility === 'private' ? 'Private' : 'Public'} · {s.memberCount} members{s.location ? ` · ${s.location}` : ''}
          </span>
        </div>
        {s.myRole === null ? (
          s.visibility === 'public' && (
            <button className="btn btn-primary btn-small" onClick={join}>
              Join
            </button>
          )
        ) : s.myRole !== 'owner' ? (
          <button className="btn btn-secondary btn-small" onClick={() => setLeave(true)}>
            Joined
          </button>
        ) : (
          <span className="pill pill-brand">You run this space</span>
        )}
      </header>
      {s.description && <p>{s.description}</p>}
      {s.topics.length > 0 && (
        <div className="chips">
          {s.topics.map((t) => (
            <Link key={t} to={`/t/${t}`} className="chip">
              #{t}
            </Link>
          ))}
        </div>
      )}
      {!d.canSeeInside ? (
        <Empty icon={<Lock size={24} />} title="This space is private">Ask one of its moderators to add you.</Empty>
      ) : (
        <>
          <section className="panel">
            <h2>Rules</h2>
            <ol className="rules">
              {s.rules.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ol>
            <div className="avatar-stack">
              {d.members.slice(0, 12).map((m) => (
                <Avatar key={m.id} user={m} size={30} />
              ))}
            </div>
          </section>
          {d.plans.length > 0 && (
            <section className="section">
              <h2>Upcoming plans</h2>
              {d.plans.map((p) => (
                <PlanCard key={p.id} plan={p} />
              ))}
            </section>
          )}
          {s.myRole && <Composer compact defaults={{ spaceId: s.id, spaceName: s.name }} onPosted={() => void posts.reload()} />}
          {posts.loading && <SkeletonPosts />}
          {posts.data?.items.length === 0 && <p className="muted">No posts yet. Start the conversation.</p>}
          <div className="feed">
            {posts.data?.items.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        </>
      )}
      {leave && (
        <Confirm
          title={`Leave ${s.name}?`}
          body="You can join again any time."
          confirm="Leave"
          onClose={() => setLeave(false)}
          onConfirm={async () => {
            await api.del(`/spaces/${slug}/join`);
            setLeave(false);
            void detail.reload();
            invalidate('/spaces', '/feed');
          }}
        />
      )}
    </>
  );
}

export function NewSpace() {
  const { meta } = useSession();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🌿');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [topics, setTopics] = useState<string[]>([]);
  const [location, setLocation] = useState('');
  const [rules, setRules] = useState('Be kind. Disagree with ideas, not people.\nNo spam or self-promotion without asking.');
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const space = await api.post<SpaceView>('/spaces', { name, emoji, description, visibility, topics, location, rules: rules.split('\n').map((r) => r.trim()).filter(Boolean) });
      invalidate('/spaces');
      navigate(`/spaces/${space.slug}`, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <>
      <div className="page-head">
        <button className="icon-btn back-btn" onClick={() => back('/spaces')} aria-label="Back">
          <ArrowLeft size={22} />
        </button>
        <h1>New space</h1>
      </div>
      <form className="form-grid panel" onSubmit={submit}>
        <label className="field">
          <span>Name</span>
          <input id="space-name" className="input" maxLength={50} required value={name} onChange={(e) => setName(e.target.value)} placeholder="Riverside Runners" />
        </label>
        <div className="field">
          <span className="field-label">Icon</span>
          <div className="chips">
            {['🌿', '🥾', '📚', '🎮', '🎨', '🍳', '🔭', '🏃', '🎶', '🐾', '🧶', '⚽'].map((x) => (
              <button type="button" key={x} className="chip" aria-pressed={emoji === x} onClick={() => setEmoji(x)}>
                {x}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>What is it about?</span>
          <textarea id="space-desc" className="textarea" maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <div className="field">
          <span className="field-label">Who can join</span>
          <Segmented label="Who can join" value={visibility} onChange={setVisibility} options={[{ value: 'public', label: 'Anyone' }, { value: 'private', label: 'Invite only' }]} />
        </div>
        <div className="field">
          <span className="field-label">Topics</span>
          <div className="chips">
            {(meta?.topics ?? []).map((t) => (
              <button type="button" key={t.id} className="chip" aria-pressed={topics.includes(t.id)} onClick={() => setTopics((list) => (list.includes(t.id) ? list.filter((x) => x !== t.id) : list.length < 5 ? [...list, t.id] : list))}>
                {t.emoji} {t.label}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>Where (optional)</span>
          <input id="space-location" className="input" maxLength={80} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City, neighbourhood or Online" />
        </label>
        <label className="field">
          <span>Rules (one per line)</span>
          <textarea id="space-rules" className="textarea" value={rules} onChange={(e) => setRules(e.target.value)} />
        </label>
        {error && <div className="field-error">{error}</div>}
        <button className="btn btn-primary" disabled={name.trim().length < 3}>
          Create space
        </button>
      </form>
    </>
  );
}
