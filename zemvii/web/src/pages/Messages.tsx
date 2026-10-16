// Messages: chats, requests, conversations.

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, BellOff, CalendarHeart, Flag, Inbox, LogOut, MoreHorizontal, PenSquare, Search, Send, ShieldCheck } from 'lucide-react';
import type { ConversationView, MessageView, UserSummary } from '../../../server/src/services/views.ts';
import { api, errorMessage } from '../api/client.ts';
import { invalidate, useApi, useDebounced } from '../lib/hooks.ts';
import { back, Link, navigate } from '../lib/router.tsx';
import { useSession } from '../lib/session.tsx';
import { clock, timeAgo } from '../lib/format.ts';
import { RichText } from '../components/RichText.tsx';
import { ReportSheet } from '../components/PostSheets.tsx';
import { LiveToneHint, ToneNudge, useToneGuard } from '../components/Tone.tsx';
import { Avatar, Empty, ErrorNote, Segmented, Sheet, Spinner, UserRow, useToast } from '../components/ui.tsx';
import { PlanCard } from './Community.tsx';

function ConversationAvatar({ c }: { c: ConversationView }) {
  if (c.members.length === 0) return <span className="avatar avatar-initials" style={{ width: 46, height: 46, ['--h' as string]: '160' }}>·</span>;
  if (c.members.length === 1) return <Avatar user={c.members[0]} size={46} />;
  return (
    <span className="avatar-pair" aria-hidden="true">
      <Avatar user={c.members[0]} size={32} />
      <Avatar user={c.members[1]} size={32} />
    </span>
  );
}

export function Messages() {
  const list = useApi<{ items: ConversationView[] }>('/conversations', { poll: 8000 });
  const [tab, setTab] = useState<'chats' | 'requests'>('chats');
  const items = list.data?.items ?? [];
  const chats = items.filter((c) => c.accepted);
  const requests = items.filter((c) => !c.accepted);
  const shown = tab === 'chats' ? chats : requests;
  return (
    <>
      <div className="page-head">
        <h1>Messages</h1>
        <Link to="/messages/new" className="btn btn-primary btn-small">
          <PenSquare size={16} /> New
        </Link>
      </div>
      <Segmented
        label="Messages"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'chats', label: 'Chats' },
          { value: 'requests', label: `Requests${requests.length ? ` (${requests.length})` : ''}` },
        ]}
      />
      {tab === 'requests' && (
        <div className="info-note">
          <ShieldCheck size={18} />
          <span>Messages from people you don't know wait here. They can't see whether you've read them. Teens never get requests from adults they don't know.</span>
        </div>
      )}
      {list.loading && <Spinner />}
      <ErrorNote error={list.error} retry={list.reload} />
      {list.data && shown.length === 0 && (
        <Empty icon={<Inbox size={26} />} title={tab === 'chats' ? 'No chats yet' : 'No requests'}>
          {tab === 'chats' ? 'Start a conversation with someone you follow, or a group chat with one of your circles.' : 'All clear.'}
        </Empty>
      )}
      <div className="panel panel-flush list">
        {shown.map((c) => (
          <Link key={c.id} to={`/messages/${c.id}`} className="list-item convo-item">
            <ConversationAvatar c={c} />
            <div className="grow convo-text">
              <div className="row-between">
                <strong className="convo-title">{c.title}</strong>
                {c.lastMessage && <span className="muted small">{timeAgo(c.lastMessage.createdAt)}</span>}
              </div>
              <span className={`convo-preview${c.unread ? ' is-unread' : ''}`}>{c.lastMessage?.text ?? 'No messages yet'}</span>
            </div>
            {c.unread > 0 && c.accepted && <span className="pill pill-spark num">{c.unread}</span>}
            {c.muted && <BellOff size={15} className="muted" aria-label="Muted" />}
          </Link>
        ))}
      </div>
    </>
  );
}

