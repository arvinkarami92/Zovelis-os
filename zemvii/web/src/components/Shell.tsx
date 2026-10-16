// The app frame: navigation, the tools rail, and the wellbeing layer
// (time tracking, intent prompt, daily time check).

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  Bell, CalendarHeart, Clapperboard, Coins, Compass, Home, Info, LogOut, Menu, MessageCircle, PenSquare, Plus, Settings,
  ShieldCheck, Sparkles, Sprout, UsersRound,
} from 'lucide-react';
import type { BudgetStatus } from '../../../server/src/core/wellbeing.ts';
import type { PlanView, UserSummary } from '../../../server/src/services/views.ts';
import { api } from '../api/client.ts';
import { useApi } from '../lib/hooks.ts';
import { Link, navigate, useRoute } from '../lib/router.tsx';
import { useSession } from '../lib/session.tsx';
import { minutes, planWhen } from '../lib/format.ts';
import { Avatar, Sheet, UserRow } from './ui.tsx';
import { ComposeSheet } from './Composer.tsx';
import { describeDials } from './FeedDials.tsx';

export function LogoMark({ size = 30 }: { size?: number }) {
  // Each copy needs its own gradient id: a gradient inside a hidden copy (the
  // desktop rail on phones) would otherwise leave the visible copy blank.
  const id = `zv-logo-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#17c493" />
          <stop offset="1" stopColor="#0a6a7e" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill={`url(#${id})`} />
      <path d="M19.5 21.5h24c1.7 0 2.5 2 1.4 3.2L22.1 41.3c-1.1 1.2-.3 3.2 1.4 3.2H45" fill="none" stroke="#fff" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="47.5" cy="16.5" r="4.6" fill="#ff7a5c" />
    </svg>
  );
}

export function Logo({ to = '/home' }: { to?: string }) {
  return (
    <Link to={to} className="logo" aria-label="Zemvii home">
      <LogoMark />
      <span className="logo-word">
        zemv<em>ii</em>
      </span>
    </Link>
  );
}

export function Ring({ fraction, size = 30, stroke = 4, label }: { fraction: number; size?: number; stroke?: number; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, fraction));
  const over = fraction >= 1;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} className="ring">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
      {clamped > 0.005 && <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={over ? 'var(--spark)' : 'var(--brand)'}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${c * clamped} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />}
    </svg>
  );
}

// ---- Wellbeing: heartbeat, intent prompt, time check -------------------------------------

function useHeartbeat(enabled: boolean): BudgetStatus | null {
  const [status, setStatus] = useState<BudgetStatus | null>(null);
  const lastActive = useRef(Date.now());
  const pending = useRef(0);
  const first = useRef(true);
  useEffect(() => {
    if (!enabled) return;
    const mark = () => (lastActive.current = Date.now());
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'mousemove'];
    for (const e of events) addEventListener(e, mark, { passive: true });
    const tick = setInterval(() => {
      // Count a second only when the app is visible and was used in the last minute.
      if (document.visibilityState === 'visible' && Date.now() - lastActive.current < 60_000) pending.current += 1;
    }, 1000);
    const send = async () => {
      const seconds = Math.min(120, pending.current);
      pending.current -= seconds;
      try {
        setStatus(await api.post<BudgetStatus>('/wellbeing/heartbeat', { seconds, newSession: first.current }));
        first.current = false;
      } catch {
        pending.current += seconds;
      }
    };
    void send();
    const beat = setInterval(() => void send(), 30_000);
    return () => {
      for (const e of events) removeEventListener(e, mark);
      clearInterval(tick);
      clearInterval(beat);
    };
  }, [enabled]);
  return status;
}

function readFlag(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeFlag(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // ignore: the prompt may show again after a reload
  }
}

function IntentPrompt({ onClose }: { onClose: () => void }) {
  const { meta } = useSession();
  const choose = (id: string, route: string) => {
    void api.post('/wellbeing/intent', { intent: id }).catch(() => {});
    onClose();
    navigate(route);
  };
  return (
    <Sheet title="What brings you here?" onClose={onClose}>
      <p className="muted">Pick one and we'll take you straight there. You can switch this question off in Wellbeing.</p>
      <div className="intent-grid">
        {(meta?.intents ?? []).map((i) => (
          <button key={i.id} className="intent" onClick={() => choose(i.id, i.route)}>
            <span className="intent-emoji" aria-hidden="true">
              {i.emoji}
            </span>
            {i.label}
          </button>
        ))}
      </div>
      <button className="btn btn-ghost" onClick={onClose}>
        Just looking around
      </button>
    </Sheet>
  );
}

function TimeCheck({ status, onSnooze, onClose }: { status: BudgetStatus; onSnooze: () => void; onClose: () => void }) {
  const [wrapped, setWrapped] = useState(false);
  return (
    <div className="timecheck" role="dialog" aria-modal="true" aria-labelledby="timecheck-title">
      <div className="timecheck-card">
        {wrapped ? (
          <>
            <div className="breathe" aria-hidden="true" />
            <h2 id="timecheck-title">See you later</h2>
            <p>Nothing important will be missed: messages from friends still come through, and everything else waits for your next digest.</p>
            <button className="btn btn-secondary" onClick={onClose}>
              I'm back for a moment
            </button>
          </>
        ) : (
          <>
            <Ring fraction={status.fraction} size={84} stroke={8} label={`${status.usedMin} of ${status.budgetMin} minutes`} />
            <h2 id="timecheck-title">You've reached your {minutes(status.budgetMin)} for today</h2>
            <p>You set this budget yourself. Want to wrap up?</p>
            <div className="stack">
              <button className="btn btn-primary" onClick={() => setWrapped(true)}>
                Wrap up for today
              </button>
              <button className="btn btn-secondary" onClick={onSnooze}>
                10 more minutes
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  onClose();
                  navigate('/wellbeing');
                }}
              >
                Change my budget
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---- Navigation ------------------------------------------------------------------------

interface NavItem {
  to: string;
  label: string;
  icon: typeof Home;
  count?: number;
}

function useNav(): NavItem[] {
  const { me, counts } = useSession();
  const items: NavItem[] = [
    { to: '/home', label: 'Home', icon: Home },
    { to: '/discover', label: 'Discover', icon: Compass },
    { to: '/clips', label: 'Clips', icon: Clapperboard },
    { to: '/plans', label: 'Plans', icon: CalendarHeart },
    { to: '/spaces', label: 'Spaces', icon: UsersRound },
    { to: '/messages', label: 'Messages', icon: MessageCircle, count: counts.messages },
    { to: '/notifications', label: 'Notifications', icon: Bell, count: counts.notifications + counts.followRequests + counts.recoveryRequests },
    { to: '/wellbeing', label: 'Wellbeing', icon: Sprout },
    { to: '/creator', label: 'Creator', icon: Coins },
    { to: '/settings', label: 'Settings', icon: Settings },
  ];
  if (me?.role === 'admin') items.push({ to: '/moderation', label: 'Moderation', icon: ShieldCheck });
  items.push({ to: '/why', label: 'Why Zemvii', icon: Sparkles });
  return items;
}

const isActive = (path: string, to: string) => path === to || (to !== '/home' && path.startsWith(`${to}/`));

function Aside({ budget }: { budget: BudgetStatus | null }) {
  const { me } = useSession();
  const { path } = useRoute();
  const plans = useApi<{ items: PlanView[] }>('/plans?scope=mine');
  const people = useApi<{ items: Array<{ user: UserSummary; reason: string }> }>('/users/suggested');
  if (!me) return null;
  const upcoming = (plans.data?.items ?? []).filter((p) => p.startsAt > Date.now() - 3 * 3_600_000 && !p.cancelled).slice(0, 3);
  return (
    <aside className="aside" aria-label="Your day">
      <Link to="/wellbeing" className="panel today-panel">
        <div className="row">
          <Ring fraction={budget?.fraction ?? 0} size={48} stroke={6} />
          <div className="grow">
            <span className="eyebrow">Today on Zemvii</span>
            <div className="today-num num">
              {budget ? `${budget.usedMin} min` : '…'}
              {budget && budget.budgetMin > 0 && <span className="muted"> of {budget.budgetMin}</span>}
            </div>
          </div>
        </div>
      </Link>
      {path.startsWith('/home') && (
        <div className="panel">
          <span className="eyebrow">Your Mix right now</span>
          <p className="small">{describeDials(me.settings.feed)}</p>
          <Link to="/dials" className="small">
            Tune Feed Dials →
          </Link>
        </div>
      )}
      {upcoming.length > 0 && (
        <div className="panel">
          <span className="eyebrow">Your plans</span>
          {upcoming.map((p) => (
            <Link key={p.id} to={`/plans/${p.id}`} className="aside-plan">
              <span className="aside-plan-emoji" aria-hidden="true">
                {p.emoji}
              </span>
              <span className="grow">
                <strong>{p.title}</strong>
                <span className="muted small">{planWhen(p.startsAt)}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
      {(people.data?.items.length ?? 0) > 0 && (
        <div className="panel">
          <span className="eyebrow">People you may know</span>
          {people.data!.items.slice(0, 3).map(({ user, reason }) => (
            <UserRow key={user.id} user={user} sub={reason} />
          ))}
          <Link to="/discover" className="small">
            See more →
          </Link>
        </div>
      )}
      <p className="aside-foot small muted">
        No tracking ads. No infinite scroll. <Link to="/why">Why Zemvii</Link> · <Link to="/settings/data">Your data</Link>
      </p>
    </aside>
  );
}

export function Shell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  const { me, demo } = useSession();
  const { path } = useRoute();
  const nav = useNav();
  const [compose, setCompose] = useState(false);
  const [intent, setIntent] = useState(false);
  const [timeCheck, setTimeCheck] = useState(false);
  const snoozedUntil = useRef(0);
  const budget = useHeartbeat(Boolean(me));

  useEffect(() => {
    if (!me || !me.settings.wellbeing.intentPrompt || readFlag('zv-intent')) return;
    writeFlag('zv-intent', '1');
    if (path === '/home') setIntent(true);
  }, [me?.id]);

  useEffect(() => {
    if (!budget || budget.state !== 'over' || Date.now() < snoozedUntil.current || readFlag('zv-timecheck-dismissed')) return;
    setTimeCheck(true);
  }, [budget]);

  useEffect(() => {
    const open = () => setCompose(true);
    addEventListener('zemvii:compose', open);
    return () => removeEventListener('zemvii:compose', open);
  }, []);

  if (!me) return <>{children}</>;
  const mobileTabs = [nav[0], nav[1], null, nav[3], nav[5]];

  return (
    <div className="shell">
      <nav className="rail" aria-label="Main">
        <Logo />
        <div className="rail-nav">
          {nav.map((item) => (
            <Link key={item.to} to={item.to} className="rail-link" aria-current={isActive(path, item.to) ? 'page' : undefined} title={item.label}>
              <item.icon size={22} aria-hidden="true" />
              <span className="rail-label">{item.label}</span>
              {item.count ? (
                <>
                  <span className="count">{item.count > 99 ? '99+' : item.count}</span>
                  <span className="mini-dot" />
                </>
              ) : null}
            </Link>
          ))}
        </div>
        <button className="btn btn-primary rail-compose" onClick={() => setCompose(true)} aria-label="New post">
          <PenSquare size={18} /> <span className="rail-label">New post</span>
        </button>
        {demo && (
          <span className="pill pill-ai rail-label" title="Everything runs in your browser with fictional people.">
            <Info size={12} /> Demo world
          </span>
        )}
        <Link to={`/u/${me.handle}`} className="rail-me">
          <Avatar user={me} size={38} />
          <span className="rail-me-text grow">
            <strong>{me.name}</strong>
            <span className="muted small"> @{me.handle}</span>
          </span>
        </Link>
      </nav>

      <header className="topbar">
        <Logo />
        <Link to="/wellbeing" className="icon-btn" aria-label={`Time today: ${budget?.usedMin ?? 0} minutes`}>
          <Ring fraction={budget?.fraction ?? 0} size={26} stroke={3.5} />
        </Link>
        <Link to="/notifications" className="icon-btn" aria-label="Notifications">
          <Bell size={22} />
          {nav[6].count ? <span className="badge-dot">{nav[6].count > 99 ? '99+' : nav[6].count}</span> : null}
        </Link>
        <Link to="/menu" className="icon-btn" aria-label="Menu">
          <Menu size={22} />
        </Link>
      </header>

      <main className={`main${wide ? ' main-wide' : ''}`} id="main">
        {children}
      </main>

      {!wide && <Aside budget={budget} />}

      <nav className="tabbar" aria-label="Main">
        {mobileTabs.map((item) =>
          item ? (
            <Link key={item.to} to={item.to} className="tab" aria-current={isActive(path, item.to) ? 'page' : undefined}>
              <item.icon size={22} aria-hidden="true" />
              {item.label}
              {item.count ? <span className="badge-dot">{item.count > 99 ? '99+' : item.count}</span> : null}
            </Link>
          ) : (
            <button key="create" className="tab tab-create" onClick={() => setCompose(true)} aria-label="New post" style={{ border: 0, background: 'none' }}>
              <span className="fab">
                <Plus size={24} />
              </span>
            </button>
          ),
        )}
      </nav>

      {compose && <ComposeSheet onClose={() => setCompose(false)} />}
      {intent && <IntentPrompt onClose={() => setIntent(false)} />}
      {timeCheck && budget && (
        <TimeCheck
          status={budget}
          onSnooze={() => {
            snoozedUntil.current = Date.now() + 10 * 60_000;
            setTimeCheck(false);
          }}
          onClose={() => {
            writeFlag('zv-timecheck-dismissed', '1');
            setTimeCheck(false);
          }}
        />
      )}
    </div>
  );
}

export function MenuLinks() {
  const { me, logout, demo } = useSession();
  const nav = useNav();
  if (!me) return null;
  return (
    <div className="stack-lg">
      <Link to={`/u/${me.handle}`} className="panel row" style={{ textDecoration: 'none' }}>
        <Avatar user={me} size={52} />
        <div className="grow">
          <strong>{me.name}</strong>
          <div className="muted small">@{me.handle} · View your profile</div>
        </div>
      </Link>
      <div className="panel panel-flush list">
        {nav.map((item) => (
          <Link key={item.to} to={item.to} className="list-item">
            <item.icon size={20} /> <span className="grow">{item.label}</span>
            {item.count ? <span className="pill pill-spark num">{item.count}</span> : null}
          </Link>
        ))}
        <Link to="/circles" className="list-item">
          <UsersRound size={20} /> <span className="grow">Circles</span>
        </Link>
        <Link to="/saved" className="list-item">
          <Sparkles size={20} /> <span className="grow">Saved posts</span>
        </Link>
      </div>
      <button className="btn btn-secondary" onClick={() => void logout().then(() => navigate('/'))}>
        <LogOut size={18} /> Log out
      </button>
      {demo && <p className="muted small">You're in the demo world. Everything runs in this browser with fictional people.</p>}
    </div>
  );
}