export function NewMessage() {
  const { me } = useSession();
  const toast = useToast();
  const [q, setQ] = useState('');
  const debounced = useDebounced(q, 250);
  const results = useApi<{ people: UserSummary[] }>(debounced.trim() ? `/search?q=${encodeURIComponent(debounced.trim())}` : null);
  const following = useApi<{ items: UserSummary[] }>(me ? `/users/${me.handle}/following` : null);
  const [picked, setPicked] = useState<UserSummary[]>([]);
  const [title, setTitle] = useState('');
  const people = (debounced.trim() ? results.data?.people : following.data?.items)?.filter((u) => u.id !== me?.id) ?? [];
  const start = async (e?: FormEvent) => {
    e?.preventDefault();
    try {
      const chat = await api.post<{ id: string }>('/conversations', { handles: picked.map((p) => p.handle), title: picked.length > 1 ? title : undefined });
      navigate(`/messages/${chat.id}`, { replace: true });
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };
  return (
    <>
      <div className="page-head">
        <button className="icon-btn back-btn" onClick={() => back('/messages')} aria-label="Back">
          <ArrowLeft size={22} />
        </button>
        <h1>New message</h1>
      </div>
      {picked.length > 0 && (
        <div className="chips">
          {picked.map((p) => (
            <button key={p.id} className="chip is-on" onClick={() => setPicked((list) => list.filter((x) => x.id !== p.id))}>
              {p.name} ×
            </button>
          ))}
        </div>
      )}
      {picked.length > 1 && (
        <label className="field">
          <span>Group name (optional)</span>
          <input id="group-title" className="input" maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Weekend crew" />
        </label>
      )}
      <div className="search-box">
        <Search size={18} aria-hidden="true" />
        <label htmlFor="msg-search" className="sr-only">
          Search people
        </label>
        <input id="msg-search" className="input" placeholder="Search people" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="panel">
        {!debounced && <span className="eyebrow">People you follow</span>}
        {people.map((u) => (
          <UserRow
            key={u.id}
            user={u}
            action={
              <button className={`btn btn-small ${picked.some((p) => p.id === u.id) ? 'btn-soft' : 'btn-secondary'}`} onClick={() => setPicked((list) => (list.some((p) => p.id === u.id) ? list.filter((p) => p.id !== u.id) : [...list, u]))}>
                {picked.some((p) => p.id === u.id) ? 'Added' : 'Add'}
              </button>
            }
          />
        ))}
        {people.length === 0 && <p className="muted">No one found.</p>}
      </div>
      <button className="btn btn-primary" disabled={picked.length === 0} onClick={() => void start()}>
        {picked.length > 1 ? 'Start group chat' : 'Start chat'}
      </button>
    </>
  );
}

export function Conversation({ id }: { id: string }) {
  const { refresh } = useSession();
  const toast = useToast();
  const convo = useApi<ConversationView>(`/conversations/${id}`);
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState('');
  const [menu, setMenu] = useState(false);
  const [report, setReport] = useState(false);
  const guard = useToneGuard();
  const bottom = useRef<HTMLDivElement>(null);
  const latest = useRef(0);

  useEffect(() => {
    let alive = true;
    const load = async (initial: boolean) => {
      try {
        const page = await api.get<{ items: MessageView[] }>(`/conversations/${id}/messages${initial ? '' : `?after=${latest.current}`}`);
        if (!alive) return;
        if (initial) setMessages(page.items);
        else if (page.items.length) setMessages((list) => [...list, ...page.items.filter((m) => !list.some((x) => x.id === m.id))]);
        if (page.items.length) {
          latest.current = Math.max(latest.current, ...page.items.map((m) => m.createdAt));
          void api.post(`/conversations/${id}/read`).then(() => refresh()).catch(() => {});
        }
        setLoaded(true);
      } catch (e) {
        if (initial) toast(errorMessage(e), 'error');
      }
    };
    latest.current = 0;
    void load(true);
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') void load(false);
    }, 2500);
    return () => {
      alive = false;
      clearInterval(poll);
    };
  }, [id]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const send = (confirmTone = false) =>
    guard.run(async () => {
      const message = await api.post<MessageView>(`/conversations/${id}/messages`, { text, confirmTone });
      setText('');
      latest.current = Math.max(latest.current, message.createdAt);
      setMessages((list) => [...list, message]);
      invalidate('/conversations');
    });

  const c = convo.data;
  const answer = async (accept: boolean) => {
    await api.post(`/conversations/${id}/request`, { accept });
    invalidate('/conversations');
    if (accept) void convo.reload();
    else navigate('/messages', { replace: true });
  };

  let lastDay = '';
  return (
    <div className="conversation">
      <div className="page-head convo-head">
        <button className="icon-btn back-btn" onClick={() => back('/messages')} aria-label="Back">
          <ArrowLeft size={22} />
        </button>
        {c && <ConversationAvatar c={c} />}
        <h1 className="convo-name">{c?.title ?? 'Chat'}</h1>
        <button className="icon-btn" aria-label="Chat options" onClick={() => setMenu(true)}>
          <MoreHorizontal size={20} />
        </button>
      </div>
      {c && !c.accepted && (
        <div className="panel">
          <strong>Message request</strong>
          <p className="muted small">Accept to reply. If you decline, the chat disappears and they won't be told.</p>
          <div className="row">
            <button className="btn btn-primary btn-small" onClick={() => answer(true)}>
              Accept
            </button>
            <button className="btn btn-ghost btn-small" onClick={() => answer(false)}>
              Decline
            </button>
          </div>
        </div>
      )}
      <div className="messages" aria-live="polite">
        {!loaded && <Spinner />}
        {loaded && messages.length === 0 && <p className="muted center">Say hi 👋</p>}
        {messages.map((m) => {
          const day = new Date(m.createdAt).toDateString();
          const showDay = day !== lastDay;
          lastDay = day;
          return (
            <div key={m.id}>
              {showDay && <div className="day-divider">{new Date(m.createdAt).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}</div>}
              <div className={`bubble-row${m.mine ? ' mine' : ''}`}>
                {!m.mine && <Avatar user={m.sender} size={28} />}
                <div className="bubble-col">
                  {!m.mine && c && c.members.length > 1 && <span className="bubble-name">{m.sender.name.split(' ')[0]}</span>}
                  {m.text && (
                    <div className="bubble">
                      <RichText text={m.text} />
                    </div>
                  )}
                  {m.media.map((media) => (media.url ? <img key={media.id} className="bubble-media" src={media.url} alt={media.alt ?? ''} /> : null))}
                  {m.plan && (
                    <div className="bubble-plan">
                      <PlanCard plan={m.plan} compact />
                    </div>
                  )}
                  <span className="bubble-time">{clock(m.createdAt)}</span>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      {c?.accepted !== false && (
        <form
          className="composer-bar"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) void send();
          }}
        >
          <div className="grow stack" style={{ gap: 6 }}>
            {guard.nudge && <ToneNudge tone={guard.nudge} onEdit={guard.clear} onPostAnyway={() => void send(true)} />}
            <LiveToneHint text={text} />
            <label htmlFor="msg-input" className="sr-only">
              Message
            </label>
            <input id="msg-input" className="input" placeholder="Message" autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <Link to={`/plans/new?chat=${id}`} className="icon-btn" aria-label="Make a plan with this chat">
            <CalendarHeart size={20} />
          </Link>
          <button className="btn btn-primary" disabled={!text.trim() || guard.busy} aria-label="Send">
            <Send size={18} />
          </button>
        </form>
      )}
      {menu && c && (
        <Sheet title={c.title} onClose={() => setMenu(false)}>
          <div className="panel">
            {c.members.map((m) => (
              <UserRow key={m.id} user={m} />
            ))}
          </div>
          <div className="list panel panel-flush">
            <button
              className="list-item"
              onClick={async () => {
                await api.post(`/conversations/${id}/mute`, { muted: !c.muted });
                setMenu(false);
                void convo.reload();
                toast(c.muted ? 'Unmuted' : 'Muted. No badges from this chat.');
              }}
            >
              <BellOff size={18} /> {c.muted ? 'Unmute chat' : 'Mute chat'}
            </button>
            {messages.some((m) => !m.mine) && (
              <button
                className="list-item"
                onClick={() => {
                  setMenu(false);
                  setReport(true);
                }}
              >
                <Flag size={18} /> Report the last message
              </button>
            )}
            <button
              className="list-item"
              onClick={async () => {
                await api.del(`/conversations/${id}`);
                invalidate('/conversations');
                navigate('/messages', { replace: true });
              }}
            >
              <LogOut size={18} /> Leave chat
            </button>
          </div>
        </Sheet>
      )}
      {report && (
        <ReportSheet
          targetType="message"
          targetId={[...messages].reverse().find((m) => !m.mine)!.id}
          handle={[...messages].reverse().find((m) => !m.mine)?.sender.handle}
          onClose={() => setReport(false)}
        />
      )}
    </div>
  );
}
